"""
Authentication endpoints: register, login, API key management.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.services.auth import (
    create_access_token,
    decode_access_token,
    decrypt_api_key,
    encrypt_api_key,
    hash_password,
    validate_anthropic_key_format,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    has_api_key: bool


class ApiKeyRequest(BaseModel):
    anthropic_api_key: str


class UserResponse(BaseModel):
    id: str
    email: str
    has_api_key: bool
    created_at: str


class MessageResponse(BaseModel):
    message: str


# ── Auth dependency ───────────────────────────────────────────────────────────

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please log in.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise exc
    payload = decode_access_token(token, get_settings().secret_key)
    if not payload:
        raise exc
    email: str = payload.get("sub", "")
    if not email:
        raise exc
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise exc
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")
    return user


async def get_optional_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    if not token:
        return None
    try:
        return await get_current_user(token, db)
    except HTTPException:
        return None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=LoginResponse, status_code=201)
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    email = req.email.lower().strip()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(email=email, hashed_password=hash_password(req.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    logger.info("New user registered: %s", email)

    settings = get_settings()
    token = create_access_token(
        {"sub": user.email}, settings.secret_key, settings.access_token_expire_hours
    )
    return LoginResponse(
        access_token=token, user_id=str(user.id), email=user.email, has_api_key=False
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    email = form_data.username.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is deactivated")

    user.last_login = datetime.utcnow()
    await db.commit()

    settings = get_settings()
    token = create_access_token(
        {"sub": user.email}, settings.secret_key, settings.access_token_expire_hours
    )
    return LoginResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
        has_api_key=bool(user.anthropic_api_key_encrypted),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        has_api_key=bool(current_user.anthropic_api_key_encrypted),
        created_at=current_user.created_at.isoformat(),
    )


@router.post("/api-key", response_model=MessageResponse)
async def save_api_key(
    req: ApiKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    key = req.anthropic_api_key.strip()
    if not validate_anthropic_key_format(key):
        raise HTTPException(
            status_code=400,
            detail="Invalid API key format. Anthropic keys start with sk-ant-",
        )
    current_user.anthropic_api_key_encrypted = encrypt_api_key(key)
    await db.commit()
    logger.info("API key saved for user: %s", current_user.email)
    return MessageResponse(message="API key saved securely. You can now run analyses.")


@router.delete("/api-key", response_model=MessageResponse)
async def delete_api_key(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.anthropic_api_key_encrypted = None
    await db.commit()
    return MessageResponse(message="API key removed successfully")


@router.post("/logout", response_model=MessageResponse)
async def logout(current_user: User = Depends(get_current_user)):
    return MessageResponse(message="Logged out successfully")
