import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)


def normalize_identifier(identifier: str) -> str:
    value = identifier.strip().lower()
    if "@" in value:
        return value
    return "+" + "".join(character for character in value if character.isdigit())


def identifier_digest(identifier: str) -> str:
    return hashlib.sha256(normalize_identifier(identifier).encode()).hexdigest()


def opaque_token() -> str:
    return secrets.token_urlsafe(48)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_secret(secret: str) -> str:
    return password_hasher.hash(secret)


def verify_secret(secret: str, encoded: str) -> bool:
    try:
        return password_hasher.verify(encoded, secret)
    except (VerifyMismatchError, InvalidHashError):
        return False


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def create_token(subject: str, token_type: str, minutes: int, **claims: Any) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
        "jti": secrets.token_urlsafe(16),
        **claims,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str, expected_type: str) -> dict[str, Any]:
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Unexpected token type")
    return payload
