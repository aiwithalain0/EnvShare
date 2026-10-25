
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import AuditEvent, Environment, Project, ProjectMember, User
from roles import require_project_role, ROLES_READ, ROLES_WRITE


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

