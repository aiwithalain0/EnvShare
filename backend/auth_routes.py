
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import (
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    get_refresh_token_expiry,
    hash_refresh_token,
)
from database import get_db
from models import RefreshSession, User
from schemas import TokenResponse, UserLogin, UserRegister, UserResponse
from security import hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["Authentication"])

REFRESH_COOKIE_NAME = "envshare_refresh_token"
REFRESH_COOKIE_SECURE = (
    os.getenv("REFRESH_COOKIE_SECURE", "false").lower() == "true"
)


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=token,
        max_age=REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        httponly=True,
        secure=REFRESH_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


def unauthorized_refresh_response(detail: str) -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": detail},
    )
    clear_refresh_cookie(response)
    return response


def create_refresh_session(db: Session, user_id: int) -> str:
    raw_token = create_refresh_token()

    session = RefreshSession(
        user_id=user_id,
        token_hash=hash_refresh_token(raw_token),
        expires_at=get_refresh_token_expiry(),
    )

    db.add(session)
    return raw_token


def get_valid_refresh_session(
    db: Session,
    raw_token: str | None,
) -> RefreshSession | None:
    if not raw_token:
        return None

    token_hash = hash_refresh_token(raw_token)

    session = db.scalar(
        select(RefreshSession)
        .where(RefreshSession.token_hash == token_hash)
        .with_for_update()
    )

    if session is None or session.revoked_at is not None:
        return None

    now = datetime.now(timezone.utc)
    expires_at = session.expires_at

    # SQLite may return a naive datetime even when timezone=True.
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= now:
        return None

    return session


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def register_user(
    user_data: UserRegister,
    db: Session = Depends(get_db),
):
    existing_user = db.scalar(
        select(User).where(User.email == user_data.email)
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
    )

    db.add(user)

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    return user


@router.post("/login", response_model=TokenResponse)
def login_user(
    user_data: UserLogin,
    response: Response,
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User).where(User.email == user_data.email)
    )

    if user is None or not verify_password(
        user_data.password, user.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        refresh_token = create_refresh_session(db, user.id)
        db.commit()
    except Exception:
        db.rollback()
        raise

    set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/refresh", response_model=TokenResponse)
def refresh_access_token(
    response: Response,
    refresh_token: str | None = Cookie(
        default=None,
        alias=REFRESH_COOKIE_NAME,
    ),
    db: Session = Depends(get_db),
):
    session = get_valid_refresh_session(db, refresh_token)

    if session is None:
        return unauthorized_refresh_response(
            "Refresh session is invalid or expired. Please log in again."
        )

    user = db.get(User, session.user_id)

    if user is None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()

        return unauthorized_refresh_response(
            "User account no longer exists."
        )

    try:
        # Revoke the old token before creating its replacement.
        session.revoked_at = datetime.now(timezone.utc)

        new_refresh_token = create_refresh_session(db, user.id)
        db.commit()
    except Exception:
        db.rollback()
        raise

    set_refresh_cookie(response, new_refresh_token)

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_user(
    response: Response,
    refresh_token: str | None = Cookie(
        default=None,
        alias=REFRESH_COOKIE_NAME,
    ),
    db: Session = Depends(get_db),
):
    session = get_valid_refresh_session(db, refresh_token)

    if session is not None:
        session.revoked_at = datetime.now(timezone.utc)
        db.commit()

    clear_refresh_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response
