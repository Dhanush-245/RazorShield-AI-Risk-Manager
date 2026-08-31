from dataclasses import dataclass
from decimal import Decimal

from app.schemas.risk import RiskAssessmentRequest


@dataclass(frozen=True)
class BaselineSignal:
    code: str
    score: int
    evidence: str


@dataclass(frozen=True)
class BaselineResult:
    score: int
    level: str
    recommended_action: str
    signals: list[BaselineSignal]


def assess_with_baseline(payload: RiskAssessmentRequest) -> BaselineResult:
    """Transparent temporary rules for plumbing tests; this is not ML inference."""
    signals: list[BaselineSignal] = []

    if payload.customer_average_amount:
        ratio = payload.amount / payload.customer_average_amount
        if ratio >= Decimal("5"):
            signals.append(
                BaselineSignal(
                    "AMOUNT_DEVIATION_CRITICAL", 30, f"Amount is {ratio:.1f}× the supplied customer average."
                )
            )
        elif ratio >= Decimal("2"):
            signals.append(
                BaselineSignal(
                    "AMOUNT_DEVIATION_HIGH", 18, f"Amount is {ratio:.1f}× the supplied customer average."
                )
            )

    if payload.transactions_last_5_minutes >= 8:
        signals.append(
            BaselineSignal(
                "VELOCITY_CRITICAL",
                28,
                (
                    f"{payload.transactions_last_5_minutes} transactions were supplied "
                    "for the last five minutes."
                ),
            )
        )
    elif payload.transactions_last_5_minutes >= 4:
        signals.append(
            BaselineSignal(
                "VELOCITY_ELEVATED",
                16,
                (
                    f"{payload.transactions_last_5_minutes} transactions were supplied "
                    "for the last five minutes."
                ),
            )
        )

    if payload.failed_attempts_last_10_minutes >= 5:
        signals.append(
            BaselineSignal(
                "FAILED_ATTEMPTS_CRITICAL",
                24,
                f"{payload.failed_attempts_last_10_minutes} recent failed attempts were supplied.",
            )
        )
    elif payload.failed_attempts_last_10_minutes >= 2:
        signals.append(
            BaselineSignal(
                "FAILED_ATTEMPTS_ELEVATED",
                12,
                f"{payload.failed_attempts_last_10_minutes} recent failed attempts were supplied.",
            )
        )

    if payload.is_new_device is True:
        signals.append(
            BaselineSignal("NEW_DEVICE", 12, "The request identifies the device as new for this customer.")
        )
    if payload.is_new_location is True:
        signals.append(
            BaselineSignal(
                "NEW_LOCATION", 10, "The request identifies the location as new for this customer."
            )
        )

    score = min(sum(signal.score for signal in signals), 100)
    if score >= 71:
        level, action = "HIGH", "MANUAL_REVIEW"
    elif score >= 31:
        level, action = "MEDIUM", "ADDITIONAL_VERIFICATION"
    else:
        level, action = "LOW", "ALLOW"

    if not signals:
        signals.append(
            BaselineSignal(
                "NO_BASELINE_RULE_TRIGGERED",
                0,
                "No temporary baseline rule was triggered by the supplied fields.",
            )
        )

    return BaselineResult(score=score, level=level, recommended_action=action, signals=signals)
