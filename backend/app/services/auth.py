"""
Authentication service: password hashing, JWT tokens, API key encryption.
"""
from __future__ import annotations

import base64
import hashlib
import logging
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from jose import JWTError, jwt

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(data: dict, secret_key: str, expires_hours: int = 24) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(hours=expires_hours)
    return jwt.encode(to_encode, secret_key, algorithm="HS256")


def decode_access_token(token: str, secret_key: str) -> Optional[dict]:
    try:
        return jwt.decode(token, secret_key, algorithms=["HS256"])
    except JWTError as e:
        logger.warning("JWT decode failed: %s", e)
        return None


def _fernet():
    from cryptography.fernet import Fernet
    from app.config import get_settings

    raw = hashlib.sha256(get_settings().secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(raw))


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode()).decode()


def decrypt_api_key(encrypted: str) -> str:
    return _fernet().decrypt(encrypted.encode()).decode()


def validate_anthropic_key_format(key: str) -> bool:
    return isinstance(key, str) and key.startswith("sk-ant-") and len(key) > 20
