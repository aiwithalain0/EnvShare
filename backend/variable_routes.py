
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from encryption import decrypt_value, encrypt_value
from env_parser import parse_env_file
from models import (
    AuditEvent,
    Environment,
    ProjectMember,
    User,
    Variable,
    VariableVersion,
)
from roles import require_project_role, ROLES_READ, ROLES_WRITE, ROLES_ADMIN
from schemas import VariableCreate


router = APIRouter(
    prefix="/projects/{project_id}/environments/{environment_id}/variables",
    tags=["Variables"],
)


class VariableUpdateRequest(BaseModel):
    value: str = Field(max_length=10000)
    is_sensitive: bool = True


class VariableResponse(BaseModel):
    id: int
    environment_id: int
    key: str
    is_sensitive: bool
    updated_at: datetime


class VariableRevealResponse(BaseModel):
    key: str
    value: str


class EnvImportPreviewRequest(BaseModel):
    content: str = Field(max_length=100000)


class EnvImportRequest(BaseModel):
    content: str = Field(min_length=1, max_length=100000)
    confirm_import: bool = False
    overwrite_existing: bool = False


def get_authorized_environment(
    project_id: int,
    environment_id: int,
    user_id: int,
    db: Session,
) -> Environment:
    membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
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
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project or environment not found.",
        )

    return environment


def get_variable(
    environment_id: int,
    variable_id: int,
    db: Session,
) -> Variable:
    variable = db.scalar(
        select(Variable).where(
            Variable.id == variable_id,
            Variable.environment_id == environment_id,
            Variable.is_deleted.is_(False),
        )
    )

    if variable is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable not found.",
        )

    return variable


def decrypt_stored_value(variable: Variable) -> str:
    """Decrypt a stored value without exposing ciphertext or plaintext in logs."""
    try:
        return decrypt_value(variable.value_ciphertext)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="A stored variable could not be decrypted.",
        )


@router.post(
    "",
    response_model=VariableResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_variable(
    project_id: int,
    environment_id: int,
    variable_data: VariableCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    existing = db.scalar(
        select(Variable).where(
            Variable.environment_id == environment.id,
            Variable.key == variable_data.key,
        )
    )

    if existing and not existing.is_deleted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A variable with this key already exists.",
        )

    try:
        if existing:
            variable = existing
            variable.is_deleted = False
            variable.deleted_at = None
            variable.value_ciphertext = encrypt_value(variable_data.value)
            variable.is_sensitive = variable_data.is_sensitive
        else:
            variable = Variable(
                environment_id=environment.id,
                key=variable_data.key,
                value_ciphertext=encrypt_value(variable_data.value),
                is_sensitive=variable_data.is_sensitive,
                created_by=current_user.id,
            )
            db.add(variable)

        db.flush()

        db.add(
            VariableVersion(
                variable_id=variable.id,
                value_ciphertext=variable.value_ciphertext,
                changed_by=current_user.id,
            )
        )

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="variable.created",
                resource_type="variable",
                resource_id=variable.id,
                event_metadata={
                    "key": variable.key,
                    "is_sensitive": variable.is_sensitive,
                },
            )
        )

        db.commit()
        db.refresh(variable)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the variable.",
        )

    return variable


@router.get("", response_model=list[VariableResponse])
def list_variables(
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

    statement = (
        select(Variable)
        .where(
            Variable.environment_id == environment.id,
            Variable.is_deleted.is_(False),
        )
        .order_by(Variable.id.asc())
    )

    return list(db.scalars(statement).all())


@router.put("/{variable_id}", response_model=VariableResponse)
def update_variable(
    project_id: int,
    environment_id: int,
    variable_id: int,
    update_data: VariableUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    variable = get_variable(environment.id, variable_id, db)

    try:
        old_value = decrypt_stored_value(variable)
        sensitivity_changed = variable.is_sensitive != update_data.is_sensitive

        if old_value == update_data.value and not sensitivity_changed:
            return variable

        db.add(
            VariableVersion(
                variable_id=variable.id,
                value_ciphertext=variable.value_ciphertext,
                changed_by=current_user.id,
            )
        )

        variable.value_ciphertext = encrypt_value(update_data.value)
        variable.is_sensitive = update_data.is_sensitive

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="variable.updated",
                resource_type="variable",
                resource_id=variable.id,
                event_metadata={
                    "key": variable.key,
                    "is_sensitive": variable.is_sensitive,
                },
            )
        )

        db.commit()
        db.refresh(variable)

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not update the variable.",
        )

    return variable


@router.get(
    "/{variable_id}/reveal",
    response_model=VariableRevealResponse,
)
def reveal_variable(
    project_id: int,
    environment_id: int,
    variable_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    variable = get_variable(environment.id, variable_id, db)

    try:
        plaintext = decrypt_stored_value(variable)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="variable.revealed",
                resource_type="variable",
                resource_id=variable.id,
                event_metadata={"key": variable.key},
            )
        )
        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not record the reveal event.",
        )

    return VariableRevealResponse(key=variable.key, value=plaintext)


@router.delete(
    "/{variable_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_variable(
    project_id: int,
    environment_id: int,
    variable_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_ADMIN
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    variable = get_variable(environment.id, variable_id, db)

    try:
        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="variable.deleted",
                resource_type="variable",
                resource_id=variable.id,
                event_metadata={
                    "key": variable.key,
                    "is_sensitive": variable.is_sensitive,
                },
            )
        )

        variable.is_deleted = True
        variable.deleted_at = datetime.now(timezone.utc)
        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete the variable.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{variable_id}/history")
def get_variable_history(
    project_id: int,
    environment_id: int,
    variable_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    variable = get_variable(environment.id, variable_id, db)

    versions = db.scalars(
        select(VariableVersion)
        .where(VariableVersion.variable_id == variable.id)
        .order_by(VariableVersion.id.desc())
    ).all()

    return [
        {
            "version_id": version.id,
            "changed_by": version.changed_by,
            "changed_at": version.changed_at,
        }
        for version in versions
    ]


@router.get(
    "/{variable_id}/history/{version_id}/reveal",
    response_model=VariableRevealResponse,
)
def reveal_variable_history(
    project_id: int,
    environment_id: int,
    variable_id: int,
    version_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )
    variable = get_variable(environment.id, variable_id, db)

    version = db.scalar(
        select(VariableVersion).where(
            VariableVersion.id == version_id,
            VariableVersion.variable_id == variable.id,
        )
    )

    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Variable history version not found.",
        )

    try:
        plaintext = decrypt_value(version.value_ciphertext)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="variable.history_revealed",
                resource_type="variable",
                resource_id=variable.id,
                event_metadata={
                    "key": variable.key,
                    "version_id": version.id,
                },
            )
        )
        db.commit()

    except ValueError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not decrypt the historical value.",
        )
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not record the historical reveal.",
        )

    return VariableRevealResponse(key=variable.key, value=plaintext)


@router.post("/import/preview")
def preview_env_import(
    project_id: int,
    environment_id: int,
    import_data: EnvImportPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    parsed = parse_env_file(import_data.content)

    if parsed["errors"]:
        return {
            "valid": False,
            "errors": parsed["errors"],
            "variables": [],
        }

    active_variables = db.scalars(
        select(Variable).where(
            Variable.environment_id == environment.id,
            Variable.is_deleted.is_(False),
        )
    ).all()
    active_by_key = {variable.key: variable for variable in active_variables}

    deleted_keys = set(
        db.scalars(
            select(Variable.key).where(
                Variable.environment_id == environment.id,
                Variable.is_deleted.is_(True),
            )
        ).all()
    )

    preview = []

    for item in parsed["variables"]:
        key = item["key"]
        existing = active_by_key.get(key)

        if existing is None:
            status_val = "can_restore" if key in deleted_keys else "new"
        else:
            existing_value = decrypt_stored_value(existing)
            status_val = (
                "unchanged"
                if item["value"] == existing_value
                else "update"
            )

        preview.append(
            {
                "key": key,
                "status": status_val,
                "can_restore": key in deleted_keys,
                "is_sensitive": True,
                "existing_is_sensitive": (
                    existing.is_sensitive if existing is not None else None
                ),
            }
        )

    return {
        "valid": True,
        "errors": [],
        "variables": preview,
        "total": len(preview),
        "new_count": sum(item["status"] == "new" for item in preview),
        "update_count": sum(item["status"] == "update" for item in preview),
        "unchanged_count": sum(
            item["status"] == "unchanged" for item in preview
        ),
        "existing_count": sum(
            item["status"] in ("update", "unchanged") for item in preview
        ),
        "restore_count": sum(
            item["status"] == "can_restore" for item in preview
        ),
    }


@router.post("/import")
def import_env_file(
    project_id: int,
    environment_id: int,
    import_data: EnvImportRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    if not import_data.confirm_import:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set confirm_import to true to save the imported variables.",
        )

    parsed = parse_env_file(import_data.content)

    if parsed["errors"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "The .env content contains validation errors.",
                "errors": parsed["errors"],
            },
        )

    if not parsed["variables"]:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The .env content contains no variables to import.",
        )

    incoming_keys = [item["key"] for item in parsed["variables"]]

    if len(incoming_keys) != len(set(incoming_keys)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The import contains duplicate variable keys.",
        )

    active_variables = db.scalars(
        select(Variable).where(
            Variable.environment_id == environment.id,
            Variable.key.in_(incoming_keys),
            Variable.is_deleted.is_(False),
        )
    ).all()
    active_by_key = {variable.key: variable for variable in active_variables}

    deleted_variables = db.scalars(
        select(Variable).where(
            Variable.environment_id == environment.id,
            Variable.key.in_(incoming_keys),
            Variable.is_deleted.is_(True),
        )
    ).all()
    deleted_by_key = {variable.key: variable for variable in deleted_variables}

    updates = []
    unchanged_keys = []
    for item in parsed["variables"]:
        existing = active_by_key.get(item["key"])
        if existing is None:
            continue

        old_value = decrypt_stored_value(existing)
        if old_value == item["value"]:
            unchanged_keys.append(item["key"])
        else:
            updates.append(item["key"])

    if updates and not import_data.overwrite_existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Some variables have different existing values. "
                    "Enable overwrite to replace them."
                ),
                "conflicting_keys": updates,
            },
        )

    imported_keys = []
    updated_keys = []
    created_keys = []
    restored_keys = []

    try:
        for item in parsed["variables"]:
            key = item["key"]
            value = item["value"]

            existing = active_by_key.get(key)

            if existing is not None and key in unchanged_keys:
                continue

            ciphertext = encrypt_value(value)

            if existing is not None:
                db.add(
                    VariableVersion(
                        variable_id=existing.id,
                        value_ciphertext=existing.value_ciphertext,
                        changed_by=current_user.id,
                    )
                )
                existing.value_ciphertext = ciphertext
                existing.is_sensitive = True
                variable = existing
                updated_keys.append(key)
                action = "variable.overwritten"

            elif key in deleted_by_key:
                variable = deleted_by_key[key]
                variable.is_deleted = False
                variable.deleted_at = None
                variable.value_ciphertext = ciphertext
                variable.is_sensitive = True
                restored_keys.append(key)
                action = "variable.restored"

            else:
                variable = Variable(
                    environment_id=environment.id,
                    key=key,
                    value_ciphertext=ciphertext,
                    is_sensitive=True,
                    created_by=current_user.id,
                )
                db.add(variable)
                db.flush()
                created_keys.append(key)
                action = "variable.created"

            db.add(
                VariableVersion(
                    variable_id=variable.id,
                    value_ciphertext=ciphertext,
                    changed_by=current_user.id,
                )
            )

            db.add(
                AuditEvent(
                    user_id=current_user.id,
                    project_id=project_id,
                    action=action,
                    resource_type="variable",
                    resource_id=variable.id,
                    event_metadata={
                        "key": key,
                        "is_sensitive": True,
                        "source": "env_import",
                    },
                )
            )
            imported_keys.append(key)

        if imported_keys:
            db.add(
                AuditEvent(
                    user_id=current_user.id,
                    project_id=project_id,
                    action="variables.imported",
                    resource_type="environment",
                    resource_id=environment.id,
                    event_metadata={
                        "count": len(imported_keys),
                        "keys": imported_keys,
                        "overwrite_existing": import_data.overwrite_existing,
                    },
                )
            )

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The import failed. No variables were saved.",
        )

    return {
        "message": "Variables imported successfully.",
        "imported_count": len(imported_keys),
        "unchanged_count": len(unchanged_keys),
        "created_count": len(created_keys),
        "updated_count": len(updated_keys),
        "restored_count": len(restored_keys),
        "variables": [
            {"key": key, "is_sensitive": True}
            for key in imported_keys
        ],
   }
