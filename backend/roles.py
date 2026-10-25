"""Centralized role definitions and permission-checking helpers for EnvShare.

Database compatibility
----------------------
The ``ProjectMember.role`` column stores plain strings.  Existing records
contain ``"owner"`` (project creator) and ``"member"`` (default for new
members).  This module maps those stored values to authorization tiers
without renaming or migrating existing data.

Role hierarchy (highest â†’ lowest privilege)
-------------------------------------------
1. **admin**  â€“ full project control.  The stored value ``"owner"`` is
   treated as an alias for admin so that every existing project creator
   retains full access without a data migration.
2. **manager** â€“ can read, create, update, reveal, and import variables
   and environments, but cannot administer members or transfer ownership.
3. **member** â€“ read-only plus reveal/copy; cannot create, update,
   import, or delete variables or environments.
"""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import ProjectMember


# â”€â”€ Canonical role identifiers (stored in the database) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ROLE_OWNER: str = "owner"      # legacy value â€” maps to admin privileges
ROLE_ADMIN: str = "admin"      # explicit admin value (accepted if stored)
ROLE_MANAGER: str = "manager"
ROLE_MEMBER: str = "member"

# Every string the application considers a valid role.
VALID_ROLES: frozenset[str] = frozenset({
    ROLE_OWNER,
    ROLE_ADMIN,
    ROLE_MANAGER,
    ROLE_MEMBER,
})

# Roles that carry admin-level privileges.
_ADMIN_ROLES: frozenset[str] = frozenset({ROLE_OWNER, ROLE_ADMIN})


# â”€â”€ Permission sets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Each set lists the stored role strings that are authorized for a
# category of operations.

# Read-only operations: list environments, list variables, view history.
ROLES_READ: frozenset[str] = frozenset({
    ROLE_OWNER, ROLE_ADMIN, ROLE_MANAGER, ROLE_MEMBER,
})

# Reveal / copy a variable value.
ROLES_REVEAL: frozenset[str] = ROLES_READ

# Create, update, and import variables and environments. Deletion is admin-only.
ROLES_WRITE: frozenset[str] = frozenset({
    ROLE_OWNER, ROLE_ADMIN, ROLE_MANAGER,
})

# Administrative operations: manage members, transfer ownership, delete
# a project, view audit logs.
ROLES_ADMIN: frozenset[str] = _ADMIN_ROLES


# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_membership(
    project_id: int,
    user_id: int,
    db: Session,
) -> ProjectMember | None:
    """Return the ``ProjectMember`` row or ``None``."""
    return db.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )


def is_admin(role: str) -> bool:
    """Return ``True`` when *role* carries admin-level privileges."""
    return role in _ADMIN_ROLES


def require_project_role(
    project_id: int,
    user_id: int,
    db: Session,
    *,
    allowed_roles: frozenset[str],
) -> ProjectMember:
    """Verify that the user is a project member with a permitted role.

    Returns the ``ProjectMember`` on success.

    Raises
    ------
    HTTPException 404
        When the user has no membership at all (hides project existence
        from outsiders, consistent with existing behaviour).
    HTTPException 403
        When the membership exists but the role is insufficient.
    """
    membership = get_membership(project_id, user_id, db)

    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    if membership.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission for this action.",
        )

    return membership

