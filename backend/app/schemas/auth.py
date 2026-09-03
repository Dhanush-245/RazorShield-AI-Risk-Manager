from pydantic import BaseModel, Field, model_validator

from app.models.auth import UserRole


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=256)


class AuthUser(BaseModel):
    id: str
    merchant_id: str
    merchant_reference: str
    display_name: str
    role: UserRole


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user: AuthUser


class RefreshResponse(LoginResponse):
    session_rotated: bool = True


class ForgotPasswordRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)


class ForgotPasswordResponse(BaseModel):
    message: str
    development_otp: str | None = None


class VerifyOtpRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=254)
    otp: str = Field(pattern=r"^\d{6}$")


class VerifyOtpResponse(BaseModel):
    reset_token: str
    expires_in_seconds: int


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(min_length=20)
    new_password: str = Field(min_length=12, max_length=256)
    confirm_password: str = Field(min_length=12, max_length=256)

    @model_validator(mode="after")
    def passwords_match(self) -> "ResetPasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class MessageResponse(BaseModel):
    message: str
