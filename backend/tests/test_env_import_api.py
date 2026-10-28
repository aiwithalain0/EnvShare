
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from encryption import decrypt_value
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
        "EXISTING_KEY": "update",
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


def test_import_preview_identifies_restorable_keys(client):
    _, _, base_url = setup_environment(client)

    active = client.post(
        base_url,
        json={
            "key": "ACTIVE_KEY",
            "value": "secret-active",
            "is_sensitive": True,
        },
    )
    assert active.status_code == 201

    deleted = client.post(
        base_url,
        json={
            "key": "DELETED_KEY",
            "value": "secret-deleted",
            "is_sensitive": True,
        },
    )
    assert deleted.status_code == 201
    deleted_id = deleted.json()["id"]
    assert client.delete(f"{base_url}/{deleted_id}").status_code == 204

    secret_candidate = "preview-candidate-secret"
    response = client.post(
        f"{base_url}/import/preview",
        json={
            "content": (
                "ACTIVE_KEY=active-val\n"
                f"DELETED_KEY={secret_candidate}\n"
                "BRAND_NEW_KEY=brand-new-val\n"
            )
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["total"] == 3
    assert data["existing_count"] == 1
    assert data["restore_count"] == 1
    assert data["new_count"] == 1
    assert secret_candidate not in response.text

    vars_by_key = {item["key"]: item for item in data["variables"]}
    assert vars_by_key["ACTIVE_KEY"]["status"] == "update"
    assert vars_by_key["ACTIVE_KEY"]["can_restore"] is False
    assert vars_by_key["DELETED_KEY"]["status"] == "can_restore"
    assert vars_by_key["DELETED_KEY"]["can_restore"] is True
    assert vars_by_key["BRAND_NEW_KEY"]["status"] == "new"
    assert vars_by_key["BRAND_NEW_KEY"]["can_restore"] is False


def test_confirmed_import_reactivates_deleted_records_and_preserves_history(
    client,
):
    _, _, base_url = setup_environment(client)

    old_secret = "old-secret-before-delete"
    created = client.post(
        base_url,
        json={
            "key": "RESTORE_ME",
            "value": old_secret,
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    var_id = created.json()["id"]
    assert client.delete(f"{base_url}/{var_id}").status_code == 204

    new_secret = "new-restored-secret"
    brand_new_secret = "brand-new-secret"
    import_res = client.post(
        f"{base_url}/import",
        json={
            "content": (
                f"RESTORE_ME={new_secret}\n"
                f"ANOTHER_NEW_KEY={brand_new_secret}\n"
            ),
            "confirm_import": True,
        },
    )

    assert import_res.status_code == 200
    assert import_res.json()["imported_count"] == 2
    assert new_secret not in import_res.text
    assert brand_new_secret not in import_res.text

    listing = client.get(base_url)
    assert listing.status_code == 200
    keys = [item["key"] for item in listing.json()]
    assert "RESTORE_ME" in keys
    assert "ANOTHER_NEW_KEY" in keys
    assert new_secret not in listing.text
    assert brand_new_secret not in listing.text

    reveal = client.get(f"{base_url}/{var_id}/reveal")
    assert reveal.status_code == 200
    assert reveal.json()["value"] == new_secret

    history = client.get(f"{base_url}/{var_id}/history")
    assert history.status_code == 200
    assert len(history.json()) == 2
    assert old_secret not in history.text
    assert new_secret not in history.text

    db = next(app.dependency_overrides[get_db]())
    try:
        variable = db.get(Variable, var_id)
        assert variable is not None
        assert variable.is_deleted is False
        assert variable.deleted_at is None
        assert variable.value_ciphertext != new_secret
        assert decrypt_value(variable.value_ciphertext) == new_secret
    finally:
        db.close()


def test_confirmed_import_with_active_conflict_does_not_reactivate_deleted(
    client,
):
    _, _, base_url = setup_environment(client)

    active = client.post(
        base_url,
        json={
            "key": "ACTIVE_CONFLICT",
            "value": "val1",
            "is_sensitive": True,
        },
    )
    assert active.status_code == 201

    deleted = client.post(
        base_url,
        json={
            "key": "DELETED_NOT_RESTORED",
            "value": "val2",
            "is_sensitive": True,
        },
    )
    assert deleted.status_code == 201
    deleted_id = deleted.json()["id"]
    assert client.delete(f"{base_url}/{deleted_id}").status_code == 204

    response = client.post(
        f"{base_url}/import",
        json={
            "content": (
                "ACTIVE_CONFLICT=new1\n"
                "DELETED_NOT_RESTORED=new2\n"
            ),
            "confirm_import": True,
        },
    )

    assert response.status_code == 409

    db = next(app.dependency_overrides[get_db]())
    try:
        variable = db.get(Variable, deleted_id)
        assert variable is not None
        assert variable.is_deleted is True
        assert variable.deleted_at is not None
    finally:
        db.close()


def test_import_overwrite_preserves_previous_value_in_history(client):
    _, environment_id, base_url = setup_environment(client)

    old_secret = "fake-original-secret"
    new_secret = "fake-replacement-secret"

    created = client.post(
        base_url,
        json={
            "key": "OVERWRITE_TEST",
            "value": old_secret,
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    variable_id = created.json()["id"]

    response = client.post(
        f"{base_url}/import",
        json={
            "content": f"OVERWRITE_TEST={new_secret}",
            "confirm_import": True,
            "overwrite_existing": True,
        },
    )

    assert response.status_code == 200
    assert response.json()["imported_count"] == 1
    assert old_secret not in response.text
    assert new_secret not in response.text

    reveal = client.get(f"{base_url}/{variable_id}/reveal")
    assert reveal.status_code == 200
    assert reveal.json()["value"] == new_secret

    history = client.get(f"{base_url}/{variable_id}/history")
    assert history.status_code == 200
    assert len(history.json()) == 3
    assert old_secret not in history.text
    assert new_secret not in history.text

    db = next(app.dependency_overrides[get_db]())
    try:
        versions = db.scalars(
            select(VariableVersion)
            .where(VariableVersion.variable_id == variable_id)
            .order_by(VariableVersion.id.asc())
        ).all()

        assert len(versions) == 3
        assert decrypt_value(versions[0].value_ciphertext) == old_secret
        assert decrypt_value(versions[1].value_ciphertext) == old_secret
        assert decrypt_value(versions[2].value_ciphertext) == new_secret

        variable = db.get(Variable, variable_id)
        assert variable is not None
        assert decrypt_value(variable.value_ciphertext) == new_secret
    finally:
        db.close()


def test_import_overwrite_false_keeps_existing_value(client):
    _, _, base_url = setup_environment(client)

    old_secret = "fake-original-value"
    new_secret = "fake-unapproved-value"

    created = client.post(
        base_url,
        json={
            "key": "PROTECTED_KEY",
            "value": old_secret,
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    variable_id = created.json()["id"]

    response = client.post(
        f"{base_url}/import",
        json={
            "content": f"PROTECTED_KEY={new_secret}",
            "confirm_import": True,
            "overwrite_existing": False,
        },
    )

    assert response.status_code == 409

    reveal = client.get(f"{base_url}/{variable_id}/reveal")
    assert reveal.status_code == 200
    assert reveal.json()["value"] == old_secret

    history = client.get(f"{base_url}/{variable_id}/history")
    assert history.status_code == 200
    assert len(history.json()) == 1

