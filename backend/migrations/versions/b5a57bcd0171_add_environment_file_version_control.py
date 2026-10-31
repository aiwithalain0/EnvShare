"""add environment file version control

Revision ID: b5a57bcd0171
Revises: 05137a9d5897
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision: str = "b5a57bcd0171"
down_revision: Union[str, Sequence[str], None] = "05137a9d5897"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    existing = set(inspector.get_table_names())

    if "environment_files" not in existing:
        op.create_table(
            "environment_files",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "environment_id",
                sa.Integer(),
                sa.ForeignKey("environments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("filename", sa.String(255), nullable=False),
            sa.Column(
                "created_by",
                sa.Integer(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column(
                "is_deleted",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
            sa.Column("deleted_at", sa.DateTime(timezone=True)),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    inspector = inspect(op.get_bind())
    if "file_commits" not in inspector.get_table_names():
        op.create_table(
            "file_commits",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "environment_id",
                sa.Integer(),
                sa.ForeignKey("environments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "author_id",
                sa.Integer(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column("message", sa.String(200), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
        )

    inspector = inspect(op.get_bind())
    if "file_versions" not in inspector.get_table_names():
        op.create_table(
            "file_versions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "file_id",
                sa.Integer(),
                sa.ForeignKey("environment_files.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("content_ciphertext", sa.Text(), nullable=False),
            sa.Column(
                "author_id",
                sa.Integer(),
                sa.ForeignKey("users.id"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.UniqueConstraint(
                "file_id",
                "version_number",
                name="uq_file_version_number",
            ),
        )

    inspector = inspect(op.get_bind())
    if "commit_files" not in inspector.get_table_names():
        op.create_table(
            "commit_files",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column(
                "commit_id",
                sa.Integer(),
                sa.ForeignKey("file_commits.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "file_id",
                sa.Integer(),
                sa.ForeignKey("environment_files.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "version_id",
                sa.Integer(),
                sa.ForeignKey("file_versions.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("filename_at_commit", sa.String(255), nullable=False),
            sa.Column("change_type", sa.String(20), nullable=False),
            sa.UniqueConstraint(
                "commit_id",
                "file_id",
                name="uq_commit_file",
            ),
        )

    inspector = inspect(op.get_bind())
    indexes = {
        (table, index["name"])
        for table in inspector.get_table_names()
        for index in inspector.get_indexes(table)
    }

    for table, name, columns in [
        ("environment_files", "ix_environment_files_environment_id", ["environment_id"]),
        ("file_commits", "ix_file_commits_environment_id", ["environment_id"]),
        ("file_versions", "ix_file_versions_file_id", ["file_id"]),
        ("commit_files", "ix_commit_files_commit_id", ["commit_id"]),
        ("commit_files", "ix_commit_files_file_id", ["file_id"]),
    ]:
        if (table, name) not in indexes:
            op.create_index(name, table, columns)

    inspector = inspect(op.get_bind())
    if ("environment_files", "uq_active_environment_filename") not in {
        (table, index["name"])
        for table in inspector.get_table_names()
        for index in inspector.get_indexes(table)
    }:
        op.create_index(
            "uq_active_environment_filename",
            "environment_files",
            ["environment_id", "filename"],
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
            sqlite_where=text("deleted_at IS NULL"),
        )




def downgrade() -> None:
    """Preserve file tables and data created before Alembic tracked them."""
    pass
