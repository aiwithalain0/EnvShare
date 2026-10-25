
import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_project_list_requires_authentication(client):
    response = client.get("/projects")

    assert response.status_code == 401


def test_project_creation_requires_authentication(client):
    response = client.post(
        "/projects",
        json={"name": "Unauthorized Test Project"},
    )

    assert response.status_code == 401


def test_audit_logs_require_authentication(client):
    response = client.get("/projects/1/audit-logs")

    assert response.status_code == 401
