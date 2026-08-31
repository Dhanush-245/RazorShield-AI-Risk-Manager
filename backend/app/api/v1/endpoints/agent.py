import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies import AuthContext, require_roles
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.auth import UserRole
from app.models.cases import RiskCase
from app.models.governance import AgentRun, AgentToolCall, Policy
from app.models.risk import RiskAssessment, Transaction
from app.services.dataset_scope import transaction_scope
from app.services.policy_retrieval import retrieve_policies

router = APIRouter(prefix="/agent", tags=["bounded-agent"])
ALLOWED_TOOLS = (
    "get_transaction",
    "get_customer_history",
    "get_recent_activity",
    "get_device_relationships",
    "get_risk_signals",
    "get_risk_explanation",
    "retrieve_policy",
    "create_investigation",
    "create_review_recommendation",
)


class PolicyInput(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    version: str = Field(min_length=1, max_length=30)
    content: str = Field(min_length=20, max_length=10_000)


def policy_category(name: str) -> str:
    normalized = name.lower()
    if "template" in normalized:
        return "APPROVED_RESPONSE_TEMPLATE"
    if "chargeback" in normalized:
        return "CHARGEBACK_POLICY"
    if "escalat" in normalized:
        return "ESCALATION_POLICY"
    if "merchant" in normalized or "rule" in normalized:
        return "MERCHANT_RULES"
    if "review" in normalized:
        return "REVIEW_POLICY"
    return "RISK_POLICY"


def policy_view(policy: Policy) -> dict[str, object]:
    return {
        "id": policy.id,
        "name": policy.name,
        "category": policy_category(policy.name),
        "version": policy.version,
        "content": policy.content,
        "isActive": policy.is_active,
        "createdAt": policy.created_at.isoformat() if policy.created_at else None,
    }


@router.get("/policies")
def list_policies(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    policies = db.scalars(
        select(Policy)
        .where(Policy.merchant_id == current.merchant_id, Policy.is_active.is_(True))
        .order_by(Policy.name)
    )
    return [policy_view(policy) for policy in policies]


@router.post("/policies", status_code=status.HTTP_201_CREATED)
def create_policy(
    payload: PolicyInput,
    current: Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    policy = Policy(
        merchant_id=current.merchant_id,
        name=payload.name,
        version=payload.version,
        content=payload.content,
    )
    db.add(policy)
    db.flush()
    db.add(
        AuditEvent(
            merchant_id=current.merchant_id,
            entity_type="policy",
            entity_id=policy.id,
            event_type="POLICY_PUBLISHED",
            actor_type="USER",
            detail=f"{policy.name} v{policy.version} published for bounded retrieval.",
        )
    )
    db.commit()
    db.refresh(policy)
    return policy_view(policy)


@router.post("/investigate/{transaction_id}")
def investigate_with_bounded_agent(
    transaction_id: str,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    assessment = db.scalar(
        select(RiskAssessment)
        .join(RiskAssessment.transaction)
        .where(Transaction.external_id == transaction_id, *transaction_scope(db, current.merchant_id))
        .options(selectinload(RiskAssessment.transaction), selectinload(RiskAssessment.signals))
        .order_by(desc(RiskAssessment.created_at))
    )
    if assessment is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    case = db.scalar(select(RiskCase).where(RiskCase.transaction_id == assessment.transaction_id))
    policies = retrieve_policies(
        db,
        current.merchant_id,
        f"transaction risk {assessment.risk_level} manual review chargeback return",
    )
    recommendation = (
        "MANUAL_REVIEW"
        if assessment.score >= 71
        else "ADDITIONAL_VERIFICATION"
        if assessment.score >= 31
        else "ALLOW"
    )
    transaction = assessment.transaction
    model_features = json.loads(assessment.feature_snapshot or "{}")
    flow_fact = (
        f"Stored transaction record links customer {transaction.customer_id} to recipient "
        f"{transaction.recipient_id} for {transaction.currency} {float(transaction.amount):,.2f}."
        if transaction.recipient_id
        else None
    )
    history = (
        db.query(Transaction)
        .filter(
            Transaction.merchant_id == current.merchant_id,
            Transaction.dataset_id == transaction.dataset_id,
            Transaction.customer_id == transaction.customer_id,
            Transaction.id != transaction.id,
            Transaction.occurred_at < transaction.occurred_at,
        )
        .order_by(desc(Transaction.occurred_at))
        .limit(100)
        .all()
    )
    historical_average = sum(float(item.amount) for item in history) / len(history) if history else None
    related_customers = {
        item.customer_id
        for item in db.query(Transaction)
        .filter(
            Transaction.merchant_id == current.merchant_id,
            Transaction.dataset_id == transaction.dataset_id,
            Transaction.device_id == transaction.device_id,
            Transaction.device_id.is_not(None),
            Transaction.occurred_at < transaction.occurred_at,
        )
        .all()
        if item.customer_id != transaction.customer_id
    }
    confidence_label = "High" if assessment.score >= 71 else "Moderate" if assessment.score >= 31 else "Low"
    summary = (
        "Observed transaction, behavioral, velocity, and network signals indicate elevated risk "
        "and require human review."
        if assessment.score >= 71
        else "Observed signals indicate uncertainty that should be resolved before a high-impact decision."
        if assessment.score >= 31
        else "Observed signals currently indicate low risk; routine monitoring remains appropriate."
    )
    if case is None:
        case = RiskCase(
            case_reference=f"CASE-{transaction.external_id}",
            merchant_id=current.merchant_id,
            transaction_id=transaction.id,
            case_type="FRAUD_REVIEW",
            recommendation=recommendation,
        )
        db.add(case)
        db.flush()
    run = db.scalar(
        select(AgentRun)
        .where(
            AgentRun.merchant_id == current.merchant_id,
            AgentRun.case_id == case.id,
            AgentRun.status == "COMPLETED",
        )
        .order_by(desc(AgentRun.created_at))
    )
    is_new_run = run is None
    if run is None:
        run = AgentRun(
            merchant_id=current.merchant_id,
            case_id=case.id,
            requested_by=current.user_id,
            status="COMPLETED",
            recommendation=recommendation,
            limitations=(
                "No external financial action permission. Report uses stored evidence "
                "and active policies only."
            ),
        )
        db.add(run)
        db.flush()
    calls = {
        "get_transaction": f"Loaded {assessment.transaction.external_id}.",
        "get_customer_history": f"Loaded {len(history)} prior customer transactions.",
        "get_recent_activity": (
            f"Loaded latest velocity context from the stored assessment: "
            f"{float(assessment.velocity_score or 0) * 100:.0f}/100."
        ),
        "get_device_relationships": (
            f"Observed {len(related_customers)} other customer accounts for device "
            f"{assessment.transaction.device_id or 'unavailable'}."
        ),
        "get_risk_signals": f"Loaded {len(assessment.signals)} stored evidence signals.",
        "get_risk_explanation": (f"Loaded {len(assessment.signals)} structured model and rule explanations."),
        "retrieve_policy": f"Retrieved {len(policies)} active policy records.",
        "create_investigation": f"Prepared {case.case_reference} for human review.",
        "create_review_recommendation": f"Recommended {recommendation}; no action executed.",
    }
    if is_new_run:
        for tool_name in ALLOWED_TOOLS:
            db.add(
                AgentToolCall(
                    run_id=run.id,
                    tool_name=tool_name,
                    result_summary=calls[tool_name],
                )
            )
        db.add(
            AuditEvent(
                merchant_id=current.merchant_id,
                dataset_id=assessment.transaction.dataset_id,
                entity_type="agent_run",
                entity_id=case.case_reference,
                event_type="BOUNDED_INVESTIGATION_COMPLETED",
                actor_type="AGENT",
                detail=f"Recommendation {recommendation}; human approval remains required.",
            )
        )
        db.commit()
    return {
        "runId": run.id,
        "caseId": case.case_reference if case else None,
        "status": run.status,
        "riskScore": assessment.score,
        "riskLevel": assessment.risk_level,
        "summary": summary,
        "facts": [
            *([flow_fact] if flow_fact else []),
            *[signal.evidence for signal in assessment.signals],
        ],
        "inferences": ["Combined stored signals indicate elevated risk."] if assessment.score >= 31 else [],
        "recommendation": recommendation,
        "confidence": assessment.score / 100,
        "confidenceLabel": confidence_label,
        "evidence": [
            {"code": signal.code, "score": signal.score, "statement": signal.evidence}
            for signal in assessment.signals
        ],
        "behavior": {
            "historicalAverage": round(historical_average, 2) if historical_average is not None else None,
            "currentAmount": float(transaction.amount),
            "historySampleSize": len(history),
        },
        "fundsFlow": {
            "direction": "CUSTOMER_TO_RECIPIENT",
            "senderCustomerReference": transaction.customer_id,
            "senderName": transaction.customer_name,
            "senderEmail": transaction.customer_email,
            "senderPhone": transaction.customer_phone,
            "senderVerificationStatus": transaction.customer_verification_status,
            "senderAccountReference": transaction.sender_account_reference,
            "senderBankName": transaction.sender_bank_name,
            "senderBankIfsc": transaction.sender_bank_ifsc,
            "recipientEntityReference": transaction.recipient_id,
            "recipientName": transaction.recipient_name,
            "recipientEmail": transaction.recipient_email,
            "recipientPhone": transaction.recipient_phone,
            "recipientAccountReference": (
                transaction.recipient_account_reference or transaction.recipient_id
            ),
            "recipientBankName": transaction.recipient_bank_name,
            "recipientBankIfsc": transaction.recipient_bank_ifsc,
            "recipientType": transaction.recipient_type,
            "recipientCategory": transaction.recipient_category,
            "recipientVerified": transaction.recipient_verified,
            "amount": float(transaction.amount),
            "currency": transaction.currency,
            "source": "stored transaction record",
        },
        "network": {
            "deviceId": transaction.device_id,
            "submittedSharedAccounts": model_features.get("shared_device_accounts"),
            "observedRelatedCustomerAccounts": len(related_customers),
        },
        "policies": [
            {
                "name": policy.name,
                "category": policy_category(policy.name),
                "version": policy.version,
                "excerpt": policy.excerpt,
                "relevance": round(policy.score, 3),
            }
            for policy in policies
        ],
        "policyGrounding": (
            "Recommendation incorporates the highest-relevance active merchant policies."
            if policies
            else "No active merchant policy matched; recommendation relies on stored evidence only."
        ),
        "missingInformation": [
            *(
                []
                if transaction.customer_verification_status != "NOT_COLLECTED"
                else ["Customer verification outcome"]
            ),
            "Delivery confirmation",
            *(
                []
                if transaction.recipient_account_reference or transaction.recipient_id
                else ["Recipient/account reference"]
            ),
            *([] if transaction.sender_account_reference else ["Sender bank account reference"]),
        ],
        "assessment": assessment.risk_level,
        "responsibleAIStatement": (
            "This report describes observed signals and model outputs; "
            "it does not label a person as fraudulent."
        ),
        "limitations": [run.limitations, "Bundled models use synthetic demonstration data."],
        "allowedTools": list(ALLOWED_TOOLS),
        "toolTrace": [
            {"sequence": index + 1, "tool": name, "status": "COMPLETED", "result": calls[name]}
            for index, name in enumerate(ALLOWED_TOOLS)
        ],
        "executedFinancialAction": False,
    }
