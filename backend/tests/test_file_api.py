import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app
from file_models import FileVersion
from models import ProjectMember


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


def create_test_environment(client):
    user = {
        "email": "file-test@example.com",
        "password": "FakeTestPassword123",
    }

    assert client.post("/auth/register", json=user).status_code == 201

    login = client.post("/auth/login", json=user)
    assert login.status_code == 200

    client.headers.update({
        "Authorization": f"Bearer {login.json()['access_token']}"
    })

    project = client.post(
        "/projects",
        json={"name": "File Test Project"},
    )
    assert project.status_code == 201
    project_id = project.json()["id"]

    environment = client.post(
        f"/projects/{project_id}/environments",
        json={"name": "Development"},
    )
    assert environment.status_code == 201

    return project_id, environment.json()["id"]


def commit_files(client, project_id, environment_id, changes, message):
    return client.post(
        f"/projects/{project_id}/environments/{environment_id}/files/commits",
        json={"message": message, "changes": changes},
    )


def test_create_and_list_environment_file(client):
    project_id, environment_id = create_test_environment(client)

    response = commit_files(
        client,
        project_id,
        environment_id,
        [{"filename": ".env", "content": "API_KEY=test123\n"}],
        "Initial environment file",
    )

    assert response.status_code == 201
    assert len(response.json()["changed_files"]) == 1

    listing = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files"
    )

    assert listing.status_code == 200
    assert listing.json()[0]["filename"] == ".env"
    assert listing.json()[0]["version_number"] == 1


def test_file_content_is_preserved_exactly(client):
    project_id, environment_id = create_test_environment(client)

    original_content = (
        "# Application settings\n"
        "\n"
        "API_KEY=test123\n"
        "DATABASE_URL=postgres://localhost/db\n"
        "DEBUG=true\n"
    )

    created = commit_files(
        client,
        project_id,
        environment_id,
        [{"filename": ".env", "content": original_content}],
        "Add configuration",
    )

    assert created.status_code == 201

    file_id = created.json()["changed_files"][0]["file_id"]

    response = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/content"
    )

    assert response.status_code == 200
    displayed_content = response.json()["content"]
    assert displayed_content == (
        "# Application settings\n"
        "\n"
        "API_KEY=********\n"
        "DATABASE_URL=********\n"
        "DEBUG=true\n"
    )
    assert "test123" not in displayed_content
    assert "postgres://localhost/db" not in displayed_content


def test_file_versions_are_created(client):
    project_id, environment_id = create_test_environment(client)

    first = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "API_KEY=first\n"}],
        "First version",
    )
    assert first.status_code == 201

    second = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "API_KEY=second\n"}],
        "Update API key",
    )
    assert second.status_code == 201
    assert second.json()["changed_files"][0]["version_number"] == 2

    file_id = first.json()["changed_files"][0]["file_id"]

    history = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/history"
    )

    assert history.status_code == 200
    assert [item["version_number"] for item in history.json()] == [2, 1]


def test_one_commit_can_change_multiple_files(client):
    project_id, environment_id = create_test_environment(client)

    response = commit_files(
        client,
        project_id,
        environment_id,
        [
            {"filename": ".env", "content": "KEY=one\n"},
            {"filename": ".env.example", "content": "KEY=example\n"},
            {"filename": ".env.production", "content": "KEY=production\n"},
        ],
        "Add environment configurations",
    )

    assert response.status_code == 201
    assert len(response.json()["changed_files"]) == 3


def test_unchanged_file_does_not_create_another_version(client):
    project_id, environment_id = create_test_environment(client)

    changes = [{"filename": ".env", "content": "KEY=value\n"}]

    first = commit_files(
        client, project_id, environment_id, changes, "Initial commit"
    )
    assert first.status_code == 201

    second = commit_files(
        client, project_id, environment_id, changes, "No actual changes"
    )

    assert second.status_code == 200
    assert second.json()["commit_id"] is None
    assert second.json()["changed_files"] == []


def test_malformed_env_file_is_rejected(client):
    project_id, environment_id = create_test_environment(client)

    response = commit_files(
        client,
        project_id,
        environment_id,
        [{"filename": ".env", "content": "THIS IS NOT VALID"}],
        "Invalid file",
    )

    assert response.status_code == 422


def test_commit_history_contains_file_changes(client):
    project_id, environment_id = create_test_environment(client)

    created = commit_files(
        client,
        project_id,
        environment_id,
        [{"filename": ".env", "content": "KEY=value\n"}],
        "Initial configuration",
    )
    assert created.status_code == 201

    history = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files/commits"
    )

    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["message"] == "Initial configuration"
    assert history.json()[0]["files"][0]["filename"] == ".env"


def test_file_versions_store_encrypted_content(client):
    project_id, environment_id = create_test_environment(client)

    response = commit_files(
        client,
        project_id,
        environment_id,
        [{"filename": ".env", "content": "SECRET_VALUE=private123\n"}],
        "Encrypted file",
    )
    assert response.status_code == 201

    db_override = app.dependency_overrides[get_db]
    db = next(db_override())

    try:
        version = db.scalar(select(FileVersion))
        assert version is not None
        assert "private123" not in version.content_ciphertext
    finally:
        db.close()


def test_retrieve_historical_file_version(client):
    project_id, environment_id = create_test_environment(client)

    first = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=first\n"}],
        "Version one",
    )
    file_id = first.json()["changed_files"][0]["file_id"]

    commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=second\n"}],
        "Version two",
    )

    response = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/versions/1"
    )

    assert response.status_code == 200
    assert response.json()["content"] == "KEY=first\n"
    assert response.json()["version_number"] == 1


def test_compare_file_versions(client):
    project_id, environment_id = create_test_environment(client)

    first = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=old\n"}],
        "Version one",
    )
    file_id = first.json()["changed_files"][0]["file_id"]

    commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=new\n"}],
        "Version two",
    )

    response = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/compare",
        params={"from_version": 1, "to_version": 2},
    )

    assert response.status_code == 200
    assert any("-KEY=old" in line for line in response.json()["diff"])
    assert any("+KEY=new" in line for line in response.json()["diff"])


def test_copy_environment_file_returns_original_latest_and_historical_content(client):
    from models import AuditEvent

    project_id, environment_id = create_test_environment(client)

    first_content = "API_KEY=old-secret\nDEBUG=false\n"
    latest_content = "API_KEY=new-secret\nDEBUG=true\n"

    first = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": first_content}],
        "Initial version",
    )
    file_id = first.json()["changed_files"][0]["file_id"]

    commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": latest_content}],
        "Updated version",
    )

    base_url = (
        f"/projects/{project_id}/environments/{environment_id}"
        f"/files/{file_id}/copy"
    )

    latest_response = client.post(base_url, json={})
    assert latest_response.status_code == 200
    assert latest_response.json()["content"] == latest_content
    assert latest_response.json()["version_number"] == 2

    historical_response = client.post(
        base_url,
        json={"version_number": 1},
    )
    assert historical_response.status_code == 200
    assert historical_response.json()["content"] == first_content
    assert historical_response.json()["version_number"] == 1

    normal_view = client.get(
        f"/projects/{project_id}/environments/{environment_id}"
        f"/files/{file_id}/content"
    )
    assert normal_view.status_code == 200
    assert "new-secret" not in normal_view.json()["content"]
    assert "API_KEY=********" in normal_view.json()["content"]

    db = next(app.dependency_overrides[get_db]())
    try:
        events = db.scalars(
            select(AuditEvent).where(
                AuditEvent.action == "environment_file.copied"
            )
        ).all()

        assert len(events) == 2

        for event in events:
            metadata = str(event.event_metadata)
            assert "old-secret" not in metadata
            assert "new-secret" not in metadata
            assert event.event_metadata["filename"] == ".env"
    finally:
        db.close()


def test_restore_historical_file_version_creates_new_encrypted_version(client):
    project_id, environment_id = create_test_environment(client)

    original_content = "API_KEY=original-secret\nDEBUG=false\n"
    newer_content = "API_KEY=newer-secret\nDEBUG=true\n"

    first = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": original_content}],
        "Initial version",
    )
    file_id = first.json()["changed_files"][0]["file_id"]

    commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": newer_content}],
        "Second version",
    )

    restore_url = (
        f"/projects/{project_id}/environments/{environment_id}"
        f"/files/{file_id}/versions/1/restore"
    )
    response = client.post(restore_url)

    assert response.status_code == 200
    assert response.json()["source_version_number"] == 1
    assert response.json()["version_number"] == 3

    copy_url = (
        f"/projects/{project_id}/environments/{environment_id}"
        f"/files/{file_id}/copy"
    )
    copied = client.post(copy_url, json={})

    assert copied.status_code == 200
    assert copied.json()["version_number"] == 3
    assert copied.json()["content"] == original_content

    history_url = (
        f"/projects/{project_id}/environments/{environment_id}"
        f"/files/{file_id}/history"
    )
    history = client.get(history_url)

    assert history.status_code == 200
    assert [item["version_number"] for item in history.json()] == [3, 2, 1]


def test_rename_environment_file(client):
    project_id, environment_id = create_test_environment(client)

    created = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=value\n"}],
        "Create file",
    )
    file_id = created.json()["changed_files"][0]["file_id"]

    response = client.patch(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/rename",
        json={"filename": ".env.production"},
    )

    assert response.status_code == 200
    assert response.json()["filename"] == ".env.production"

    listing = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files"
    )
    assert listing.json()[0]["filename"] == ".env.production"


def test_delete_environment_file(client):
    project_id, environment_id = create_test_environment(client)

    created = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=value\n"}],
        "Create file",
    )
    file_id = created.json()["changed_files"][0]["file_id"]

    response = client.delete(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}"
    )

    assert response.status_code == 200

    listing = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files"
    )
    assert listing.status_code == 200
    assert listing.json() == []


def test_restore_deleted_environment_file(client):
    project_id, environment_id = create_test_environment(client)

    created = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=value\n"}],
        "Create file",
    )
    file_id = created.json()["changed_files"][0]["file_id"]

    deleted = client.delete(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}"
    )
    assert deleted.status_code == 200

    restored = client.post(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/restore"
    )

    assert restored.status_code == 200
    assert restored.json()["version_number"] == 2

    listing = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files"
    )
    assert listing.status_code == 200
    assert listing.json()[0]["filename"] == ".env"

    content = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/content"
    )
    assert content.json()["content"] == "KEY=value\n"


def test_member_can_read_files_but_cannot_modify_them(client):
    project_id, environment_id = create_test_environment(client)

    created = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=value\n"}],
        "Owner creates file",
    )
    assert created.status_code == 201

    member = {
        "email": "readonly-member@example.com",
        "password": "FakeTestPassword123",
    }
    registration = client.post("/auth/register", json=member)
    assert registration.status_code == 201
    member_id = registration.json()["id"]

    db_override = app.dependency_overrides[get_db]
    db = next(db_override())

    try:
        db.add(ProjectMember(
            project_id=project_id,
            user_id=member_id,
            role="member",
        ))
        db.commit()
    finally:
        db.close()

    login = client.post("/auth/login", json=member)
    assert login.status_code == 200

    client.headers.update({
        "Authorization": f"Bearer {login.json()['access_token']}"
    })

    listing = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files"
    )
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    write = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=changed\n"}],
        "Member attempts modification",
    )
    assert write.status_code == 403



def test_environment_deletion_removes_file_version_records(client):
    from file_models import CommitFile, EnvironmentFile, FileCommit

    project_id, environment_id = create_test_environment(client)

    created = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=value\n"}],
        "Create file",
    )
    assert created.status_code == 201

    response = client.delete(
        f"/projects/{project_id}/environments/{environment_id}"
    )
    assert response.status_code == 204

    db = next(app.dependency_overrides[get_db]())
    try:
        assert db.scalars(select(EnvironmentFile)).all() == []
        assert db.scalars(select(FileVersion)).all() == []
        assert db.scalars(select(FileCommit)).all() == []
        assert db.scalars(select(CommitFile)).all() == []
    finally:
        db.close()


def test_project_deletion_removes_file_version_records(client):
    from file_models import CommitFile, EnvironmentFile, FileCommit

    project_id, environment_id = create_test_environment(client)

    created = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "KEY=value\n"}],
        "Create file",
    )
    assert created.status_code == 201

    response = client.delete(f"/projects/{project_id}")
    assert response.status_code == 204

    db = next(app.dependency_overrides[get_db]())
    try:
        assert db.scalars(select(EnvironmentFile)).all() == []
        assert db.scalars(select(FileVersion)).all() == []
        assert db.scalars(select(FileCommit)).all() == []
        assert db.scalars(select(CommitFile)).all() == []
    finally:
        db.close()


def test_file_import_preview_masks_sensitive_values(client):
    project_id, environment_id = create_test_environment(client)

    secret = "real-secret-value-123"
    response = client.post(
        f"/projects/{project_id}/environments/{environment_id}/files/preview",
        json={
            "content": (
                "APP_NAME=EnvShare\n"
                f"API_KEY={secret}\n"
                "DEBUG=true\n"
            )
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is True
    assert data["variable_count"] == 3
    assert data["sensitive_count"] == 1
    assert data["variables"] == [
        {"key": "APP_NAME", "value": "EnvShare", "sensitive": False},
        {"key": "API_KEY", "value": "********", "sensitive": True},
        {"key": "DEBUG", "value": "true", "sensitive": False},
    ]
    assert secret not in response.text


def test_file_import_preview_reports_invalid_lines_and_duplicates(client):
    project_id, environment_id = create_test_environment(client)

    response = client.post(
        f"/projects/{project_id}/environments/{environment_id}/files/preview",
        json={
            "content": (
                "APP_NAME=EnvShare\n"
                "APP_NAME=Duplicate\n"
                "INVALID LINE\n"
            )
        },
    )

    assert response.status_code == 200
    data = response.json()

    assert data["valid"] is False
    assert len(data["errors"]) == 2
    assert any("duplicate" in error.lower() for error in data["errors"])
    assert any("expected KEY=VALUE" in error for error in data["errors"])



def test_compare_detects_sensitive_value_changes_without_exposing_secrets(client):
    project_id, environment_id = create_test_environment(client)

    first = commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "API_KEY=old-secret-value\\nDEBUG=false\\n"}],
        "Initial secret",
    )
    file_id = first.json()["changed_files"][0]["file_id"]

    commit_files(
        client, project_id, environment_id,
        [{"filename": ".env", "content": "API_KEY=new-secret-value\\nDEBUG=false\\n"}],
        "Updated secret",
    )

    response = client.get(
        f"/projects/{project_id}/environments/{environment_id}/files/{file_id}/compare",
        params={"from_version": 1, "to_version": 2},
    )

    assert response.status_code == 200
    diff = response.json()["diff"]

    assert any(line.startswith("-API_KEY=********") for line in diff)
    assert any(line.startswith("+API_KEY=********") for line in diff)

    joined_diff = "\\n".join(diff)
    assert "old-secret-value" not in joined_diff
    assert "new-secret-value" not in joined_diff
