
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import AuditEvent, Environment, Project, ProjectMember, User


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


def create_authenticated_project(client):
    user_data = {
        "email": "environment-test@example.com",
        "password": "FakeTestPassword123",
    }

    register_response = client.post(
        "/auth/register",
        json=user_data,
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/auth/login",
        json=user_data,
    )
    assert login_response.status_code == 200

    token = login_response.json()["access_token"]
    client.headers.update(
        {"Authorization": f"Bearer {token}"}
    )

    project_response = client.post(
        "/projects",
        json={"name": "Environment Test Project"},
    )
    assert project_response.status_code == 201

    return project_response.json()["id"]


def test_create_environment(client):
    project_id = create_authenticated_project(client)

    response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Development"},
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Development"
    assert response.json()["project_id"] == project_id
    assert isinstance(response.json()["id"], int)


def test_environment_name_is_trimmed(client):
    project_id = create_authenticated_project(client)

    response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "  Staging  "},
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Staging"


def test_empty_environment_name_is_rejected(client):
    project_id = create_authenticated_project(client)

    response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "   "},
    )

    assert response.status_code == 422


def test_duplicate_environment_name_is_rejected(client):
    project_id = create_authenticated_project(client)

    first_response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Production"},
    )
    second_response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Production"},
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 409


def test_environment_creation_records_audit_event(client):
    project_id = create_authenticated_project(client)

    response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Audit Test"},
    )
    assert response.status_code == 201

    environment_id = response.json()["id"]

    db_override = app.dependency_overrides[get_db]
    db = next(db_override())

    try:
        environment = db.get(Environment, environment_id)
        assert environment is not None

        audit_event = db.scalar(
            select(AuditEvent).where(
                AuditEvent.project_id == project_id,
                AuditEvent.action == "environment.created",
                AuditEvent.resource_id == environment_id,
            )
        )

        assert audit_event is not None
        assert audit_event.event_metadata == {
            "environment_name": "Audit Test"
        }
    finally:
        db.close()


def test_list_environments_returns_project_environments(client):
    project_id = create_authenticated_project(client)

    for name in ["Development", "Staging", "Production"]:
        response = client.post(
            f"/projects/{project_id}/environments",
            json={"name": name},
        )
        assert response.status_code == 201

    response = client.get(
        f"/projects/{project_id}/environments"
    )

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == [
        "Development",
        "Staging",
        "Production",
    ]


def test_non_member_cannot_create_environment(client):
    project_id = create_authenticated_project(client)

    other_user = {
        "email": "outsider-test@example.com",
        "password": "FakeTestPassword123",
    }

    register_response = client.post(
        "/auth/register",
        json=other_user,
    )
    assert register_response.status_code == 201

    login_response = client.post(
        "/auth/login",
        json=other_user,
    )
    assert login_response.status_code == 200

    token = login_response.json()["access_token"]
    client.headers.update(
        {"Authorization": f"Bearer {token}"}
    )

    response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Unauthorized Environment"},
    )

    assert response.status_code == 403
