
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import AuditEvent, Project, ProjectMember, User


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


def register_and_login(client):
    user_data = {
        "email": "project-test@example.com",
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


def test_create_project(client):
    register_and_login(client)

    response = client.post(
        "/projects",
        json={"name": "Test Project"},
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Test Project"
    assert isinstance(response.json()["id"], int)


def test_project_creation_trims_name(client):
    register_and_login(client)

    response = client.post(
        "/projects",
        json={"name": "  Trimmed Project  "},
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Trimmed Project"


def test_empty_project_name_is_rejected(client):
    register_and_login(client)

    response = client.post(
        "/projects",
        json={"name": "   "},
    )

    assert response.status_code == 422


def test_project_creation_assigns_owner_and_audit_event(client):
    register_and_login(client)

    response = client.post(
        "/projects",
        json={"name": "Ownership Test"},
    )
    assert response.status_code == 201

    project_id = response.json()["id"]

    # Read from the isolated test database.
    db_override = app.dependency_overrides[get_db]
    db = next(db_override())

    try:
        project = db.get(Project, project_id)
        assert project is not None

        user = db.scalar(
            select(User).where(
                User.email == "project-test@example.com"
            )
        )
        assert user is not None

        membership = db.scalar(
            select(ProjectMember).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == user.id,
            )
        )
        assert membership is not None
        assert membership.role == "owner"

        audit_event = db.scalar(
            select(AuditEvent).where(
                AuditEvent.project_id == project_id,
                AuditEvent.action == "project.created",
            )
        )
        assert audit_event is not None
        assert audit_event.event_metadata == {
            "project_name": "Ownership Test"
        }
    finally:
        db.close()


def test_list_projects_returns_only_memberships(client):
    register_and_login(client)

    first = client.post(
        "/projects",
        json={"name": "First Project"},
    )
    second = client.post(
        "/projects",
        json={"name": "Second Project"},
    )

    assert first.status_code == 201
    assert second.status_code == 201

    response = client.get("/projects")

    assert response.status_code == 200
    assert [item["name"] for item in response.json()] == [
        "First Project",
        "Second Project",
    ]
