
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import (
    AuditEvent,
    Environment,
    Project,
    ProjectMember,
    User,
    Variable,
    VariableVersion,
)



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
        "email": "variable-test@example.com",
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
        json={"name": "Variable Test Project"},
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    environment = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Development"},
    )
    assert environment.status_code == 201

    return project_id, environment.json()["id"]


def variable_url(project_id, environment_id):
    return (
        f"/projects/{project_id}/environments/"
        f"{environment_id}/variables"
    )


def test_create_variable_returns_metadata_not_value(client):
    project_id, environment_id = setup_environment(client)
    secret = "fake-test-secret-123"

    response = client.post(
        variable_url(project_id, environment_id),
        json={
            "key": "DEMO_API_KEY",
            "value": secret,
            "is_sensitive": True,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["key"] == "DEMO_API_KEY"
    assert body["is_sensitive"] is True
    assert "value" not in body
    assert secret not in response.text


def test_duplicate_variable_key_is_rejected(client):
    project_id, environment_id = setup_environment(client)
    url = variable_url(project_id, environment_id)
    data = {
        "key": "APP_NAME",
        "value": "fake-app-value",
        "is_sensitive": False,
    }

    first = client.post(url, json=data)
    second = client.post(url, json=data)

    assert first.status_code == 201
    assert second.status_code == 409


def test_list_variables_does_not_return_values(client):
    project_id, environment_id = setup_environment(client)
    url = variable_url(project_id, environment_id)

    created = client.post(
        url,
        json={
            "key": "PRIVATE_TOKEN",
            "value": "fake-private-value-123",
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201

    response = client.get(url)

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["key"] == "PRIVATE_TOKEN"
    assert "value" not in response.json()[0]
    assert "fake-private-value-123" not in response.text


def test_update_variable_does_not_return_new_value(client):
    project_id, environment_id = setup_environment(client)
    url = variable_url(project_id, environment_id)

    created = client.post(
        url,
        json={
            "key": "SERVICE_TOKEN",
            "value": "fake-original-value",
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    variable_id = created.json()["id"]

    new_value = "fake-updated-value-456"
    response = client.put(
        f"{url}/{variable_id}",
        json={"value": new_value, "is_sensitive": True},
    )

    assert response.status_code == 200
    assert response.json()["key"] == "SERVICE_TOKEN"
    assert "value" not in response.json()
    assert new_value not in response.text


def test_reveal_returns_value_and_records_audit_event(client):
    project_id, environment_id = setup_environment(client)
    url = variable_url(project_id, environment_id)
    secret = "fake-reveal-value-789"

    created = client.post(
        url,
        json={
            "key": "REVEAL_TEST",
            "value": secret,
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    variable_id = created.json()["id"]

    response = client.get(f"{url}/{variable_id}/reveal")

    assert response.status_code == 200
    assert response.json() == {
        "key": "REVEAL_TEST",
        "value": secret,
    }

    db_override = app.dependency_overrides[get_db]
    db = next(db_override())

    try:
        event = db.scalar(
            select(AuditEvent).where(
                AuditEvent.project_id == project_id,
                AuditEvent.action == "variable.revealed",
                AuditEvent.resource_id == variable_id,
            )
        )
        assert event is not None
        assert secret not in str(event.event_metadata)
    finally:
        db.close()


def test_non_member_cannot_read_variables(client):
    project_id, environment_id = setup_environment(client)

    outsider = {
        "email": "variable-outsider@example.com",
        "password": "FakeTestPassword123",
    }
    assert client.post("/auth/register", json=outsider).status_code == 201

    login = client.post("/auth/login", json=outsider)
    assert login.status_code == 200

    client.headers.update(
        {"Authorization": f"Bearer {login.json()['access_token']}"}
    )

    response = client.get(variable_url(project_id, environment_id))

    assert response.status_code == 404


def test_recreating_soft_deleted_variable_reactivates_record_and_preserves_history(client):
    project_id, environment_id = setup_environment(client)
    url = variable_url(project_id, environment_id)

    # 1. Create a variable
    secret_v1 = "fake-secret-v1"
    created = client.post(
        url,
        json={
            "key": "REACTIVATED_KEY",
            "value": secret_v1,
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    original_id = created.json()["id"]

    # 2. Soft-delete the variable
    delete_res = client.delete(f"{url}/{original_id}")
    assert delete_res.status_code == 204

    # 3. Verify it is excluded from listing and secrets are not leaked
    listing_after_delete = client.get(url)
    assert listing_after_delete.status_code == 200
    assert all(item["id"] != original_id for item in listing_after_delete.json())
    assert secret_v1 not in listing_after_delete.text

    # 4. Recreate the variable with the same key and new value
    secret_v2 = "fake-secret-v2"
    recreated = client.post(
        url,
        json={
            "key": "REACTIVATED_KEY",
            "value": secret_v2,
            "is_sensitive": True,
        },
    )
    assert recreated.status_code == 201
    recreated_data = recreated.json()
    assert recreated_data["id"] == original_id  # Reactivated existing record
    assert recreated_data["key"] == "REACTIVATED_KEY"
    assert "value" not in recreated_data
    assert secret_v2 not in recreated.text

    # 5. Normal listing returns reactivated variable without secrets
    listing_after_recreate = client.get(url)
    assert listing_after_recreate.status_code == 200
    listed_items = listing_after_recreate.json()
    assert any(
        item["id"] == original_id and item["key"] == "REACTIVATED_KEY"
        for item in listed_items
    )
    assert secret_v1 not in listing_after_recreate.text
    assert secret_v2 not in listing_after_recreate.text

    # 6. Reveal returns the new value
    reveal = client.get(f"{url}/{original_id}/reveal")
    assert reveal.status_code == 200
    assert reveal.json() == {
        "key": "REACTIVATED_KEY",
        "value": secret_v2,
    }

    # 7. History preserves both versions without returning secret plaintext
    history = client.get(f"{url}/{original_id}/history")
    assert history.status_code == 200
    versions_data = history.json()
    assert len(versions_data) == 2
    assert secret_v1 not in history.text
    assert secret_v2 not in history.text

    # 8. Direct database inspection: is_deleted is False, deleted_at is None, encrypted ciphertext
    db = next(app.dependency_overrides[get_db]())
    try:
        var = db.get(Variable, original_id)
        assert var is not None
        assert var.is_deleted is False
        assert var.deleted_at is None
        assert var.value_ciphertext != secret_v2
        assert secret_v2 not in var.value_ciphertext

        versions = db.scalars(
            select(VariableVersion).where(
                VariableVersion.variable_id == original_id
            ).order_by(VariableVersion.id.asc())
        ).all()
        assert len(versions) == 2

        # Verify audit events do not contain secrets
        events = db.scalars(
            select(AuditEvent).where(
                AuditEvent.project_id == project_id,
                AuditEvent.resource_id == original_id,
            )
        ).all()
        assert len(events) >= 3  # created, deleted, created (reactivated)
        for event in events:
            assert secret_v1 not in str(event.event_metadata)
            assert secret_v2 not in str(event.event_metadata)
    finally:
        db.close()


def test_recreating_active_variable_returns_conflict(client):
    project_id, environment_id = setup_environment(client)
    url = variable_url(project_id, environment_id)

    res1 = client.post(
        url,
        json={
            "key": "ACTIVE_CONFLICT_KEY",
            "value": "fake-val-1",
            "is_sensitive": True,
        },
    )
    assert res1.status_code == 201

    res2 = client.post(
        url,
        json={
            "key": "ACTIVE_CONFLICT_KEY",
            "value": "fake-val-2",
            "is_sensitive": True,
        },
    )
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"]

