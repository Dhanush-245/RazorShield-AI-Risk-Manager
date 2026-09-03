from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="RAZORSHIELD_",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "RazorShield AI API"
    environment: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./razorshield.db"
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    log_level: str = "INFO"
    jwt_secret: str = "development-only-change-me-32-bytes"
    access_token_minutes: int = 15
    refresh_token_days: int = 7
    label_maturity_days: int = Field(default=45, ge=30, le=180)
    reset_token_minutes: int = 10
    otp_minutes: int = 5
    otp_max_attempts: int = 5
    auth_rate_limit_per_minute: int = 20
    maximum_request_bytes: int = 10 * 1024 * 1024
    rate_limit_backend: str = "memory"
    otp_delivery_provider: str = "development-console"
    twilio_account_sid: str | None = None
    twilio_auth_token: SecretStr | None = None
    twilio_verify_service_sid: str | None = None
    secret_provider: str = "development-env"
    google_cloud_project: str | None = None
    rag_provider: str = "bounded-local"
    gemini_api_key: SecretStr | None = None
    ieee_cis_promotion_status: str = "candidate"
    model_dir: str = str(Path(__file__).resolve().parents[3] / "ml" / "artifacts")
    ieee_cis_model_dir: str = str(Path(__file__).resolve().parents[3] / "ml" / "artifacts" / "ieee_cis_v2")
    auto_seed_demo: bool = True

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @field_validator("environment")
    @classmethod
    def validate_environment(cls, value: str) -> str:
        normalized = value.lower()
        if normalized not in {"development", "test", "staging", "production"}:
            raise ValueError("environment must be development, test, staging, or production")
        return normalized

    def validate_runtime_secrets(self) -> None:
        if self.environment in {"staging", "production"} and (
            self.jwt_secret == "development-only-change-me-32-bytes" or len(self.jwt_secret) < 32
        ):
            raise ValueError(
                "RAZORSHIELD_JWT_SECRET must be a deployment-managed secret of at least 32 characters"
            )
        if self.environment == "production":
            if self.auto_seed_demo:
                raise ValueError("RAZORSHIELD_AUTO_SEED_DEMO must be false in production")
            if self.database_url.startswith("sqlite"):
                raise ValueError("Production requires a managed non-SQLite database")
            if not self.allowed_origins or any(
                origin == "*" or "localhost" in origin or "127.0.0.1" in origin
                for origin in self.allowed_origins
            ):
                raise ValueError("Production CORS origins must be explicit non-localhost origins")
            if not self.rate_limit_backend.lower().startswith(("redis://", "rediss://")):
                raise ValueError("Production requires a distributed RATE_LIMIT_BACKEND")
            if self.otp_delivery_provider.lower() != "twilio-verify":
                raise ValueError("Production OTP_DELIVERY_PROVIDER must be twilio-verify")
            if not all([self.twilio_account_sid, self.twilio_auth_token, self.twilio_verify_service_sid]):
                raise ValueError("Production Twilio Verify credentials are incomplete")
            if self.secret_provider.lower() != "google-cloud-secret-manager":
                raise ValueError("Production SECRET_PROVIDER must be google-cloud-secret-manager")
            if not self.google_cloud_project:
                raise ValueError("Production requires GOOGLE_CLOUD_PROJECT")
            if self.rag_provider.lower() != "gemini":
                raise ValueError("Production RAG_PROVIDER must be gemini")
            if self.gemini_api_key is None:
                raise ValueError("Production requires GEMINI_API_KEY")
        if self.ieee_cis_promotion_status.lower() not in {"candidate", "approved"}:
            raise ValueError("IEEE_CIS_PROMOTION_STATUS must be candidate or approved")


@lru_cache
def get_settings() -> Settings:
    return Settings()
