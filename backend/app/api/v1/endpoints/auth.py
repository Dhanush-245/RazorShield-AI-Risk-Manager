from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
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
    opaque_token,
    token_digest,
    verify_secret,
)
from app.database.session import get_db
from app.models.auth import PasswordResetChallenge, RefreshSession, User
from app.schemas.auth import (
    AuthUser,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    LoginRequest,
    LoginResponse,
    MessageResponse,
    RefreshResponse,
    ResetPasswordRequest,
    VerifyOtpRequest,
    VerifyOtpResponse,
)
from app.services.otp_delivery import OtpDeliveryError, check_managed_otp, send_managed_otp

router = APIRouter(prefix="/auth", tags=["authentication"])
settings = get_settings()
dummy_password_hash = hash_secret("not-a-real-user-password")
generic_recovery_message = "If an account matches, a verification code has been sent."
refresh_cookie_name = "razorshield_refresh"


def as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def find_user(db: Session, identifier: str) -> User | None:
    normalized = normalize_identifier(identifier)
    return db.scalar(
        select(User).where(or_(User.email_normalized == normalized, User.phone_normalized == normalized))
    )


def auth_user(user: User) -> AuthUser:
    return AuthUser(
        id=user.id,
        merchant_id=user.merchant_id,
        merchant_reference=user.merchant.external_id,
        display_name=user.display_name,
        role=user.role,
    )


def access_response(user: User, *, rotated: bool = False) -> LoginResponse | RefreshResponse:
    access_token = create_token(
        user.id,
        "access",
        settings.access_token_minutes,
        merchant_id=user.merchant_id,
        role=user.role.value,
    )
    values = {
        "access_token": access_token,
        "expires_in_seconds": settings.access_token_minutes * 60,
        "user": auth_user(user),
    }
    return RefreshResponse(**values) if rotated else LoginResponse(**values)


def create_refresh_session(db: Session, user_id: str) -> tuple[RefreshSession, str]:
    raw_token = opaque_token()
    session = RefreshSession(
        user_id=user_id,
        token_hash=token_digest(raw_token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
    )
    db.add(session)
    return session, raw_token


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        refresh_cookie_name,
        token,
        max_age=settings.refresh_token_days * 24 * 60 * 60,
        httponly=True,
        secure=settings.environment in {"staging", "production"},
        samesite="strict",
        path="/api/v1/auth",
    )


def revoke_replacement_chain(db: Session, session: RefreshSession, now: datetime) -> None:
    """Invalidate the live descendant when a rotated token is replayed."""

    seen = {session.id}
    replacement_id = session.replaced_by_id
    while replacement_id and replacement_id not in seen:
        seen.add(replacement_id)
        replacement = db.get(RefreshSession, replacement_id)
        if replacement is None:
            break
        if replacement.revoked_at is None:
            replacement.revoked_at = now
        replacement_id = replacement.replaced_by_id


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> LoginResponse:
    user = find_user(db, payload.identifier)
    encoded_password = user.password_hash if user else dummy_password_hash
    password_valid = verify_secret(payload.password, encoded_password)
    if user is None or not user.is_active or not password_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    _session, refresh_token = create_refresh_session(db, user.id)
    result = access_response(user)
    db.commit()
    set_refresh_cookie(response, refresh_token)
    return result


@router.post("/refresh", response_model=RefreshResponse)
def refresh(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> RefreshResponse:
    raw_token = request.cookies.get(refresh_cookie_name)
    session = (
        db.scalar(
            select(RefreshSession)
            .where(RefreshSession.token_hash == token_digest(raw_token))
            .with_for_update()
        )
        if raw_token
        else None
    )
    now = datetime.now(UTC)
    if session is not None and session.revoked_at is not None:
        revoke_replacement_chain(db, session, now)
        db.commit()
        response.delete_cookie(refresh_cookie_name, path="/api/v1/auth")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session refresh denied")
    if session is None or as_utc(session.expires_at) <= now:
        response.delete_cookie(refresh_cookie_name, path="/api/v1/auth")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session refresh denied")
    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        session.revoked_at = now
        db.commit()
        response.delete_cookie(refresh_cookie_name, path="/api/v1/auth")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session refresh denied")
    replacement, replacement_token = create_refresh_session(db, user.id)
    db.flush()
    session.revoked_at = now
    session.replaced_by_id = replacement.id
    result = access_response(user, rotated=True)
    db.commit()
    set_refresh_cookie(response, replacement_token)
    return result


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db)],
) -> MessageResponse:
    raw_token = request.cookies.get(refresh_cookie_name)
    if raw_token:
        session = db.scalar(
            select(RefreshSession).where(RefreshSession.token_hash == token_digest(raw_token))
        )
        if session and session.revoked_at is None:
            session.revoked_at = datetime.now(UTC)
            db.commit()
    response.delete_cookie(refresh_cookie_name, path="/api/v1/auth")
    return MessageResponse(message="Signed out")


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
    for session in db.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
    ):
        session.revoked_at = now
    db.commit()
    return MessageResponse(message="Password reset successful. You can now sign in.")
