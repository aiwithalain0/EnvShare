import secrets
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from models import AuditEvent, Environment, InviteCode, Project, ProjectMember, User, Variable


@pytest.fixture
def client():
    # Dedicated isolated in-memory test database; NEVER touches real envshare.db
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


def register_and_login(client: TestClient, email: str, password: str = "SecurePass1234") -> dict[str, str]:
    client.post("/auth/register", json={"email": email, "password": password})
    res = client.post("/auth/login", json={"email": email, "password": password})
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_invite_creation_and_unpredictable_codes(client: TestClient):
    auth_a = register_and_login(client, "alice@example.com")
    proj = client.post("/projects", json={"name": "Alpha-Project"}, headers=auth_a).json()
    proj_id = proj["id"]

    # Generate 3 invite codes
    codes = []
    for _ in range(3):
        res = client.post(
            f"/projects/{proj_id}/invites",
            json={"role": "member", "max_uses": 5, "expires_in_days": 7},
            headers=auth_a,
        )
        assert res.status_code == 201
        data = res.json()
        assert data["code"].startswith("ENV-")
        assert len(data["code"].split("-")) == 3
        assert data["role"] == "member"
        assert data["max_uses"] == 5
        assert data["uses_count"] == 0
        assert data["is_revoked"] is False
        assert data["expires_at"] is not None
        codes.append(data["code"])

    # Ensure uniqueness and unpredictability
    assert len(set(codes)) == 3


def test_unauthorized_invite_creation_and_revocation(client: TestClient):
    auth_owner = register_and_login(client, "owner@example.com")
    auth_intruder = register_and_login(client, "intruder@example.com")
    auth_member = register_and_login(client, "regular-member@example.com")

    proj = client.post("/projects", json={"name": "Restricted-Vault"}, headers=auth_owner).json()
    proj_id = proj["id"]

    # 1. Non-member is rejected with 404 (security anti-enumeration pattern)
    create_nonmember = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 2, "expires_in_days": 3},
        headers=auth_intruder,
    )
    assert create_nonmember.status_code == 404

    # 2. Member joins with valid code
    valid_invite = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 5, "expires_in_days": 3},
        headers=auth_owner,
    ).json()
    client.post("/projects/join", json={"code": valid_invite["code"]}, headers=auth_member)

    # 3. Regular member has role 'member', not admin -> 403 Forbidden
    create_member = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 2, "expires_in_days": 3},
        headers=auth_member,
    )
    assert create_member.status_code == 403

    # 4. Regular member cannot revoke invite -> 403 Forbidden
    revoke_member = client.delete(
        f"/projects/{proj_id}/invites/{valid_invite['id']}",
        headers=auth_member,
    )
    assert revoke_member.status_code == 403


def test_role_escalation_prevention_on_invite_creation(client: TestClient):
    auth_owner = register_and_login(client, "owner2@example.com")
    proj = client.post("/projects", json={"name": "Escalation-Test"}, headers=auth_owner).json()
    proj_id = proj["id"]

    # Attempt to create invite granting owner or admin
    res1 = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "owner", "max_uses": 1, "expires_in_days": 1},
        headers=auth_owner,
    )
    assert res1.status_code == 422

    res2 = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "admin", "max_uses": 1, "expires_in_days": 1},
        headers=auth_owner,
    )
    assert res2.status_code == 422

    # Manager and member are allowed
    res3 = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "manager", "max_uses": 1, "expires_in_days": 1},
        headers=auth_owner,
    )
    assert res3.status_code == 201
    assert res3.json()["role"] == "manager"


def test_successful_joining_and_duplicate_membership_prevention(client: TestClient):
    auth_a = register_and_login(client, "acc-a@example.com")
    auth_b = register_and_login(client, "acc-b@example.com")

    proj = client.post("/projects", json={"name": "Shared-Cloud"}, headers=auth_a).json()
    proj_id = proj["id"]

    invite = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 2, "expires_in_days": 5},
        headers=auth_a,
    ).json()

    # Account B joins with valid code
    join_res = client.post("/projects/join", json={"code": invite["code"]}, headers=auth_b)
    assert join_res.status_code == 200
    assert join_res.json()["id"] == proj_id

    # Project now appears in Account B's projects list
    b_projects = client.get("/projects", headers=auth_b).json()
    assert any(p["id"] == proj_id for p in b_projects)

    # Account B appears in Team Members
    members = client.get(f"/projects/{proj_id}/members", headers=auth_a).json()
    member_emails = [m["email"] for m in members]
    assert "acc-b@example.com" in member_emails
    b_member = next(m for m in members if m["email"] == "acc-b@example.com")
    assert b_member["role"] == "member"

    # Account B attempts duplicate join with same code
    dup_res = client.post("/projects/join", json={"code": invite["code"]}, headers=auth_b)
    assert dup_res.status_code == 400
    assert "already a member" in dup_res.json()["detail"].lower()


def test_invalid_expired_revoked_and_exhausted_codes(client: TestClient):
    auth_a = register_and_login(client, "admin@example.com")
    auth_b = register_and_login(client, "user-b@example.com")
    auth_c = register_and_login(client, "user-c@example.com")

    proj = client.post("/projects", json={"name": "Code-Validation-Vault"}, headers=auth_a).json()
    proj_id = proj["id"]

    # 1. Invalid code
    res_invalid = client.post("/projects/join", json={"code": "ENV-FAKE-CODE99"}, headers=auth_b)
    assert res_invalid.status_code == 404

    # 2. Exhausted code (max_uses = 1)
    invite_single = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 1, "expires_in_days": 7},
        headers=auth_a,
    ).json()

    # User B joins -> succeeds
    client.post("/projects/join", json={"code": invite_single["code"]}, headers=auth_b)
    # User C joins with exhausted code -> 400
    res_exhausted = client.post("/projects/join", json={"code": invite_single["code"]}, headers=auth_c)
    assert res_exhausted.status_code == 400
    assert "maximum usage limit" in res_exhausted.json()["detail"].lower()

    # 3. Revoked code
    invite_to_revoke = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 5, "expires_in_days": 7},
        headers=auth_a,
    ).json()

    client.delete(f"/projects/{proj_id}/invites/{invite_to_revoke['id']}", headers=auth_a)
    res_revoked = client.post("/projects/join", json={"code": invite_to_revoke["code"]}, headers=auth_c)
    assert res_revoked.status_code == 400
    assert "revoked" in res_revoked.json()["detail"].lower()


def test_member_removal_and_owner_protection(client: TestClient):
    auth_owner = register_and_login(client, "primary-owner@example.com")
    auth_member = register_and_login(client, "team-user@example.com")

    proj = client.post("/projects", json={"name": "Membership-Vault"}, headers=auth_owner).json()
    proj_id = proj["id"]

    invite = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 1, "expires_in_days": 7},
        headers=auth_owner,
    ).json()
    client.post("/projects/join", json={"code": invite["code"]}, headers=auth_member)

    members = client.get(f"/projects/{proj_id}/members", headers=auth_owner).json()
    owner_entry = next(m for m in members if m["email"] == "primary-owner@example.com")
    member_entry = next(m for m in members if m["email"] == "team-user@example.com")

    # Member cannot remove anyone -> 403
    unauth_remove = client.delete(
        f"/projects/{proj_id}/members/{member_entry['user_id']}",
        headers=auth_member,
    )
    assert unauth_remove.status_code == 403

    # Attempt to remove owner -> 400 Bad Request
    owner_remove = client.delete(
        f"/projects/{proj_id}/members/{owner_entry['user_id']}",
        headers=auth_owner,
    )
    assert owner_remove.status_code == 400
    assert "owner" in owner_remove.json()["detail"].lower()

    # Owner removes regular member -> 204
    remove_success = client.delete(
        f"/projects/{proj_id}/members/{member_entry['user_id']}",
        headers=auth_owner,
    )
    assert remove_success.status_code == 204

    # Member now loses access
    env_access = client.get(f"/projects/{proj_id}/environments", headers=auth_member)
    assert env_access.status_code == 403


def test_delete_environment_permissions_and_cascade(client: TestClient):
    auth_admin = register_and_login(client, "admin-env@example.com")
    auth_guest = register_and_login(client, "guest-env@example.com")

    proj = client.post("/projects", json={"name": "Env-Vault"}, headers=auth_admin).json()
    proj_id = proj["id"]

    # Create environment
    env = client.post(
        f"/projects/{proj_id}/environments",
        json={"name": "Staging-Test"},
        headers=auth_admin,
    ).json()
    env_id = env["id"]

    # Add secret variable
    var = client.post(
        f"/projects/{proj_id}/environments/{env_id}/variables",
        json={"key": "SECRET_KEY", "value": "super-secret-token", "is_sensitive": True},
        headers=auth_admin,
    ).json()

    # Guest user joins as read-only member
    inv = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 1, "expires_in_days": 1},
        headers=auth_admin,
    ).json()
    client.post("/projects/join", json={"code": inv["code"]}, headers=auth_guest)

    # Guest attempts to delete environment -> 403
    unauth_del = client.delete(
        f"/projects/{proj_id}/environments/{env_id}",
        headers=auth_guest,
    )
    assert unauth_del.status_code == 403

    # Admin deletes environment -> 204
    admin_del = client.delete(
        f"/projects/{proj_id}/environments/{env_id}",
        headers=auth_admin,
    )
    assert admin_del.status_code == 204

    # Environment is gone
    envs = client.get(f"/projects/{proj_id}/environments", headers=auth_admin).json()
    assert all(e["id"] != env_id for e in envs)

    # Audit event environment.deleted is present
    audit = client.get(f"/projects/{proj_id}/audit-logs", headers=auth_admin).json()
    actions = [a["action"] for a in audit]
    assert "environment.deleted" in actions


def test_delete_project_permissions_and_audit_retention(client: TestClient):
    auth_owner = register_and_login(client, "proj-owner@example.com")
    auth_member = register_and_login(client, "proj-member@example.com")

    proj = client.post("/projects", json={"name": "Project-To-Delete"}, headers=auth_owner).json()
    proj_id = proj["id"]

    env = client.post(
        f"/projects/{proj_id}/environments",
        json={"name": "Development"},
        headers=auth_owner,
    ).json()

    client.post(
        f"/projects/{proj_id}/environments/{env['id']}/variables",
        json={"key": "DATABASE_URL", "value": "postgres://usr:pwd@host/db", "is_sensitive": True},
        headers=auth_owner,
    )

    inv = client.post(
        f"/projects/{proj_id}/invites",
        json={"role": "member", "max_uses": 2, "expires_in_days": 1},
        headers=auth_owner,
    ).json()
    client.post("/projects/join", json={"code": inv["code"]}, headers=auth_member)

    # Member attempts to delete project -> 403
    unauth_del = client.delete(f"/projects/{proj_id}", headers=auth_member)
    assert unauth_del.status_code == 403

    # Owner deletes project -> 204
    owner_del = client.delete(f"/projects/{proj_id}", headers=auth_owner)
    assert owner_del.status_code == 204

    # Project is removed from project lists
    p_list_owner = client.get("/projects", headers=auth_owner).json()
    assert all(p["id"] != proj_id for p in p_list_owner)

    p_list_member = client.get("/projects", headers=auth_member).json()
    assert all(p["id"] != proj_id for p in p_list_member)
