
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
        autocommit=False,
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


def test_register_new_user(client):
    response = client.post(
        "/auth/register",
        json={
            "email": "api-test@example.com",
            "password": "FakeTestPassword123",
        },
    )

    assert response.status_code == 201
    assert response.json()["email"] == "api-test@example.com"
    assert "password" not in response.json()
    assert "password_hash" not in response.json()


def test_duplicate_registration_is_rejected(client):
    user_data = {
        "email": "duplicate-test@example.com",
        "password": "FakeTestPassword123",
    }

    first_response = client.post("/auth/register", json=user_data)
    second_response = client.post("/auth/register", json=user_data)

    assert first_response.status_code == 201
    assert second_response.status_code == 409


def test_login_returns_bearer_token(client):
    user_data = {
        "email": "login-test@example.com",
        "password": "FakeTestPassword123",
    }

    client.post("/auth/register", json=user_data)

    response = client.post("/auth/login", json=user_data)

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert isinstance(response.json()["access_token"], str)
    assert len(response.json()["access_token"]) > 0


def test_wrong_password_is_rejected(client):
    client.post(
        "/auth/register",
        json={
            "email": "wrong-password-test@example.com",
            "password": "FakeTestPassword123",
        },
    )

    response = client.post(
        "/auth/login",
        json={
            "email": "wrong-password-test@example.com",
            "password": "WrongTestPassword456",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."


def test_invalid_registration_password_is_rejected(client):
    response = client.post(
        "/auth/register",
        json={
            "email": "weak-password-test@example.com",
            "password": "short",
        },
    )

    assert response.status_code == 422
