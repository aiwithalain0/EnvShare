
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

    # Confirm soft-deletion, preserved history, and retained audit event.
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())

    try:
        variable = db.get(Variable, variable_id)
        assert variable is not None
        assert variable.is_deleted is True
        assert variable.deleted_at is not None

        versions = db.scalars(
            select(VariableVersion).where(
                VariableVersion.variable_id == variable_id
            )
        ).all()
        assert len(versions) == 1

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


def test_deleted_variable_is_excluded_from_listings(client):
    project_id, environment_id, base_url, var1_id = setup_variable(client)

    # Create a second variable so listing has both active and deleted items.
    created = client.post(
        base_url,
        json={
            "key": "ACTIVE_VARIABLE",
            "value": "fake-active-value",
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    var2_id = created.json()["id"]

    # Delete the first variable.
    assert client.delete(f"{base_url}/{var1_id}").status_code == 204

    # Listing must only return the active variable.
    listing = client.get(base_url)
    assert listing.status_code == 200
    listed_ids = [item["id"] for item in listing.json()]
    assert var1_id not in listed_ids
    assert var2_id in listed_ids

    # Deleting an already deleted variable must return 404.
    second_delete = client.delete(f"{base_url}/{var1_id}")
    assert second_delete.status_code == 404


def test_deleted_variable_cannot_be_revealed_or_updated(client):
    _, _, base_url, variable_id = setup_variable(client)

    # Delete the variable.
    assert client.delete(f"{base_url}/{variable_id}").status_code == 204

    # Reveal must return 404 Not Found.
    reveal_response = client.get(f"{base_url}/{variable_id}/reveal")
    assert reveal_response.status_code == 404

    # Update must return 404 Not Found.
    update_response = client.put(
        f"{base_url}/{variable_id}",
        json={
            "value": "fake-attempted-update",
            "is_sensitive": True,
        },
    )
    assert update_response.status_code == 404

    # History retrieval must return 404 Not Found through normal endpoint.
    history_response = client.get(f"{base_url}/{variable_id}/history")
    assert history_response.status_code == 404


def test_history_requires_authentication(client):
    _, _, base_url, variable_id = setup_variable(client)

    client.headers.pop("Authorization", None)

    response = client.get(f"{base_url}/{variable_id}/history")

    assert response.status_code == 401


def test_variable_lifecycle_create_delete_recreate_maintains_version_chain(client):
    project_id, environment_id, base_url, var_id = setup_variable(client)

    # Version 1 is created in setup_variable with "fake-original-value"

    # Version 2: Update variable
    v2_val = "lifecycle-val-v2"
    up1 = client.put(f"{base_url}/{var_id}", json={"value": v2_val, "is_sensitive": True})
    assert up1.status_code == 200

    # Delete variable -> soft-deleted
    del_res = client.delete(f"{base_url}/{var_id}")
    assert del_res.status_code == 204

    # Endpoints return 404 while soft-deleted
    assert client.get(f"{base_url}/{var_id}/reveal").status_code == 404
    assert client.get(f"{base_url}/{var_id}/history").status_code == 404
    assert client.put(f"{base_url}/{var_id}", json={"value": "ignored", "is_sensitive": True}).status_code == 404

    # Version 3: Recreate variable with identical key
    v3_val = "lifecycle-val-v3"
    recreate_res = client.post(
        base_url,
        json={"key": "LIFECYCLE_TEST", "value": v3_val, "is_sensitive": True},
    )
    assert recreate_res.status_code == 201
    assert recreate_res.json()["id"] == var_id

    # Version 4: Update reactivated variable
    v4_val = "lifecycle-val-v4"
    up2 = client.put(f"{base_url}/{var_id}", json={"value": v4_val, "is_sensitive": True})
    assert up2.status_code == 200

    # Reveal shows latest value (v4)
    reveal_res = client.get(f"{base_url}/{var_id}/reveal")
    assert reveal_res.status_code == 200
    assert reveal_res.json()["value"] == v4_val

    # History contains all 4 versions in chain without exposing secret plaintext
    history_res = client.get(f"{base_url}/{var_id}/history")
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history) == 4
    for val in ["fake-original-value", v2_val, v3_val, v4_val]:
        assert val not in history_res.text

    # Normal listing returns variable metadata without secret values
    listing = client.get(base_url)
    assert listing.status_code == 200
    assert any(item["id"] == var_id and item["key"] == "LIFECYCLE_TEST" for item in listing.json())
    for val in ["fake-original-value", v2_val, v3_val, v4_val]:
        assert val not in listing.text

    # Database assertions
    db = next(app.dependency_overrides[get_db]())
    try:
        var = db.get(Variable, var_id)
        assert var.is_deleted is False
        assert var.deleted_at is None

        versions = db.scalars(
            select(VariableVersion).where(VariableVersion.variable_id == var_id)
        ).all()
        assert len(versions) == 4
    finally:
        db.close()

