from __future__ import annotations

import httpx

from app.core.config import Settings


class OtpDeliveryError(RuntimeError):
    pass


def _twilio_credentials(settings: Settings) -> tuple[str, str, str]:
    if not (
        settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_verify_service_sid
    ):
        raise OtpDeliveryError("Twilio Verify is not fully configured")
    return (
        settings.twilio_account_sid,
        settings.twilio_auth_token.get_secret_value(),
        settings.twilio_verify_service_sid,
    )


def send_managed_otp(destination: str, settings: Settings) -> None:
    account_sid, auth_token, service_sid = _twilio_credentials(settings)
    try:
        response = httpx.post(
            f"https://verify.twilio.com/v2/Services/{service_sid}/Verifications",
            auth=(account_sid, auth_token),
            data={"To": destination, "Channel": "sms"},
            timeout=10.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise OtpDeliveryError("OTP delivery provider is unavailable") from exc


def check_managed_otp(destination: str, code: str, settings: Settings) -> bool:
    account_sid, auth_token, service_sid = _twilio_credentials(settings)
    try:
        response = httpx.post(
            f"https://verify.twilio.com/v2/Services/{service_sid}/VerificationCheck",
            auth=(account_sid, auth_token),
            data={"To": destination, "Code": code},
            timeout=10.0,
        )
        if response.status_code in {400, 404}:
            return False
        response.raise_for_status()
        return response.json().get("status") == "approved"
    except httpx.HTTPError as exc:
        raise OtpDeliveryError("OTP verification provider is unavailable") from exc
