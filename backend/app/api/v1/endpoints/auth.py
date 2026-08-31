from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import (
    create_token,
    decode_token,
    generate_otp,
    hash_secret,
    identifier_digest,
    normalize_identifier,
    verify_secret,
)
from app.database.session import get_db
from app.models.auth import PasswordResetChallenge, User
from app.schemas.auth import (
    AuthUser,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    ResetPasswordRequest,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services.otp_delivery import OtpDeliveryError, check_managed_otp, send_managed_otp

router = APIRouter(prefix="/auth", tags=["authentication"])
settings = get_settings()
dummy_password_hash = hash_secret("not-a-real-user-password")
generic_recovery_message = "If an account matches, a verification code has been sent."


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def find_user(db: Session, identifier: str) -> User | None:
    normalized = normalize_identifier(identifier)
    return db.scalar(
        select(User).where(or_(User.email_normalized == normalized, User.phone_normalized == normalized))
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Annotated[Session, Depends(get_db)]) -> LoginResponse:
    user = find_user(db, payload.identifier)
    encoded_password = user.password_hash if user else dummy_password_hash
    password_valid = verify_secret(payload.password, encoded_password)
    if user is None or not user.is_active or not password_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    access_token = create_token(
        user.id,
        "access",
        settings.access_token_minutes,
        merchant_id=user.merchant_id,
        role=user.role.value,
    )
    return LoginResponse(
        access_token=access_token,
        expires_in_seconds=settings.access_token_minutes * 60,
        user=AuthUser(
            id=user.id,
            merchant_id=user.merchant_id,
            merchant_reference=user.merchant.external_id,
            display_name=user.display_name,
            role=user.role,
        ),
    )


@router.post("/password/forgot", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
) -> ForgotPasswordResponse:
    user = find_user(db, payload.identifier)
    otp = generate_otp()
    managed = settings.otp_delivery_provider.lower() == "twilio-verify"
    destination = user.phone_normalized if user and user.phone_normalized else None
    if managed and destination:
        try:
            send_managed_otp(destination, settings)
        except OtpDeliveryError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Verification service is temporarily unavailable",
            ) from exc
    db.add(
        PasswordResetChallenge(
            user_id=user.id if user else None,
            identifier_hash=identifier_digest(payload.identifier),
            otp_hash=hash_secret(otp),
            expires_at=datetime.now(UTC) + timedelta(minutes=settings.otp_minutes),
        )
    )
    db.commit()
    return ForgotPasswordResponse(
        message=generic_recovery_message,
        development_otp=otp if settings.environment == "development" else None,
    )


@router.post("/password/verify-otp", response_model=VerifyOtpResponse)
def verify_otp(
    payload: VerifyOtpRequest,
    db: Annotated[Session, Depends(get_db)],
) -> VerifyOtpResponse:
    challenge = db.scalar(
        select(PasswordResetChallenge)
        .where(
            PasswordResetChallenge.identifier_hash == identifier_digest(payload.identifier),
            PasswordResetChallenge.used_at.is_(None),
        )
        .order_by(PasswordResetChallenge.created_at.desc())
        .limit(1)
    )
    now = datetime.now(UTC)
    invalid = (
        challenge is None
        or challenge.user_id is None
        or as_utc(challenge.expires_at) < now
        or challenge.attempts >= settings.otp_max_attempts
    )
    code_valid = False
    if not invalid:
        if settings.otp_delivery_provider.lower() == "twilio-verify":
            user = db.get(User, challenge.user_id)
            destination = user.phone_normalized if user else None
            if destination:
                try:
                    code_valid = check_managed_otp(destination, payload.otp, settings)
                except OtpDeliveryError as exc:
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Verification service is temporarily unavailable",
                    ) from exc
        else:
            code_valid = verify_secret(payload.otp, challenge.otp_hash)
    if invalid or not code_valid:
        if challenge is not None:
            challenge.attempts += 1
            db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code")

    reset_token = create_token(
        challenge.user_id,
        "password_reset",
        settings.reset_token_minutes,
        challenge_id=challenge.id,
    )
    return VerifyOtpResponse(
        reset_token=reset_token,
        expires_in_seconds=settings.reset_token_minutes * 60,
    )


@router.post("/password/reset", response_model=MessageResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    try:
        token = decode_token(payload.reset_token, "password_reset")
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token"
        ) from exc

    challenge = db.get(PasswordResetChallenge, token.get("challenge_id"))
    user = db.get(User, token.get("sub"))
    now = datetime.now(UTC)
    if (
        challenge is None
        or user is None
        or challenge.user_id != user.id
        or challenge.used_at is not None
        or as_utc(challenge.expires_at) < now
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user.password_hash = hash_secret(payload.new_password)
    challenge.used_at = now
    db.commit()
    return MessageResponse(message="Password reset successful. You can now sign in.")
