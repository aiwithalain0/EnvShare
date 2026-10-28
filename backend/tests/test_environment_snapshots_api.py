from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import EnvironmentSnapshot, Variable, VariableVersion


def test_snapshot_rollback_restores_secret_and_preserves_history():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(
        bind=test_engine,
        autoflush=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            user = {
                "email": "snapshot-test@example.com",
                "password": "FakeSnapshotPassword123",
            }
            assert client.post("/auth/register", json=user).status_code == 201
            login = client.post("/auth/login", json=user)
            assert login.status_code == 200
            client.headers.update(
                {"Authorization": f"Bearer {login.json()['access_token']}"}
            )

            project_response = client.post(
                "/projects", json={"name": "Snapshot Test Project"}
            )
            assert project_response.status_code == 201
            project_id = project_response.json()["id"]

            environment_response = client.post(
                f"/projects/{project_id}/environments",
                json={"name": "Development"},
            )
            assert environment_response.status_code == 201
            environment_id = environment_response.json()["id"]

            variables_url = (
                f"/projects/{project_id}/environments/"
                f"{environment_id}/variables"
            )
            original_secret = "fake-original-snapshot-secret"
            changed_secret = "fake-changed-snapshot-secret"

            created = client.post(
                variables_url,
                json={
                    "key": "DEMO_API_KEY",
                    "value": original_secret,
                    "is_sensitive": True,
                },
            )
            assert created.status_code == 201
            variable_id = created.json()["id"]

            snapshots_url = (
                f"/projects/{project_id}/environments/"
                f"{environment_id}/snapshots"
            )
            saved = client.post(snapshots_url, json={"name": "Before change"})
            assert saved.status_code == 201
            snapshot_id = saved.json()["id"]
            assert "snapshot_data" not in saved.json()
            assert original_secret not in saved.text

            updated = client.put(
                f"{variables_url}/{variable_id}",
                json={"value": changed_secret, "is_sensitive": True},
            )
            assert updated.status_code == 200

            rollback_url = (
                f"{snapshots_url}/{snapshot_id}/rollback"
            )
            rolled_back = client.post(rollback_url)
            assert rolled_back.status_code == 200
            assert original_secret not in rolled_back.text
            assert changed_secret not in rolled_back.text

            reveal = client.get(f"{variables_url}/{variable_id}/reveal")
            assert reveal.status_code == 200
            assert reveal.json()["value"] == original_secret

            listing = client.get(snapshots_url)
            assert listing.status_code == 200
            assert len(listing.json()) == 1
            assert "snapshot_data" not in listing.json()[0]
            assert original_secret not in listing.text

            with TestSessionLocal() as db:
                variable = db.scalar(
                    select(Variable).where(Variable.id == variable_id)
                )
                assert variable is not None

                versions = list(
                    db.scalars(
                        select(VariableVersion).where(
                            VariableVersion.variable_id == variable_id
                        )
                    ).all()
                )
                assert len(versions) >= 2

                snapshot = db.scalar(
                    select(EnvironmentSnapshot).where(
                        EnvironmentSnapshot.id == snapshot_id
                    )
                )
                assert snapshot is not None
                assert original_secret not in str(snapshot.snapshot_data)
                assert changed_secret not in str(snapshot.snapshot_data)

    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()


def test_snapshot_rollback_restores_deleted_variables_and_removes_new_ones():
    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSessionLocal = sessionmaker(
        bind=test_engine,
        autoflush=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=test_engine)

    def override_get_db():
        db = TestSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            user = {
                "email": "snapshot-edge-test@example.com",
                "password": "FakeSnapshotEdgePassword123",
            }
            assert client.post("/auth/register", json=user).status_code == 201
            login = client.post("/auth/login", json=user)
            assert login.status_code == 200
            client.headers.update(
                {"Authorization": f"Bearer {login.json()['access_token']}"}
            )

            project_response = client.post(
                "/projects", json={"name": "Snapshot Edge Test Project"}
            )
            assert project_response.status_code == 201
            project_id = project_response.json()["id"]

            environment_response = client.post(
                f"/projects/{project_id}/environments",
                json={"name": "Development"},
            )
            assert environment_response.status_code == 201
            environment_id = environment_response.json()["id"]

            variables_url = (
                f"/projects/{project_id}/environments/"
                f"{environment_id}/variables"
            )
            snapshots_url = (
                f"/projects/{project_id}/environments/"
                f"{environment_id}/snapshots"
            )

            original = client.post(
                variables_url,
                json={
                    "key": "ORIGINAL_KEY",
                    "value": "fake-original-value",
                    "is_sensitive": True,
                },
            )
            assert original.status_code == 201
            original_id = original.json()["id"]

            saved = client.post(snapshots_url, json={"name": "Before changes"})
            assert saved.status_code == 201
            snapshot_id = saved.json()["id"]

            deleted = client.delete(f"{variables_url}/{original_id}")
            assert deleted.status_code in (200, 204)

            new_variable = client.post(
                variables_url,
                json={
                    "key": "NEW_KEY",
                    "value": "fake-new-value",
                    "is_sensitive": True,
                },
            )
            assert new_variable.status_code == 201
            new_variable_id = new_variable.json()["id"]

            rollback = client.post(
                f"{snapshots_url}/{snapshot_id}/rollback"
            )
            assert rollback.status_code == 200

            with TestSessionLocal() as db:
                restored = db.get(Variable, original_id)
                newly_added = db.get(Variable, new_variable_id)

                assert restored is not None
                assert restored.is_deleted is False
                assert restored.deleted_at is None

                assert newly_added is not None
                assert newly_added.is_deleted is True
                assert newly_added.deleted_at is not None

            original_reveal = client.get(
                f"{variables_url}/{original_id}/reveal"
            )
            assert original_reveal.status_code == 200
            assert original_reveal.json()["value"] == "fake-original-value"

            new_reveal = client.get(
                f"{variables_url}/{new_variable_id}/reveal"
            )
            assert new_reveal.status_code in (400, 404)

    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=test_engine)
        test_engine.dispose()
