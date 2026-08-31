from types import SimpleNamespace

import httpx
import pytest

from app.core.config import Settings
from app.services.otp_delivery import OtpDeliveryError, check_managed_otp, send_managed_otp


def twilio_settings() -> Settings:
    return Settings(
        twilio_account_sid="AC-test",
        twilio_auth_token="secret",
        twilio_verify_service_sid="VA-test",
    )


def test_twilio_verify_send_and_check(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []

    def fake_post(url: str, **kwargs: object) -> SimpleNamespace:
        calls.append(url)
        assert kwargs["auth"] == ("AC-test", "secret")
        if url.endswith("/Verifications"):
            assert kwargs["data"] == {"To": "+919999999999", "Channel": "sms"}
            return SimpleNamespace(raise_for_status=lambda: None)
        assert kwargs["data"] == {"To": "+919999999999", "Code": "123456"}
        return SimpleNamespace(
            status_code=200,
            raise_for_status=lambda: None,
            json=lambda: {"status": "approved"},
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    send_managed_otp("+919999999999", twilio_settings())
    assert check_managed_otp("+919999999999", "123456", twilio_settings()) is True
    assert calls[0].endswith("/Verifications")
    assert calls[1].endswith("/VerificationCheck")


def test_twilio_verify_outage_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    def unavailable(*_args: object, **_kwargs: object) -> object:
        raise httpx.ConnectError("injected outage")

    monkeypatch.setattr(httpx, "post", unavailable)
    with pytest.raises(OtpDeliveryError, match="unavailable"):
        check_managed_otp("+919999999999", "123456", twilio_settings())
