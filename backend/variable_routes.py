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
    # Ensure write permission for creating variables
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_WRITE)
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    existing = db.scalar(
        select(Variable).where(
            Variable.environment_id == environment.id,
            Variable.key == variable_data.key,
        )
    )

    if existing:
        if not existing.is_deleted:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A variable with this key already exists.",
            )

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

    try:
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
    # Ensure read permission for listing variables
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_READ)
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
    # Ensure write permission for updating variables
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_WRITE)
    environment = get_authorized_environment(
        project_id, environment_id, current_user.id, db
    )

    variable = get_variable(environment.id, variable_id, db)
    new_ciphertext = encrypt_value(update_data.value)

    try:
        db.add(
            VariableVersion(
                variable_id=variable.id,
                value_ciphertext=variable.value_ciphertext,
                changed_by=current_user.id,
            )
        )

        variable.value_ciphertext = new_ciphertext
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
        plaintext = decrypt_value(variable.value_ciphertext)

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

    except ValueError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not retrieve the variable value.",
        )
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not record the reveal event.",
        )

    return VariableRevealResponse(
        key=variable.key,
        value=plaintext,
    )


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


@router.post("/import/preview")
def preview_env_import(
    project_id: int,
    environment_id: int,
    import_data: EnvImportPreviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Ensure write permission for previewing import
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_WRITE)
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

    active_keys = set(
        db.scalars(
            select(Variable.key).where(
                Variable.environment_id == environment.id,
                Variable.is_deleted.is_(False),
            )
        ).all()
    )

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
        if key in active_keys:
            status_val = "already_exists"
        elif key in deleted_keys:
            status_val = "can_restore"
        else:
            status_val = "new"

        preview.append(
            {
                "key": key,
                "status": status_val,
                "can_restore": key in deleted_keys,
                "is_sensitive": True,
            }
        )

    return {
        "valid": True,
        "errors": [],
        "variables": preview,
        "total": len(preview),
        "new_count": sum(
            item["status"] == "new" for item in preview
        ),
        "existing_count": sum(
            item["status"] == "already_exists" for item in preview
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
    # Ensure write permission for importing variables
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_WRITE)
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

    # Reject duplicate keys in the incoming batch defensively.
    if len(incoming_keys) != len(set(incoming_keys)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The import contains duplicate variable keys.",
        )

    active_conflicting_keys = set(
        db.scalars(
            select(Variable.key).where(
                Variable.environment_id == environment.id,
                Variable.key.in_(incoming_keys),
                Variable.is_deleted.is_(False),
            )
        ).all()
    )

    if active_conflicting_keys:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": (
                    "Some variables already exist. Nothing was imported; "
                    "remove or rename the conflicting keys and retry."
                ),
                "conflicting_keys": sorted(active_conflicting_keys),
            },
        )

    deleted_variables_by_key = {
        var.key: var
        for var in db.scalars(
            select(Variable).where(
                Variable.environment_id == environment.id,
                Variable.key.in_(incoming_keys),
                Variable.is_deleted.is_(True),
            )
        ).all()
    }

    created_variables = []

    try:
        for item in parsed["variables"]:
            key = item["key"]
            ciphertext = encrypt_value(item["value"])

            if key in deleted_variables_by_key:
                variable = deleted_variables_by_key[key]
                variable.is_deleted = False
                variable.deleted_at = None
                variable.value_ciphertext = ciphertext
                variable.is_sensitive = True
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
                    action="variable.created",
                    resource_type="variable",
                    resource_id=variable.id,
                    event_metadata={
                        "key": variable.key,
                        "is_sensitive": True,
                        "source": "env_import",
                    },
                )
            )

            created_variables.append(variable.key)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="variables.imported",
                resource_type="environment",
                resource_id=environment.id,
                event_metadata={
                    "count": len(created_variables),
                    "keys": created_variables,
                },
            )
        )

        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The import failed. No variables were saved.",
        )

    return {
        "message": "Variables imported successfully.",
        "imported_count": len(created_variables),
        "variables": [
            {
                "key": key,
                "is_sensitive": True,
            }
            for key in created_variables
        ],
    }

