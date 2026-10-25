
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import AuditEvent, Environment, Project, ProjectMember, User, Variable


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
