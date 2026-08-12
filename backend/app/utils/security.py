from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def _encode(payload: dict, expires_minutes: int) -> str:
    now = datetime.now(timezone.utc)
    to_encode = {
        **payload,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: int, role: str, institution_id: int) -> str:
    return _encode(
        {
            "sub": str(user_id),
            "type": "access",
            "role": role,
            "institution_id": institution_id,
        },
        settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )


def create_refresh_token(user_id: int, version: int) -> str:
    return _encode(
        {
            "sub": str(user_id),
            "type": "refresh",
            "version": version,
        },
        settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60,
    )


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])