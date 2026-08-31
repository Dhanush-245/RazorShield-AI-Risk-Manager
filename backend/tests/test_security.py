import jwt
import pytest
import redis

from app.core.config import Settings
from app.core.rate_limit import RateLimitBackendUnavailable, RedisSlidingWindowLimiter
from app.core.security import (
    create_token,
    decode_token,
    hash_secret,
    identifier_digest,
    normalize_identifier,
    verify_secret,
)


def test_password_hash_is_salted_and_verifiable() -> None:
    first = hash_secret("correct horse battery staple")
    second = hash_secret("correct horse battery staple")
    assert first != second
    assert "correct horse battery staple" not in first
    assert verify_secret("correct horse battery staple", first)
    assert not verify_secret("wrong password", first)


def test_identifier_normalization_supports_email_and_phone() -> None:
    assert normalize_identifier(" Analyst@Example.COM ") == "analyst@example.com"
    assert normalize_identifier("+91 98765-43210") == "+919876543210"
    assert identifier_digest("Analyst@example.com") == identifier_digest(" analyst@EXAMPLE.com ")


def test_token_scope_cannot_be_reused_for_password_reset() -> None:
    token = create_token("user-1", "access", 5, merchant_id="merchant-1", role="ADMIN")
    payload = decode_token(token, "access")
    assert payload["sub"] == "user-1"
    try:
        decode_token(token, "password_reset")
    except jwt.InvalidTokenError:
        pass
    else:
        raise AssertionError("access token was accepted as password reset token")


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"jwt_secret": "short"}, "JWT_SECRET"),
        ({"auto_seed_demo": True}, "AUTO_SEED_DEMO"),
        ({"database_url": "sqlite:///./production.db"}, "non-SQLite"),
        ({"allowed_origins": ["http://localhost:5173"]}, "CORS"),
    ],
)
def test_production_rejects_insecure_runtime_configuration(
    overrides: dict[str, object], message: str
) -> None:
    configuration: dict[str, object] = {
        "environment": "production",
        "jwt_secret": "a-production-shaped-secret-that-is-long-enough",
        "auto_seed_demo": False,
        "database_url": "postgresql+psycopg://service@database/razorshield",
        "allowed_origins": ["https://risk.example.com"],
        "rate_limit_backend": "rediss://cache.example.com:6379/0",
        "otp_delivery_provider": "twilio-verify",
        "twilio_account_sid": "AC-test",
        "twilio_auth_token": "twilio-secret",
        "twilio_verify_service_sid": "VA-test",
        "secret_provider": "google-cloud-secret-manager",
        "google_cloud_project": "risk-production",
        "rag_provider": "gemini",
        "gemini_api_key": "gemini-secret",
        **overrides,
    }

    with pytest.raises(ValueError, match=message):
        Settings(**configuration).validate_runtime_secrets()


def test_production_accepts_explicit_managed_runtime_configuration() -> None:
    secure = Settings(
        environment="production",
        jwt_secret="a-production-shaped-secret-that-is-long-enough",
        auto_seed_demo=False,
        database_url="postgresql+psycopg://service@database/razorshield",
        allowed_origins=["https://risk.example.com"],
        rate_limit_backend="rediss://cache.example.com:6379/0",
        otp_delivery_provider="twilio-verify",
        twilio_account_sid="AC-test",
        twilio_auth_token="twilio-secret",
        twilio_verify_service_sid="VA-test",
        secret_provider="google-cloud-secret-manager",
        google_cloud_project="risk-production",
        rag_provider="gemini",
        gemini_api_key="gemini-secret",
    )

    secure.validate_runtime_secrets()


def test_redis_rate_limiter_fails_closed_when_backend_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    limiter = RedisSlidingWindowLimiter("redis://127.0.0.1:6379/15", 10)

    def unavailable(*_args: object, **_kwargs: object) -> object:
        raise redis.ConnectionError("injected outage")

    monkeypatch.setattr(limiter._client, "eval", unavailable)
    with pytest.raises(RateLimitBackendUnavailable):
        limiter.allow("client:/api/v1/auth/login")


@pytest.mark.parametrize(
    ("field", "value", "message"),
    [
        ("rate_limit_backend", "memory", "RATE_LIMIT_BACKEND"),
        ("otp_delivery_provider", "development-console", "OTP_DELIVERY_PROVIDER"),
        ("secret_provider", "development-env", "SECRET_PROVIDER"),
    ],
)
def test_production_rejects_local_only_security_providers(field: str, value: str, message: str) -> None:
    configuration = {
        "environment": "production",
        "jwt_secret": "a-production-shaped-secret-that-is-long-enough",
        "auto_seed_demo": False,
        "database_url": "postgresql+psycopg://service@database/razorshield",
        "allowed_origins": ["https://risk.example.com"],
        "rate_limit_backend": "rediss://cache.example.com:6379/0",
        "otp_delivery_provider": "twilio-verify",
        "twilio_account_sid": "AC-test",
        "twilio_auth_token": "twilio-secret",
        "twilio_verify_service_sid": "VA-test",
        "secret_provider": "google-cloud-secret-manager",
        "google_cloud_project": "risk-production",
        "rag_provider": "gemini",
        "gemini_api_key": "gemini-secret",
        field: value,
    }
    with pytest.raises(ValueError, match=message):
        Settings(**configuration).validate_runtime_secrets()
