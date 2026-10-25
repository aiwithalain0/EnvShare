import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select

from main import app
from models import Project, ProjectMember, User
from roles import require_project_role, ROLES_ADMIN, ROLES_WRITE, ROLES_READ
from database import get_db

# Reuse the client fixture that creates an isolated in‑memory SQLite DB
@pytest.fixture
def client():
    # Create a fresh SQLite engine for each test
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from database import Base

    test_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    TestSessionLocal = sessionmaker(
        bind=test_engine, autoflush=False, expire_on_commit=False
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

def register_user(client, email, password):
    resp = client.post("/auth/register", json={"email": email, "password": "Secret123!AB"})
    assert resp.status_code == 201
    login = client.post("/auth/login", json={"email": email, "password": "Secret123!AB"})
    assert login.status_code == 200
    token = login.json()["access_token"]
    return token

def create_project(client, token, name):
    client.headers.update({"Authorization": f"Bearer {token}"})
    resp = client.post("/projects", json={"name": name})
    assert resp.status_code == 201
    return resp.json()["id"]

def get_db_session(client):
    # Retrieve the overridden DB session used by the test client
    db_override = app.dependency_overrides[get_db]
    return next(db_override())

def test_role_hierarchy_and_requirements(client):
    # Owner user
    owner_token = register_user(client, "owner@example.com", "Secret123!")
    # Manager user
    manager_token = register_user(client, "manager@example.com", "Secret123!")
    # Member user
    member_token = register_user(client, "member@example.com", "Secret123!")
    # Outsider user
    outsider_token = register_user(client, "outsider@example.com", "Secret123!")

    # Owner creates a project – automatically becomes "owner"
    project_id = create_project(client, owner_token, "RBAC Project")

    db = get_db_session(client)
    try:
        # Fetch the users from DB
        owner_user = db.scalar(select(User).where(User.email == "owner@example.com"))
        manager_user = db.scalar(select(User).where(User.email == "manager@example.com"))
        member_user = db.scalar(select(User).where(User.email == "member@example.com"))
        outsider_user = db.scalar(select(User).where(User.email == "outsider@example.com"))

        # Insert explicit manager and member memberships
        manager_membership = ProjectMember(
            project_id=project_id,
            user_id=manager_user.id,
            role="manager",
        )
        member_membership = ProjectMember(
            project_id=project_id,
            user_id=member_user.id,
            role="member",
        )
        db.add_all([manager_membership, member_membership])
        db.commit()

        # Admin (owner) checks
        require_project_role(project_id, owner_user.id, db, allowed_roles=ROLES_ADMIN)
        require_project_role(project_id, owner_user.id, db, allowed_roles=ROLES_WRITE)
        require_project_role(project_id, owner_user.id, db, allowed_roles=ROLES_READ)

        # Manager checks
        require_project_role(project_id, manager_user.id, db, allowed_roles=ROLES_WRITE)
        require_project_role(project_id, manager_user.id, db, allowed_roles=ROLES_READ)
        with pytest.raises(HTTPException) as exc_info:
            require_project_role(project_id, manager_user.id, db, allowed_roles=ROLES_ADMIN)
        assert exc_info.value.status_code == 403

        # Member checks
        require_project_role(project_id, member_user.id, db, allowed_roles=ROLES_READ)
        with pytest.raises(HTTPException) as exc_info:
            require_project_role(project_id, member_user.id, db, allowed_roles=ROLES_WRITE)
        assert exc_info.value.status_code == 403

        # Outsider checks
        with pytest.raises(HTTPException) as exc_info:
            require_project_role(project_id, outsider_user.id, db, allowed_roles=ROLES_READ)
        assert exc_info.value.status_code == 404
    finally:
        db.close()
