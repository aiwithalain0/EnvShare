
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import AuditEvent, Variable, VariableVersion


@pytest.fixture
def client():
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

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


def setup_variable(client):
    user_data = {
        "email": "lifecycle-test@example.com",
        "password": "FakeTestPassword123",
    }

    assert client.post("/auth/register", json=user_data).status_code == 201
    login = client.post("/auth/login", json=user_data)
    assert login.status_code == 200

    client.headers.update(
        {"Authorization": f"Bearer {login.json()['access_token']}"}
    )

    project = client.post(
        "/projects",
        json={"name": "Lifecycle Test Project"},
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    environment = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Development"},
    )
    assert environment.status_code == 201
    environment_id = environment.json()["id"]

    base_url = (
        f"/projects/{project_id}/environments/"
        f"{environment_id}/variables"
    )

    created = client.post(
        base_url,
        json={
            "key": "LIFECYCLE_TEST",
            "value": "fake-original-value",
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201

    return project_id, environment_id, base_url, created.json()["id"]


def test_update_creates_history_without_exposing_values(client):
    _, _, base_url, variable_id = setup_variable(client)

    response = client.put(
        f"{base_url}/{variable_id}",
        json={
            "value": "fake-updated-value",
            "is_sensitive": True,
        },
    )
    assert response.status_code == 200

    history = client.get(f"{base_url}/{variable_id}/history")

    assert history.status_code == 200
    assert len(history.json()) == 2

    for version in history.json():
        assert "version_id" in version
        assert "changed_at" in version
        assert "value" not in version
        assert "value_ciphertext" not in version

    assert "fake-original-value" not in history.text
    assert "fake-updated-value" not in history.text


def test_delete_removes_variable_and_history_but_keeps_audit(client):
    project_id, _, base_url, variable_id = setup_variable(client)

    response = client.delete(f"{base_url}/{variable_id}")
    assert response.status_code == 204

    # The variable must no longer be listed.
    listing = client.get(base_url)
    assert listing.status_code == 200
    assert all(item["id"] != variable_id for item in listing.json())

    # Confirm deletion, history cleanup, and retained audit event.
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())

    try:
        assert db.get(Variable, variable_id) is None

        versions = db.scalars(
            select(VariableVersion).where(
                VariableVersion.variable_id == variable_id
            )
        ).all()
        assert versions == []

        deletion_event = db.scalar(
            select(AuditEvent).where(
                AuditEvent.project_id == project_id,
                AuditEvent.action == "variable.deleted",
                AuditEvent.resource_id == variable_id,
            )
        )
        assert deletion_event is not None
        assert "fake-original-value" not in str(
            deletion_event.event_metadata
        )
    finally:
        db.close()


def test_history_requires_authentication(client):
    _, _, base_url, variable_id = setup_variable(client)

    client.headers.pop("Authorization", None)

    response = client.get(f"{base_url}/{variable_id}/history")

    assert response.status_code == 401
