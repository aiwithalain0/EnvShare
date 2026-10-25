
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app


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


def setup_project(client, name):
    response = client.post("/projects", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def setup_environment(client, project_id, name):
    response = client.post(
        f"/projects/{project_id}/environments",
        json={"name": name},
    )
    assert response.status_code == 201
    return response.json()["id"]


def authenticate(client):
    user_data = {
        "email": "boundary-test@example.com",
        "password": "FakeTestPassword123",
    }

    assert client.post("/auth/register", json=user_data).status_code == 201

    login = client.post("/auth/login", json=user_data)
    assert login.status_code == 200

    client.headers.update(
        {"Authorization": f"Bearer {login.json()['access_token']}"}
    )


def test_environment_must_belong_to_requested_project(client):
    authenticate(client)

    project_a_id = setup_project(client, "Project A")
    project_b_id = setup_project(client, "Project B")

    environment_b_id = setup_environment(
        client, project_b_id, "Project B Development"
    )

    response = client.get(
        f"/projects/{project_a_id}/environments/"
        f"{environment_b_id}/variables"
    )

    assert response.status_code == 404


def test_variable_cannot_be_accessed_through_another_environment(client):
    authenticate(client)

    project_id = setup_project(client, "Boundary Test Project")
    environment_a_id = setup_environment(
        client, project_id, "Development"
    )
    environment_b_id = setup_environment(
        client, project_id, "Production"
    )

    variables_url_a = (
        f"/projects/{project_id}/environments/"
        f"{environment_a_id}/variables"
    )

    created = client.post(
        variables_url_a,
        json={
            "key": "BOUNDARY_TEST",
            "value": "fake-boundary-secret",
            "is_sensitive": True,
        },
    )
    assert created.status_code == 201
    variable_id = created.json()["id"]

    response = client.get(
        f"/projects/{project_id}/environments/"
        f"{environment_b_id}/variables/{variable_id}/reveal"
    )

    assert response.status_code == 404
    assert "fake-boundary-secret" not in response.text
