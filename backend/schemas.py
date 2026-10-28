
import re
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if value != value.strip():
            raise ValueError("Password must not start or end with whitespace.")

        if not re.search(r"[A-Za-z]", value):
            raise ValueError("Password must contain at least one letter.")

        if not re.search(r"\d", value):
            raise ValueError("Password must contain at least one number.")

        return value


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class VariableCreate(BaseModel):
    key: str = Field(min_length=1, max_length=200)
    value: str = Field(max_length=10000)
    is_sensitive: bool = True

    @field_validator("key")
    @classmethod
    def validate_key(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("Variable key cannot be empty.")

        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
            raise ValueError(
                "Variable keys must start with a letter or underscore "
                "and contain only letters, digits, and underscores."
            )

        return value


class VariableUpdate(BaseModel):
    value: str = Field(max_length=10000)
    is_sensitive: bool = True


class VariableResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    environment_id: int
    key: str
    is_sensitive: bool
    created_at: datetime
    updated_at: datetime


class VariableRevealResponse(BaseModel):
    key: str
    value: str


class InviteCodeCreate(BaseModel):
    role: str = "member"
    max_uses: int = Field(default=1, ge=1, le=1000)
    expires_in_days: int = Field(default=7, ge=1, le=365)

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        value = value.strip().lower()
        if value not in {"member", "manager"}:
            raise ValueError("Invite role must be either 'member' or 'manager'.")
        return value


class InviteCodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    code: str
    role: str
    max_uses: int
    uses_count: int
    is_revoked: bool
    expires_at: datetime | None
    created_at: datetime


class JoinProjectRequest(BaseModel):
    code: str = Field(min_length=1, max_length=64)

    @field_validator("code")
    @classmethod
    def validate_code(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Invite code cannot be empty.")
        return value


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    user_id: int
    email: str
    role: str
    created_at: datetime
