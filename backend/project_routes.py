
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import AuditEvent, Project, ProjectMember, User


router = APIRouter(prefix="/projects", tags=["Projects"])


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Project name cannot be empty.")

        return value


class ProjectResponse(BaseModel):
    id: int
    name: str
    created_at: datetime


class AuditEventResponse(BaseModel):
    id: int
    user_id: int
    project_id: int
    action: str
    resource_type: str
    resource_id: int | None
    event_metadata: dict
    created_at: datetime


@router.post(
    "",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = Project(
        name=project_data.name,
        created_by=current_user.id,
    )

    try:
        db.add(project)
        db.flush()

        membership = ProjectMember(
            project_id=project.id,
            user_id=current_user.id,
            role="owner",
        )
        db.add(membership)

        audit_event = AuditEvent(
            user_id=current_user.id,
            project_id=project.id,
            action="project.created",
            resource_type="project",
            resource_id=project.id,
            event_metadata={"project_name": project.name},
        )
        db.add(audit_event)

        db.commit()
        db.refresh(project)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not create the project.",
        )

    return project


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    statement = (
        select(Project)
        .join(
            ProjectMember,
            ProjectMember.project_id == Project.id,
        )
        .where(ProjectMember.user_id == current_user.id)
        .order_by(Project.id.asc())
    )

    return list(db.scalars(statement).all())


@router.get(
    "/{project_id}/audit-logs",
    response_model=list[AuditEventResponse],
)
def get_project_audit_logs(
    project_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    statement = (
        select(AuditEvent)
        .where(AuditEvent.project_id == project_id)
        .order_by(AuditEvent.id.desc())
        .limit(limit)
    )

    return list(db.scalars(statement).all())
