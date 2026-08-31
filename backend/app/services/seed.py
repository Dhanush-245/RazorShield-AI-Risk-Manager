from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_secret
from app.models.audit import AuditEvent
from app.models.auth import Merchant, User, UserRole
from app.models.cases import RiskCase
from app.models.governance import Policy
from app.models.risk import RiskAssessment, RiskSignal, Transaction
from app.schemas.risk import RiskAssessmentRequest
from app.services.model_risk import assess_with_models

DEMO_PROFILES = (
    (
        "admin@razorshield.demo",
        "+919100000201",
        "Asha Rao",
        UserRole.ADMIN,
        "Admin-RazorShield-2026!",
    ),
    (
        "analyst@razorshield.demo",
        "+919100000202",
        "Arjun Rivera",
        UserRole.RISK_ANALYST,
        "Analyst-RazorShield-2026!",
    ),
    (
        "reviewer@razorshield.demo",
        "+919100000203",
        "Riya Shah",
        UserRole.REVIEWER,
        "Reviewer-RazorShield-2026!",
    ),
    (
        "viewer@razorshield.demo",
        "+919100000204",
        "Vikram Singh",
        UserRole.VIEWER,
        "Viewer-RazorShield-2026!",
    ),
)
DEMO_POLICIES = (
    (
        "High-risk transaction review policy",
        "1.0",
        "Transactions with a risk score of 71 or above require manual review. "
        "Reviewers must inspect verified evidence and missing information before deciding. "
        "No payment rejection or hold may be executed by the investigator agent.",
    ),
    (
        "Chargeback evidence policy",
        "1.0",
        "Chargeback responses may include only available transaction, order, customer, device and "
        "delivery evidence. Missing delivery confirmation must be marked unavailable. "
        "A human reviewer must approve every response draft before external submission.",
    ),
    (
        "Return-risk policy",
        "1.0",
        "Return risk is a separate operational category and must not be represented as fraud. "
        "Elevated return risk may trigger verification or policy review, not an accusation.",
    ),
    (
        "Escalation policy",
        "1.0",
        "Cases with unresolved identity, delivery, or device evidence must be escalated to another "
        "reviewer. Escalation never executes a payment action.",
    ),
    (
        "Merchant rules policy",
        "1.0",
        "Active merchant rule thresholds supplement trained model outputs. Fired rules must be "
        "reported with observed values and configuration version.",
    ),
    (
        "Approved chargeback response template",
        "1.0",
        "Present verified transaction and customer evidence, list unavailable evidence explicitly, "
        "and route the draft to a human reviewer before external submission.",
    ),
)


def ensure_demo_policies(db: Session, merchant_id: str) -> None:
    existing = set(db.scalars(select(Policy.name).where(Policy.merchant_id == merchant_id)).all())
    db.add_all(
        [
            Policy(
                merchant_id=merchant_id,
                name=name,
                version=version,
                content=content,
            )
            for name, version, content in DEMO_POLICIES
            if name not in existing
        ]
    )


def ensure_demo_users(db: Session, merchant_id: str) -> None:
    """Keep the competition-demo personas distinct and ready to use."""
    for email, phone, name, role, password in DEMO_PROFILES:
        user = db.scalar(select(User).where(User.email_normalized == email))
        credentials_need_upgrade = user is None or user.phone_normalized != phone
        if user is None:
            user = User(merchant_id=merchant_id, email_normalized=email)
            db.add(user)
        user.merchant_id = merchant_id
        user.phone_normalized = phone
        if credentials_need_upgrade:
            user.password_hash = hash_secret(password)
        user.display_name = name
        user.role = role
        user.is_active = True


def seed_demo(db: Session) -> None:
    existing_merchant_id = db.scalar(select(Merchant.id).where(Merchant.external_id == "MER-204"))
    if existing_merchant_id:
        ensure_demo_policies(db, existing_merchant_id)
        ensure_demo_users(db, existing_merchant_id)
        db.commit()
        return
    merchant = Merchant(external_id="MER-204", name="RazorShield Demo Merchant")
    db.add(merchant)
    db.flush()
    ensure_demo_policies(db, merchant.id)
    ensure_demo_users(db, merchant.id)
    db.flush()

    now = datetime.now(UTC)
    examples = (
        ("TX-10482", "CUS-8831", 42800, "DEV-77A", "Hyderabad", 3200, 8, 21, 5, True, True, 6, 0.61),
        ("TX-10467", "CUS-1182", 18900, "DEV-77A", "Mumbai", 5100, 5, 12, 2, True, True, 7, 0.34),
        ("TX-10461", "CUS-4409", 7400, "DEV-440", "Bengaluru", 4200, 3, 8, 2, False, False, 1, 0.18),
        ("TX-10432", "CUS-9920", 1250, "DEV-992", "Pune", 1800, 0, 2, 0, False, False, 0, 0.05),
        ("TX-10408", "CUS-2031", 9600, "DEV-203", "Delhi", 3900, 4, 11, 1, True, False, 2, 0.22),
        ("TX-10394", "CUS-5210", 56000, "DEV-77A", "Hyderabad", 4800, 10, 28, 6, True, True, 8, 0.49),
    )
    for index, example in enumerate(examples):
        (
            transaction_id,
            customer_id,
            amount,
            device_id,
            location,
            average,
            tx5,
            tx1h,
            failures,
            new_device,
            new_location,
            shared,
            return_rate,
        ) = example
        payload = RiskAssessmentRequest(
            transaction_id=transaction_id,
            customer_id=customer_id,
            merchant_id=merchant.id,
            amount=Decimal(amount),
            currency="INR",
            device_id=device_id,
            location=location,
            payment_method="Card",
            timestamp=now - timedelta(minutes=index * 22),
            customer_average_amount=Decimal(average),
            transactions_last_5_minutes=tx5,
            transactions_last_hour=tx1h,
            failed_attempts_last_10_minutes=failures,
            is_new_device=new_device,
            is_new_location=new_location,
            shared_device_accounts=shared,
            historical_return_rate=return_rate,
        )
        result = assess_with_models(payload)
        transaction = Transaction(
            external_id=transaction_id,
            merchant_id=merchant.id,
            customer_id=customer_id,
            amount=payload.amount,
            currency="INR",
            device_id=device_id,
            location=location,
            payment_method="Card",
            occurred_at=payload.timestamp,
        )
        assessment = RiskAssessment(
            transaction=transaction,
            score=result.score,
            risk_level=result.level,
            engine_type="TRAINED_RISK_FUSION",
            engine_version=result.versions,
            fraud_probability=result.fraud_probability,
            anomaly_score=result.anomaly_score,
            behavior_score=result.behavior_score,
            velocity_score=result.velocity_score,
            graph_score=result.graph_score,
            rule_score=result.rule_score,
            return_risk_score=result.return_risk_score,
            model_provenance=result.provenance,
            signals=[
                RiskSignal(code=item.code, score=item.score, evidence=item.evidence)
                for item in result.signals
            ],
        )
        db.add(assessment)
        db.flush()
        if result.score >= 31:
            db.add(
                RiskCase(
                    case_reference=f"CASE-{transaction_id}",
                    merchant_id=merchant.id,
                    transaction_id=transaction.id,
                    case_type="FRAUD_REVIEW",
                    recommendation=result.recommended_action,
                )
            )
        db.add(
            AuditEvent(
                merchant_id=merchant.id,
                entity_type="risk_assessment",
                entity_id=assessment.id,
                event_type="DEMO_TRANSACTION_ASSESSED",
                actor_type="SYSTEM",
                detail=f"Seeded demo transaction {transaction_id} scored {result.score}.",
            )
        )
    db.commit()
