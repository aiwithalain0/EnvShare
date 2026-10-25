
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import AuditEvent, Environment, Project, Variable, VariableVersion
from encryption import decrypt_value


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


def setup_environment(client):
    user_data = {
        "email": "import-test@example.com",
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
        json={"name": "Import Test Project"},
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
    return project_id, environment_id, base_url


def test_preview_shows_keys_without_values(client):
    _, _, base_url = setup_environment(client)

    response = client.post(
        f"{base_url}/import/preview",
        json={"content": "APP_NAME=EnvShare\nFAKE_TOKEN=fake-secret-123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["new_count"] == 2
    assert [item["key"] for item in body["variables"]] == [
        "APP_NAME",
        "FAKE_TOKEN",
    ]
    assert "fake-secret-123" not in response.text
    assert all("value" not in item for item in body["variables"])


def test_preview_marks_existing_keys(client):
    _, _, base_url = setup_environment(client)

    created = client.post(
        base_url,
        json={
            "key": "EXISTING_KEY",
            "value": "fake-existing-value",
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201

    response = client.post(
        f"{base_url}/import/preview",
        json={
            "content": (
                "EXISTING_KEY=fake-replacement-value\n"
                "NEW_KEY=fake-new-value"
            )
        },
    )

    assert response.status_code == 200
    statuses = {
        item["key"]: item["status"]
        for item in response.json()["variables"]
    }
    assert statuses == {
        "EXISTING_KEY": "already_exists",
        "NEW_KEY": "new",
    }
    assert "fake-replacement-value" not in response.text
    assert "fake-new-value" not in response.text


def test_import_requires_explicit_confirmation(client):
    _, _, base_url = setup_environment(client)

    response = client.post(
        f"{base_url}/import",
        json={
            "content": "IMPORT_GUARD=fake-value",
            "confirm_import": False,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Set confirm_import to true to save the imported variables."
    )


def test_import_saves_encrypted_values_and_audit_events(client):
    project_id, environment_id, base_url = setup_environment(client)
    secret = "fake-import-secret-456"

    response = client.post(
        f"{base_url}/import",
        json={
            "content": f"IMPORTED_TOKEN={secret}",
            "confirm_import": True,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["imported_count"] == 1
    assert "IMPORTED_TOKEN" in response.text
    assert secret not in response.text

    db = next(app.dependency_overrides[get_db]())
    try:
        variable = db.scalar(
            select(Variable).where(
                Variable.environment_id == environment_id,
                Variable.key == "IMPORTED_TOKEN",
            )
        )
        assert variable is not None
        assert variable.value_ciphertext != secret
        assert decrypt_value(variable.value_ciphertext) == secret

        version = db.scalar(
            select(VariableVersion).where(
                VariableVersion.variable_id == variable.id
            )
        )
        assert version is not None
        assert version.value_ciphertext != secret

        variable_event = db.scalar(
            select(AuditEvent).where(
                AuditEvent.project_id == project_id,
                AuditEvent.action == "variable.created",
                AuditEvent.resource_id == variable.id,
            )
        )
        batch_event = db.scalar(
            select(AuditEvent).where(
                AuditEvent.project_id == project_id,
                AuditEvent.action == "variables.imported",
            )
        )
        assert variable_event is not None
        assert batch_event is not None
        assert secret not in str(variable_event.event_metadata)
        assert secret not in str(batch_event.event_metadata)
    finally:
        db.close()


def test_import_rejects_existing_keys_without_partial_save(client):
    _, environment_id, base_url = setup_environment(client)

    existing = client.post(
        base_url,
        json={
            "key": "ALREADY_HERE",
            "value": "fake-existing-secret",
            "is_sensitive": True,
        },
    )
    assert existing.status_code == 201

    response = client.post(
        f"{base_url}/import",
        json={
            "content": (
                "NEW_BEFORE_CONFLICT=fake-new-value\n"
                "ALREADY_HERE=fake-overwrite-value"
            ),
            "confirm_import": True,
        },
    )

    assert response.status_code == 409

    db = next(app.dependency_overrides[get_db]())
    try:
        new_variable = db.scalar(
            select(Variable).where(
                Variable.environment_id == environment_id,
                Variable.key == "NEW_BEFORE_CONFLICT",
            )
        )
        existing_variable = db.scalar(
            select(Variable).where(
                Variable.environment_id == environment_id,
                Variable.key == "ALREADY_HERE",
            )
        )

        assert new_variable is None
        assert existing_variable is not None
        assert decrypt_value(existing_variable.value_ciphertext) == (
            "fake-existing-secret"
        )
    finally:
        db.close()


def test_import_rejects_malformed_content(client):
    _, _, base_url = setup_environment(client)

    response = client.post(
        f"{base_url}/import",
        json={
            "content": "GOOD_KEY=fake-value\nINVALID LINE",
            "confirm_import": True,
        },
    )

    assert response.status_code == 422
