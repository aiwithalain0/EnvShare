
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import (
    AuditEvent,
    Environment,
    EnvironmentSnapshot,
    Project,
    ProjectMember,
    User,
    Variable,
    VariableVersion,
)
from roles import require_project_role, ROLES_READ, ROLES_WRITE, ROLES_ADMIN


router = APIRouter(
    prefix="/projects/{project_id}/environments",
    tags=["Environments"],
)


class EnvironmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Environment name cannot be empty.")

        return value


class EnvironmentSnapshotCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_snapshot_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Snapshot name cannot be empty.")
        return value


class EnvironmentSnapshotResponse(BaseModel):
    id: int
    environment_id: int
    created_by: int
    name: str
    created_at: datetime


class EnvironmentResponse(BaseModel):
    id: int
    project_id: int
    name: str
    created_at: datetime


def verify_project_membership(
    project_id: int,
    user_id: int,
    db: Session,
) -> Project:
    project = db.scalar(
        select(Project).where(Project.id == project_id)
    )

    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project.",
        )

    return project


@router.post(
    "",
    response_model=EnvironmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_environment(
    project_id: int,
    environment_data: EnvironmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = verify_project_membership(
        project_id,
        current_user.id,
        db,
    )
    # Ensure user has write permission on the project

    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_WRITE)

    existing_environment = db.scalar(
        select(Environment).where(
            Environment.project_id == project_id,
            Environment.name == environment_data.name,
        )
    )

    if existing_environment:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An environment with this name already exists.",
        )

    environment = Environment(
        project_id=project.id,
        name=environment_data.name,
    )

    try:
        db.add(environment)
        db.flush()

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project.id,
                action="environment.created",
                resource_type="environment",
                resource_id=environment.id,
                event_metadata={"environment_name": environment.name},
            )
        )

        db.commit()
        db.refresh(environment)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the environment.",
        )

    return environment


@router.get("", response_model=list[EnvironmentResponse])
def list_environments(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    verify_project_membership(
        project_id,
        current_user.id,
        db,
    )


    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_READ)

    statement = (
        select(Environment)
        .where(Environment.project_id == project_id)
        .order_by(Environment.id.asc())
    )

    return list(db.scalars(statement).all())


@router.post(
    "/{environment_id}/snapshots",
    response_model=EnvironmentSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_environment_snapshot(
    project_id: int,
    environment_id: int,
    snapshot_data: EnvironmentSnapshotCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    verify_project_membership(project_id, current_user.id, db)

    environment = db.scalar(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.project_id == project_id,
        )
    )
    if environment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found.",
        )

    variables = list(
        db.scalars(
            select(Variable)
            .where(Variable.environment_id == environment_id)
            .order_by(Variable.id.asc())
        ).all()
    )

    snapshot_items = [
        {
            "key": variable.key,
            "value_ciphertext": variable.value_ciphertext,
            "is_sensitive": variable.is_sensitive,
            "is_deleted": variable.is_deleted,
            "deleted_at": (
                variable.deleted_at.isoformat()
                if variable.deleted_at is not None
                else None
            ),
        }
        for variable in variables
    ]

    try:
        snapshot = EnvironmentSnapshot(
            environment_id=environment_id,
            created_by=current_user.id,
            name=snapshot_data.name,
            snapshot_data=snapshot_items,
        )
        db.add(snapshot)
        db.flush()

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="environment.snapshot_created",
                resource_type="environment_snapshot",
                resource_id=snapshot.id,
                event_metadata={
                    "environment_id": environment_id,
                    "snapshot_name": snapshot.name,
                    "variable_count": len(snapshot_items),
                },
            )
        )
        db.commit()
        db.refresh(snapshot)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the environment snapshot.",
        )

    return snapshot


@router.get(
    "/{environment_id}/snapshots",
    response_model=list[EnvironmentSnapshotResponse],
)
def list_environment_snapshots(
    project_id: int,
    environment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_READ
    )
    verify_project_membership(project_id, current_user.id, db)

    environment = db.scalar(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.project_id == project_id,
        )
    )
    if environment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found.",
        )

    return list(
        db.scalars(
            select(EnvironmentSnapshot)
            .where(EnvironmentSnapshot.environment_id == environment_id)
            .order_by(EnvironmentSnapshot.created_at.desc(), EnvironmentSnapshot.id.desc())
        ).all()
    )


@router.post(
    "/{environment_id}/snapshots/{snapshot_id}/rollback",
)
def rollback_environment_snapshot(
    project_id: int,
    environment_id: int,
    snapshot_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(
        project_id, current_user.id, db, allowed_roles=ROLES_WRITE
    )
    verify_project_membership(project_id, current_user.id, db)

    environment = db.scalar(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.project_id == project_id,
        )
    )
    if environment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found.",
        )

    snapshot = db.scalar(
        select(EnvironmentSnapshot).where(
            EnvironmentSnapshot.id == snapshot_id,
            EnvironmentSnapshot.environment_id == environment_id,
        )
    )
    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Snapshot not found for this environment.",
        )

    snapshot_items = snapshot.snapshot_data
    if not isinstance(snapshot_items, list):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Snapshot data is invalid.",
        )

    snapshot_by_key = {}
    for item in snapshot_items:
        if (
            not isinstance(item, dict)
            or not isinstance(item.get("key"), str)
            or not isinstance(item.get("value_ciphertext"), str)
            or not isinstance(item.get("is_sensitive"), bool)
            or not isinstance(item.get("is_deleted"), bool)
        ):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Snapshot data is invalid.",
            )
        if item["key"] in snapshot_by_key:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Snapshot contains duplicate variable keys.",
            )
        snapshot_by_key[item["key"]] = item

    variables = list(
        db.scalars(
            select(Variable)
            .where(Variable.environment_id == environment_id)
            .order_by(Variable.id.asc())
        ).all()
    )
    variables_by_key = {variable.key: variable for variable in variables}

    restored_count = 0
    created_count = 0
    soft_deleted_count = 0

    try:
        for key, item in snapshot_by_key.items():
            variable = variables_by_key.get(key)

            deleted_at_value = item.get("deleted_at")
            if deleted_at_value is None:
                restored_deleted_at = None
            elif isinstance(deleted_at_value, str):
                restored_deleted_at = datetime.fromisoformat(deleted_at_value)
            else:
                raise ValueError("Invalid snapshot deletion timestamp.")

            if variable is None:
                variable = Variable(
                    environment_id=environment_id,
                    key=key,
                    value_ciphertext=item["value_ciphertext"],
                    is_sensitive=item["is_sensitive"],
                    created_by=current_user.id,
                    is_deleted=item["is_deleted"],
                    deleted_at=restored_deleted_at,
                )
                db.add(variable)
                db.flush()

                db.add(
                    VariableVersion(
                        variable_id=variable.id,
                        value_ciphertext=item["value_ciphertext"],
                        changed_by=current_user.id,
                    )
                )
                variables_by_key[key] = variable
                created_count += 1
                continue

            changed = (
                variable.value_ciphertext != item["value_ciphertext"]
                or variable.is_sensitive != item["is_sensitive"]
                or variable.is_deleted != item["is_deleted"]
                or variable.deleted_at != restored_deleted_at
            )

            if changed:
                db.add(
                    VariableVersion(
                        variable_id=variable.id,
                        value_ciphertext=variable.value_ciphertext,
                        changed_by=current_user.id,
                    )
                )

                variable.value_ciphertext = item["value_ciphertext"]
                variable.is_sensitive = item["is_sensitive"]
                variable.is_deleted = item["is_deleted"]
                variable.deleted_at = restored_deleted_at
                restored_count += 1

        for variable in variables:
            if variable.key not in snapshot_by_key and not variable.is_deleted:
                db.add(
                    VariableVersion(
                        variable_id=variable.id,
                        value_ciphertext=variable.value_ciphertext,
                        changed_by=current_user.id,
                    )
                )
                variable.is_deleted = True
                variable.deleted_at = datetime.now(timezone.utc)
                soft_deleted_count += 1

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="environment.snapshot_rolled_back",
                resource_type="environment_snapshot",
                resource_id=snapshot.id,
                event_metadata={
                    "environment_id": environment_id,
                    "snapshot_id": snapshot.id,
                    "restored_count": restored_count,
                    "created_count": created_count,
                    "soft_deleted_count": soft_deleted_count,
                },
            )
        )
        db.commit()

    except (SQLAlchemyError, ValueError, TypeError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not roll back the environment snapshot.",
        )

    return {
        "message": "Environment snapshot restored successfully.",
        "snapshot_id": snapshot.id,
        "restored_count": restored_count,
        "created_count": created_count,
        "soft_deleted_count": soft_deleted_count,
    }


@router.delete(
    "/{environment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_environment(
    project_id: int,
    environment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_ADMIN)

    environment = db.scalar(
        select(Environment).where(
            Environment.id == environment_id,
            Environment.project_id == project_id,
        )
    )

    if environment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Environment not found.",
        )

    env_name = environment.name

    try:
        # Delete variable versions and variables in this environment
        variables = list(
            db.scalars(select(Variable).where(Variable.environment_id == environment.id)).all()
        )
        for var in variables:
            versions = list(
                db.scalars(select(VariableVersion).where(VariableVersion.variable_id == var.id)).all()
            )
            for ver in versions:
                db.delete(ver)
            db.delete(var)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="environment.deleted",
                resource_type="environment",
                resource_id=environment.id,
                event_metadata={"environment_name": env_name},
            )
        )

        db.delete(environment)
        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete environment.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)
