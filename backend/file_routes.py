from difflib import unified_diff
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from encryption import decrypt_value, encrypt_value
from env_parser import parse_env_file, mask_env_content, is_sensitive_variable
from file_models import EnvironmentFile, FileCommit, FileVersion, CommitFile
from models import AuditEvent, Environment, User
from roles import require_project_role, ROLES_READ, ROLES_REVEAL, ROLES_WRITE


router = APIRouter(
    prefix="/projects/{project_id}/environments/{environment_id}",
    tags=["Environment Files"],
)


class FileChange(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content: str = Field(max_length=100000)


class FileCommitRequest(BaseModel):
    message: str = Field(min_length=1, max_length=200)
    changes: list[FileChange] = Field(min_length=1, max_length=50)


class FileCopyRequest(BaseModel):
    version_number: int | None = Field(default=None, ge=1)


class FilePreviewRequest(BaseModel):
    content: str = Field(max_length=100000)


def get_authorized_environment(
    project_id: int,
    environment_id: int,
    user_id: int,
    db: Session,
) -> Environment:
    from models import ProjectMember

    membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=404,
            detail="Project or environment not found.",
        )

    environment = db.scalar(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.project_id == project_id,
        )
    )

    if environment is None:
        raise HTTPException(
            status_code=404,
            detail="Project or environment not found.",
        )

    return environment


def get_active_file(
    environment_id: int,
    file_id: int,
    db: Session,
) -> EnvironmentFile:
    environment_file = db.scalar(
        select(EnvironmentFile).where(
            EnvironmentFile.id == file_id,
            EnvironmentFile.environment_id == environment_id,
            EnvironmentFile.is_deleted.is_(False),
        )
    )

    if environment_file is None:
        raise HTTPException(status_code=404, detail="File not found.")

    return environment_file


def get_latest_version(
    file_id: int,
    db: Session,
) -> FileVersion | None:
    return db.scalar(
        select(FileVersion)
        .where(FileVersion.file_id == file_id)
        .order_by(FileVersion.version_number.desc())
        .limit(1)
    )


def decrypt_file_content(version: FileVersion) -> str:
    try:
        return decrypt_value(version.content_ciphertext)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="A stored file version could not be decrypted.",
        ) from None


def validate_filename(filename: str) -> None:
    invalid = (
        not filename
        or filename in {".", ".."}
        or "/" in filename
        or "\\" in filename
        or "\x00" in filename
        or any(ord(char) < 32 for char in filename)
    )

    if invalid:
        raise HTTPException(
            status_code=422,
            detail="Invalid filename. Use a filename without directory paths or control characters.",
        )


def validate_env_content(content: str) -> None:
    parsed = parse_env_file(content)

    if parsed["errors"]:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "The .env file contains validation errors.",
                "errors": parsed["errors"],
            },
        )


@router.post("/files/preview")
def preview_environment_file(
    project_id: int,
    environment_id: int,
    request: FilePreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    parsed = parse_env_file(request.content)
    variables = []

    for item in parsed["variables"]:
        sensitive = is_sensitive_variable(item["key"], item["value"])

        variables.append({
            "key": item["key"],
            "value": "********" if sensitive else item["value"],
            "sensitive": sensitive,
        })

    return {
        "valid": len(parsed["errors"]) == 0,
        "variable_count": len(variables),
        "sensitive_count": sum(
            1 for item in variables if item["sensitive"]
        ),
        "variables": variables,
        "errors": parsed["errors"],
    }


@router.post(
    "/files/commits",
    status_code=status.HTTP_201_CREATED,
)
def create_file_commit(
    project_id: int,
    environment_id: int,
    commit_data: FileCommitRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    message = commit_data.message.strip()
    if not message:
        raise HTTPException(
            status_code=422,
            detail="Commit message cannot be empty.",
        )

    filenames = [change.filename.strip() for change in commit_data.changes]

    if any(not filename for filename in filenames):
        raise HTTPException(
            status_code=422,
            detail="Filenames cannot be empty.",
        )

    for filename in filenames:
        validate_filename(filename)

    if len(filenames) != len(set(filenames)):
        raise HTTPException(
            status_code=422,
            detail="A commit cannot contain the same filename more than once.",
        )

    prepared_changes = []

    for change, filename in zip(commit_data.changes, filenames):
        validate_env_content(change.content)

        existing_file = db.scalar(
            select(EnvironmentFile).where(
                EnvironmentFile.environment_id == environment.id,
                EnvironmentFile.filename == filename,
                EnvironmentFile.is_deleted.is_(False),
            )
        )

        latest_version = (
            get_latest_version(existing_file.id, db)
            if existing_file is not None
            else None
        )

        if existing_file is not None and latest_version is not None:
            old_content = decrypt_file_content(latest_version)

            if old_content == change.content:
                continue

            change_type = "modified"
            next_version = latest_version.version_number + 1
        else:
            change_type = "added"
            next_version = 1

        prepared_changes.append(
            {
                "filename": filename,
                "content": change.content,
                "file": existing_file,
                "version_number": next_version,
                "change_type": change_type,
            }
        )

    if not prepared_changes:
        response.status_code = status.HTTP_200_OK
        return {
            "message": "No file changes detected.",
            "commit_id": None,
            "changed_files": [],
        }

    try:
        commit = FileCommit(
            environment_id=environment.id,
            author_id=current_user.id,
            message=message,
        )
        db.add(commit)
        db.flush()

        changed_files = []

        for item in prepared_changes:
            environment_file = item["file"]

            if environment_file is None:
                environment_file = EnvironmentFile(
                    environment_id=environment.id,
                    filename=item["filename"],
                    created_by=current_user.id,
                )
                db.add(environment_file)
                db.flush()

            version = FileVersion(
                file_id=environment_file.id,
                version_number=item["version_number"],
                content_ciphertext=encrypt_value(item["content"]),
                author_id=current_user.id,
            )
            db.add(version)
            db.flush()

            environment_file.updated_at = datetime.now(timezone.utc)

            db.add(
                CommitFile(
                    commit_id=commit.id,
                    file_id=environment_file.id,
                    version_id=version.id,
                    filename_at_commit=environment_file.filename,
                    change_type=item["change_type"],
                )
            )

            changed_files.append(
                {
                    "file_id": environment_file.id,
                    "filename": environment_file.filename,
                    "version_number": version.version_number,
                    "change_type": item["change_type"],
                }
            )

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="environment_files.committed",
                resource_type="file_commit",
                resource_id=commit.id,
                event_metadata={
                    "message": message,
                    "changed_file_count": len(changed_files),
                    "filenames": [
                        item["filename"] for item in changed_files
                    ],
                },
            )
        )

        db.commit()
        response.status_code = status.HTTP_201_CREATED

        return {
            "message": "File commit created successfully.",
            "commit_id": commit.id,
            "commit_message": commit.message,
            "created_at": commit.created_at,
            "changed_files": changed_files,
        }

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The file commit failed. No changes were saved.",
        ) from None


@router.get("/files")
def list_environment_files(
    project_id: int,
    environment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    files = db.scalars(
        select(EnvironmentFile)
        .where(
            EnvironmentFile.environment_id == environment.id,
            EnvironmentFile.is_deleted.is_(False),
        )
        .order_by(EnvironmentFile.filename.asc())
    ).all()

    result = []

    for environment_file in files:
        latest = get_latest_version(environment_file.id, db)

        result.append(
            {
                "id": environment_file.id,
                "filename": environment_file.filename,
                "version_number": (
                    latest.version_number if latest else None
                ),
                "created_at": environment_file.created_at,
                "updated_at": environment_file.updated_at,
            }
        )

    return result


@router.get("/files/{file_id}/content")
def get_environment_file_content(
    project_id: int,
    environment_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    latest = get_latest_version(environment_file.id, db)

    if latest is None:
        raise HTTPException(
            status_code=404,
            detail="No file content is available.",
        )

    return {
        "file_id": environment_file.id,
        "filename": environment_file.filename,
        "version_number": latest.version_number,
        "content": mask_env_content(decrypt_file_content(latest)),
    }


@router.post("/files/{file_id}/copy")
def copy_environment_file(
    project_id: int,
    environment_id: int,
    file_id: int,
    request: FileCopyRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_REVEAL
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    if request.version_number is None:
        version = get_latest_version(environment_file.id, db)
    else:
        version = db.scalar(
            select(FileVersion).where(
                FileVersion.file_id == environment_file.id,
                FileVersion.version_number == request.version_number,
            )
        )

    if version is None:
        raise HTTPException(status_code=404, detail="File version not found.")

    plaintext_content = decrypt_file_content(version)

    db.add(
        AuditEvent(
            user_id=current_user.id,
            project_id=project_id,
            action="environment_file.copied",
            resource_type="environment_file",
            resource_id=environment_file.id,
            event_metadata={
                "filename": environment_file.filename,
                "version_number": version.version_number,
            },
        )
    )
    db.commit()

    return {
        "file_id": environment_file.id,
        "filename": environment_file.filename,
        "version_number": version.version_number,
        "content": plaintext_content,
    }


@router.get("/files/{file_id}/history")
def get_environment_file_history(
    project_id: int,
    environment_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    versions = db.scalars(
        select(FileVersion)
        .where(FileVersion.file_id == environment_file.id)
        .order_by(FileVersion.version_number.desc())
    ).all()

    return [
        {
            "version_id": version.id,
            "version_number": version.version_number,
            "author_id": version.author_id,
            "created_at": version.created_at,
        }
        for version in versions
    ]


@router.get("/files/commits")
def list_environment_file_commits(
    project_id: int,
    environment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    commits = db.scalars(
        select(FileCommit)
        .where(FileCommit.environment_id == environment.id)
        .order_by(FileCommit.created_at.desc(), FileCommit.id.desc())
    ).all()

    result = []

    for commit in commits:
        changes = db.scalars(
            select(CommitFile).where(CommitFile.commit_id == commit.id)
        ).all()

        result.append(
            {
                "commit_id": commit.id,
                "message": commit.message,
                "author_id": commit.author_id,
                "created_at": commit.created_at,
                "files": [
                    {
                        "file_id": item.file_id,
                        "filename": item.filename_at_commit,
                        "version_id": item.version_id,
                        "change_type": item.change_type,
                    }
                    for item in changes
                ],
            }
        )

    return result


@router.get("/files/{file_id}/versions/{version_number}")
def get_environment_file_version(
    project_id: int,
    environment_id: int,
    file_id: int,
    version_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    version = db.scalar(
        select(FileVersion).where(
            FileVersion.file_id == environment_file.id,
            FileVersion.version_number == version_number,
        )
    )

    if version is None:
        raise HTTPException(status_code=404, detail="File version not found.")

    return {
        "file_id": environment_file.id,
        "filename": environment_file.filename,
        "version_number": version.version_number,
        "author_id": version.author_id,
        "created_at": version.created_at,
        "content": mask_env_content(decrypt_file_content(version)),
    }


@router.get("/files/{file_id}/compare")
def compare_environment_file_versions(
    project_id: int,
    environment_id: int,
    file_id: int,
    from_version: int,
    to_version: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    if from_version == to_version:
        raise HTTPException(
            status_code=422,
            detail="Choose two different versions to compare.",
        )

    versions = db.scalars(
        select(FileVersion).where(
            FileVersion.file_id == environment_file.id,
            FileVersion.version_number.in_([from_version, to_version]),
        )
    ).all()
    version_map = {item.version_number: item for item in versions}

    if from_version not in version_map or to_version not in version_map:
        raise HTTPException(status_code=404, detail="File version not found.")

    # Compare original decrypted content so sensitive-value changes are detected.
    old_content = decrypt_file_content(version_map[from_version])
    new_content = decrypt_file_content(version_map[to_version])

    raw_diff = list(
        unified_diff(
            old_content.splitlines(),
            new_content.splitlines(),
            fromfile=f"version-{from_version}",
            tofile=f"version-{to_version}",
            lineterm="",
        )
    )

    # Mask sensitive values only after the diff has detected the changes.
    diff = []
    for line in raw_diff:
        if line.startswith(("---", "+++")) or not line.startswith(("-", "+", " ")):
            diff.append(line)
            continue

        prefix, body = line[0], line[1:]
        export_prefix = ""

        if body.startswith("export "):
            export_prefix = "export "
            body = body[len("export "):]

        if "=" not in body:
            diff.append(line)
            continue

        key, value = body.split("=", maxsplit=1)

        if is_sensitive_variable(key.strip(), value):
            quote = value[0] if value and value[0] in ("'", '"') else ""
            closing_quote = quote if quote and value.endswith(quote) else ""
            body = (
                export_prefix + key + "="
                + quote + "********" + closing_quote
            )
            line = prefix + body

        diff.append(line)

    return {
        "file_id": environment_file.id,
        "filename": environment_file.filename,
        "from_version": from_version,
        "to_version": to_version,
        "diff": diff,
    }


class FileRenameRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    message: str = Field(default="Rename file", min_length=1, max_length=200)


@router.patch("/files/{file_id}/rename")
def rename_environment_file(
    project_id: int,
    environment_id: int,
    file_id: int,
    rename_data: FileRenameRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    new_filename = rename_data.filename.strip()
    message = rename_data.message.strip()

    validate_filename(new_filename)

    if not message:
        raise HTTPException(status_code=422, detail="Commit message cannot be empty.")

    old_filename = environment_file.filename

    if old_filename == new_filename:
        return {
            "message": "Filename is unchanged.",
            "file_id": environment_file.id,
            "filename": old_filename,
            "commit_id": None,
        }

    duplicate = db.scalar(
        select(EnvironmentFile).where(
            EnvironmentFile.environment_id == environment.id,
            EnvironmentFile.filename == new_filename,
            EnvironmentFile.is_deleted.is_(False),
        )
    )

    if duplicate is not None:
        raise HTTPException(status_code=409, detail="A file with this name already exists.")

    latest = get_latest_version(environment_file.id, db)
    if latest is None:
        raise HTTPException(status_code=404, detail="File content is not available.")

    try:
        commit = FileCommit(
            environment_id=environment.id,
            author_id=current_user.id,
            message=message,
        )
        db.add(commit)
        db.flush()

        environment_file.filename = new_filename
        environment_file.updated_at = datetime.now(timezone.utc)

        db.add(
            CommitFile(
                commit_id=commit.id,
                file_id=environment_file.id,
                version_id=latest.id,
                filename_at_commit=new_filename,
                change_type="renamed",
            )
        )

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="file.renamed",
                resource_type="environment_file",
                resource_id=environment_file.id,
                event_metadata={
                    "old_filename": old_filename,
                    "new_filename": new_filename,
                    "commit_id": commit.id,
                },
            )
        )

        db.commit()

        return {
            "message": "File renamed successfully.",
            "file_id": environment_file.id,
            "old_filename": old_filename,
            "filename": new_filename,
            "commit_id": commit.id,
        }
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The file rename failed. No changes were saved.",
        ) from None


@router.delete("/files/{file_id}")
def delete_environment_file(
    project_id: int,
    environment_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    latest = get_latest_version(environment_file.id, db)
    if latest is None:
        raise HTTPException(status_code=404, detail="File content is not available.")

    try:
        commit = FileCommit(
            environment_id=environment.id,
            author_id=current_user.id,
            message=f"Delete {environment_file.filename}",
        )
        db.add(commit)
        db.flush()

        filename = environment_file.filename
        environment_file.is_deleted = True
        environment_file.deleted_at = datetime.now(timezone.utc)
        environment_file.updated_at = datetime.now(timezone.utc)

        db.add(
            CommitFile(
                commit_id=commit.id,
                file_id=environment_file.id,
                version_id=latest.id,
                filename_at_commit=filename,
                change_type="deleted",
            )
        )

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="file.deleted",
                resource_type="environment_file",
                resource_id=environment_file.id,
                event_metadata={
                    "filename": filename,
                    "commit_id": commit.id,
                },
            )
        )

        db.commit()

        return {
            "message": "File deleted successfully.",
            "file_id": environment_file.id,
            "filename": filename,
            "commit_id": commit.id,
        }
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The file deletion failed. No changes were saved.",
        ) from None


@router.post("/files/{file_id}/versions/{version_number}/restore")
def restore_environment_file_version(
    project_id: int,
    environment_id: int,
    file_id: int,
    version_number: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    environment_file = get_active_file(environment.id, file_id, db)

    selected_version = db.scalar(
        select(FileVersion).where(
            FileVersion.file_id == environment_file.id,
            FileVersion.version_number == version_number,
        )
    )

    if selected_version is None:
        raise HTTPException(status_code=404, detail="File version not found.")

    latest = get_latest_version(environment_file.id, db)
    if latest is None:
        raise HTTPException(status_code=404, detail="File content is not available.")

    try:
        restored_content = decrypt_file_content(selected_version)

        commit = FileCommit(
            environment_id=environment.id,
            author_id=current_user.id,
            message=f"Restore {environment_file.filename} to version {version_number}",
        )
        db.add(commit)
        db.flush()

        next_version_number = latest.version_number + 1
        restored_version = FileVersion(
            file_id=environment_file.id,
            version_number=next_version_number,
            content_ciphertext=encrypt_value(restored_content),
            author_id=current_user.id,
        )
        db.add(restored_version)
        db.flush()

        environment_file.updated_at = datetime.now(timezone.utc)

        db.add(
            CommitFile(
                commit_id=commit.id,
                file_id=environment_file.id,
                version_id=restored_version.id,
                filename_at_commit=environment_file.filename,
                change_type="restored",
            )
        )

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="environment_file.version_restored",
                resource_type="environment_file",
                resource_id=environment_file.id,
                event_metadata={
                    "filename": environment_file.filename,
                    "source_version_number": selected_version.version_number,
                    "new_version_number": next_version_number,
                    "commit_id": commit.id,
                },
            )
        )

        db.commit()

        return {
            "message": "Historical file version restored successfully.",
            "file_id": environment_file.id,
            "filename": environment_file.filename,
            "source_version_number": selected_version.version_number,
            "version_number": next_version_number,
            "commit_id": commit.id,
        }

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The historical version restoration failed. No changes were saved.",
        ) from None


@router.post("/files/{file_id}/restore")
def restore_environment_file(
    project_id: int,
    environment_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    environment_file = db.scalar(
        select(EnvironmentFile).where(
            EnvironmentFile.id == file_id,
            EnvironmentFile.environment_id == environment.id,
            EnvironmentFile.is_deleted.is_(True),
        )
    )

    if environment_file is None:
        raise HTTPException(status_code=404, detail="Deleted file not found.")

    duplicate = db.scalar(
        select(EnvironmentFile).where(
            EnvironmentFile.environment_id == environment.id,
            EnvironmentFile.filename == environment_file.filename,
            EnvironmentFile.is_deleted.is_(False),
        )
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail="An active file with this name already exists.",
        )

    latest = get_latest_version(environment_file.id, db)
    if latest is None:
        raise HTTPException(status_code=404, detail="File version not found.")

    try:
        previous_content = decrypt_file_content(latest)

        commit = FileCommit(
            environment_id=environment.id,
            author_id=current_user.id,
            message=f"Restore {environment_file.filename}",
        )
        db.add(commit)
        db.flush()

        next_version_number = latest.version_number + 1
        restored_version = FileVersion(
            file_id=environment_file.id,
            version_number=next_version_number,
            content_ciphertext=encrypt_value(previous_content),
            author_id=current_user.id,
        )
        db.add(restored_version)
        db.flush()

        environment_file.is_deleted = False
        environment_file.deleted_at = None
        environment_file.updated_at = datetime.now(timezone.utc)

        db.add(
            CommitFile(
                commit_id=commit.id,
                file_id=environment_file.id,
                version_id=restored_version.id,
                filename_at_commit=environment_file.filename,
                change_type="restored",
            )
        )

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="file.restored",
                resource_type="environment_file",
                resource_id=environment_file.id,
                event_metadata={
                    "filename": environment_file.filename,
                    "version_number": next_version_number,
                    "commit_id": commit.id,
                },
            )
        )

        db.commit()

        return {
            "message": "File restored successfully.",
            "file_id": environment_file.id,
            "filename": environment_file.filename,
            "version_number": next_version_number,
            "commit_id": commit.id,
        }
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The file restoration failed. No changes were saved.",
        ) from None

