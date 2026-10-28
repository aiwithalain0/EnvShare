
from pathlib import Path

from sqlalchemy import create_engine, inspect, select, text

from database import Base, engine as neon_engine
import models  # noqa: F401 - registers all ORM models with Base.metadata


# Always migrate from this exact local SQLite file.
SQLITE_PATH = Path(__file__).resolve().parent / "envshare.db"

# Foreign-key-safe order for the current EnvShare schema.
TABLE_ORDER = [
    "users",
    "projects",
    "project_members",
    "invite_codes",
    "environments",
    "variables",
    "variable_versions",
    "audit_events",
]


def main():
    if not SQLITE_PATH.is_file():
        raise FileNotFoundError(
            f"Local SQLite database was not found: {SQLITE_PATH}"
        )

    if neon_engine.dialect.name != "postgresql":
        raise RuntimeError(
            "Safety stop: DATABASE_URL is not pointing to PostgreSQL. "
            "Check your backend .env configuration."
        )

    sqlite_engine = create_engine(
        "sqlite:///" + SQLITE_PATH.as_posix()
    )

    try:
        source_tables = set(inspect(sqlite_engine).get_table_names())
        target_tables = set(inspect(neon_engine).get_table_names())

        missing_source = set(TABLE_ORDER) - source_tables
        missing_target = set(TABLE_ORDER) - target_tables

        if missing_source:
            raise RuntimeError(
                f"SQLite is missing expected tables: {sorted(missing_source)}"
            )

        if missing_target:
            raise RuntimeError(
                f"Neon is missing expected tables: {sorted(missing_target)}"
            )

        metadata_tables = Base.metadata.tables

        # Confirm every destination table is empty before copying anything.
        with neon_engine.connect() as target:
            existing_rows = {}
            for table_name in TABLE_ORDER:
                table = metadata_tables[table_name]
                count = target.execute(
                    select(text("COUNT(*)")).select_from(table)
                ).scalar_one()
                existing_rows[table_name] = count

        if any(existing_rows.values()):
            raise RuntimeError(
                "Safety stop: Neon is not empty. No data was copied. "
                f"Existing row counts: {existing_rows}"
            )

        # Read source rows and prepare data before starting the target write.
        source_rows = {}
        source_counts = {}

        with sqlite_engine.connect() as source:
            for table_name in TABLE_ORDER:
                table = metadata_tables[table_name]
                rows = source.execute(select(table)).mappings().all()
                source_rows[table_name] = [dict(row) for row in rows]
                source_counts[table_name] = len(rows)

        print("Source SQLite row counts:")
        for table_name in TABLE_ORDER:
            print(f"  {table_name}: {source_counts[table_name]}")

        print(f"\nTotal source rows: {sum(source_counts.values())}")
        print("\nStarting Neon migration...")

        # One transaction: if an insert fails, all inserts are rolled back.
        with neon_engine.begin() as target:
            for table_name in TABLE_ORDER:
                rows = source_rows[table_name]
                if not rows:
                    continue

                table = metadata_tables[table_name]
                target.execute(table.insert(), rows)
                print(f"Copied {len(rows)} rows into {table_name}")

            # Explicit IDs do not automatically advance PostgreSQL sequences.
            # Reset the sequence for each table that has an integer 'id'.
            for table_name in TABLE_ORDER:
                table = metadata_tables[table_name]
                if "id" not in table.c:
                    continue

                quoted_table = '"' + table_name.replace('"', '""') + '"'
                target.execute(
                    text(
                        "SELECT setval("
                        "pg_get_serial_sequence(:table_name, 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM {quoted_table}), 1), "
                        f"(SELECT MAX(id) IS NOT NULL FROM {quoted_table})"
                        ")"
                    ),
                    {"table_name": table_name},
                )

            # Verify counts inside the same transaction before committing.
            for table_name in TABLE_ORDER:
                table = metadata_tables[table_name]
                target_count = target.execute(
                    select(text("COUNT(*)")).select_from(table)
                ).scalar_one()

                if target_count != source_counts[table_name]:
                    raise RuntimeError(
                        f"Row-count mismatch for {table_name}: "
                        f"SQLite={source_counts[table_name]}, "
                        f"Neon={target_count}. Rolling back."
                    )

        print("\nMigration transaction committed.")
        print("Final Neon row counts:")
        with neon_engine.connect() as target:
            for table_name in TABLE_ORDER:
                table = metadata_tables[table_name]
                count = target.execute(
                    select(text("COUNT(*)")).select_from(table)
                ).scalar_one()
                print(f"  {table_name}: {count}")

        print("\nMigration completed and row counts verified.")
        print("The original SQLite database was not modified.")

    finally:
        sqlite_engine.dispose()


if __name__ == "__main__":
    main()
