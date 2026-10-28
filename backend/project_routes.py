import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from database import get_db
from dependencies import get_current_user
from models import (
    AuditEvent,
    Environment,
    InviteCode,
    Project,
    ProjectMember,
    User,
    Variable,
    VariableVersion,
)
from roles import require_project_role, ROLES_ADMIN, ROLES_READ
from schemas import (
    InviteCodeCreate,
    InviteCodeResponse,
    JoinProjectRequest,
    ProjectMemberResponse,
)


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
    user_id: int | None
    project_id: int | None
    action: str
    resource_type: str
    resource_id: int | None
    event_metadata: dict | None
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


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_ADMIN)

    project = db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    project_name = project.name

    try:
        # 1. Clean up environments and variables
        environments = list(
            db.scalars(select(Environment).where(Environment.project_id == project_id)).all()
        )
        for env in environments:
            variables = list(
                db.scalars(select(Variable).where(Variable.environment_id == env.id)).all()
            )
            for var in variables:
                versions = list(
                    db.scalars(select(VariableVersion).where(VariableVersion.variable_id == var.id)).all()
                )
                for ver in versions:
                    db.delete(ver)
                db.delete(var)
            db.delete(env)

        # 2. Clean up invite codes
        invites = list(
            db.scalars(select(InviteCode).where(InviteCode.project_id == project_id)).all()
        )
        for inv in invites:
            db.delete(inv)

        # 3. Clean up memberships
        members = list(
            db.scalars(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
        )
        for m in members:
            db.delete(m)

        # 4. Preserve existing audit events by nulling foreign key
        audit_events = list(
            db.scalars(select(AuditEvent).where(AuditEvent.project_id == project_id)).all()
        )
        for event in audit_events:
            event.project_id = None
            meta = event.event_metadata or {}
            meta["deleted_project_id"] = project_id
            meta["deleted_project_name"] = project_name
            event.event_metadata = meta

        # Record project deletion audit event
        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=None,
                action="project.deleted",
                resource_type="project",
                resource_id=project_id,
                event_metadata={"project_name": project_name},
            )
        )

        db.delete(project)
        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not delete project.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_ADMIN)
    statement = (
        select(AuditEvent)
        .where(AuditEvent.project_id == project_id)
        .order_by(AuditEvent.id.desc())
        .limit(limit)
    )

    return list(db.scalars(statement).all())


# ============================================================================
# Project Members Management
# ============================================================================

@router.get(
    "/{project_id}/members",
    response_model=list[ProjectMemberResponse],
)
def list_project_members(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_READ)

    statement = (
        select(ProjectMember, User.email)
        .join(User, User.id == ProjectMember.user_id)
        .where(ProjectMember.project_id == project_id)
        .order_by(ProjectMember.id.asc())
    )

    results = db.execute(statement).all()
    members = []
    for member, email in results:
        members.append(
            ProjectMemberResponse(
                id=member.id,
                project_id=member.project_id,
                user_id=member.user_id,
                email=email,
                role=member.role,
                created_at=member.created_at,
            )
        )
    return members


@router.delete(
    "/{project_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_project_member(
    project_id: int,
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_ADMIN)

    project = db.scalar(select(Project).where(Project.id == project_id))
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    target_membership = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )

    if not target_membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this project.",
        )

    # Protect the project creator / primary owner from removal
    if project.created_by == user_id or target_membership.role == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove the project owner.",
        )

    try:
        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="member.removed",
                resource_type="project_member",
                resource_id=target_membership.id,
                event_metadata={
                    "removed_user_id": user_id,
                    "role": target_membership.role,
                },
            )
        )
        db.delete(target_membership)
        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not remove member.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================================
# Project Invite Codes Management
# ============================================================================

@router.post(
    "/{project_id}/invites",
    response_model=InviteCodeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_invite_code(
    project_id: int,
    invite_data: InviteCodeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_ADMIN)

    # Unpredictable secure code generation with cryptographically random hex
    code = f"ENV-{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=invite_data.expires_in_days)

    invite = InviteCode(
        project_id=project_id,
        code=code,
        created_by=current_user.id,
        role=invite_data.role,
        max_uses=invite_data.max_uses,
        uses_count=0,
        is_revoked=False,
        expires_at=expires_at,
    )

    try:
        db.add(invite)
        db.flush()

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="invite_code.created",
                resource_type="invite_code",
                resource_id=invite.id,
                event_metadata={
                    "code": code,
                    "role": invite.role,
                    "max_uses": invite.max_uses,
                },
            )
        )

        db.commit()
        db.refresh(invite)

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not generate invite code.",
        )

    return invite


@router.get(
    "/{project_id}/invites",
    response_model=list[InviteCodeResponse],
)
def list_invite_codes(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_ADMIN)

    statement = (
        select(InviteCode)
        .where(InviteCode.project_id == project_id)
        .order_by(InviteCode.id.desc())
    )

    return list(db.scalars(statement).all())


@router.delete(
    "/{project_id}/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_invite_code(
    project_id: int,
    invite_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_project_role(project_id, current_user.id, db, allowed_roles=ROLES_ADMIN)

    invite = db.scalar(
        select(InviteCode).where(
            InviteCode.id == invite_id,
            InviteCode.project_id == project_id,
        )
    )

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite code not found.",
        )

    try:
        invite.is_revoked = True
        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=project_id,
                action="invite_code.revoked",
                resource_type="invite_code",
                resource_id=invite.id,
                event_metadata={"code": invite.code},
            )
        )
        db.commit()

    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not revoke invite code.",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ============================================================================
# Join Project via Invite Code
# ============================================================================

@router.post(
    "/join",
    response_model=ProjectResponse,
)
def join_project(
    join_data: JoinProjectRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    code_str = join_data.code.strip()
    invite = db.scalar(select(InviteCode).where(InviteCode.code == code_str))

    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invite code.",
        )

    if invite.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite code has been revoked.",
        )

    now = datetime.now(timezone.utc)
    if invite.expires_at:
        exp = invite.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invite code has expired.",
            )

    if invite.uses_count >= invite.max_uses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite code has reached its maximum usage limit.",
        )

    project = db.scalar(select(Project).where(Project.id == invite.project_id))
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated project no longer exists.",
        )

    existing_member = db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == invite.project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this project.",
        )

    try:
        # Atomic concurrency update for uses_count
        result = db.execute(
            update(InviteCode)
            .where(
                InviteCode.id == invite.id,
                InviteCode.uses_count < InviteCode.max_uses,
                InviteCode.is_revoked.is_(False),
            )
            .values(uses_count=InviteCode.uses_count + 1)
        )
        if result.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invite code has reached its maximum usage limit.",
            )

        membership = ProjectMember(
            project_id=invite.project_id,
            user_id=current_user.id,
            role=invite.role,
        )
        db.add(membership)

        db.add(
            AuditEvent(
                user_id=current_user.id,
                project_id=invite.project_id,
                action="member.joined",
                resource_type="project_member",
                resource_id=current_user.id,
                event_metadata={
                    "invite_code": invite.code,
                    "role": invite.role,
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
            detail="Could not join project.",
        )

    return project
