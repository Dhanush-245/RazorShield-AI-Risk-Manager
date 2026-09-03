from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

import networkx as nx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies import AuthContext, get_current_user, require_roles
from app.core.config import get_settings
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.auth import Merchant, UserRole
from app.models.cases import RiskCase
from app.models.risk import RiskAssessment, Transaction
from app.services.dataset_scope import get_active_dataset, transaction_scope
from app.services.model_governance import ieee_cis_promotion_evidence
from app.services.model_risk import load_models
from app.services.operational_metrics import operational_metrics
from app.services.policy_retrieval import retrieve_policies
from app.services.risk_workbench import distribution_shift
from app.services.spike_detection import detect_spike

router = APIRouter(tags=["risk-operations"])


def latest_assessments(db: Session, merchant_id: str) -> list[RiskAssessment]:
    return list(
        db.scalars(
            select(RiskAssessment)
            .join(RiskAssessment.transaction)
            .where(*transaction_scope(db, merchant_id))
            .options(selectinload(RiskAssessment.transaction), selectinload(RiskAssessment.signals))
            .order_by(desc(Transaction.occurred_at))
        ).unique()
    )


def transaction_view(assessment: RiskAssessment, merchant_label: str | None = None) -> dict[str, object]:
    transaction = assessment.transaction
    recommendation = (
        "MANUAL REVIEW"
        if assessment.score >= 71
        else "REQUEST VERIFICATION"
        if assessment.score >= 31
        else "ALLOW"
    )
    return {
        "transactionId": transaction.external_id,
        "customerId": transaction.customer_id,
        "customerName": transaction.customer_name,
        "customerEmail": transaction.customer_email,
        "customerPhone": transaction.customer_phone,
        "customerVerificationStatus": transaction.customer_verification_status,
        "senderAccountReference": transaction.sender_account_reference,
        "senderBankName": transaction.sender_bank_name,
        "senderBankIfsc": transaction.sender_bank_ifsc,
        "merchantId": merchant_label or transaction.merchant_id,
        "deviceId": transaction.device_id,
        "location": transaction.location,
        "paymentMethod": transaction.payment_method,
        "recipientId": transaction.recipient_id,
        "recipientName": transaction.recipient_name,
        "recipientAccountReference": transaction.recipient_account_reference,
        "recipientBankName": transaction.recipient_bank_name,
        "recipientBankIfsc": transaction.recipient_bank_ifsc,
        "recipientEmail": transaction.recipient_email,
        "recipientPhone": transaction.recipient_phone,
        "recipientType": transaction.recipient_type,
        "recipientCategory": transaction.recipient_category,
        "recipientVerified": transaction.recipient_verified,
        "transactionIntent": transaction.transaction_intent,
        "amount": float(transaction.amount),
        "currency": transaction.currency,
        "timestamp": transaction.occurred_at.isoformat(),
        "riskScore": assessment.score,
        "riskLevel": f"{assessment.risk_level} RISK",
        "fraudProbability": float(assessment.fraud_probability or 0),
        "anomalyScore": float(assessment.anomaly_score or 0),
        "behaviorScore": float(assessment.behavior_score or 0),
        "velocityScore": float(assessment.velocity_score or 0),
        "graphScore": float(assessment.graph_score or 0),
        "decision": recommendation,
        "status": "Needs review" if assessment.score >= 31 else "Cleared",
        "factors": [signal.evidence for signal in assessment.signals],
        "engineVersion": assessment.engine_version,
        "provenance": assessment.model_provenance,
    }


@router.get("/healthz")
def compatibility_health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/risk/overview")
def overview(
    current: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    assessments = latest_assessments(db, current.merchant_id)
    active_dataset = get_active_dataset(db, current.merchant_id)
    high_risk = sum(item.score >= 71 for item in assessments)
    labeled_assessments = [item for item in assessments if item.transaction.fraud_label is not None]
    confirmed_fraud = sum(item.transaction.fraud_label is True for item in labeled_assessments)
    total_amount = sum(float(item.transaction.amount) for item in assessments if item.score >= 71)
    trend = [
        {
            "label": item.transaction.occurred_at.strftime("%H:%M"),
            "risk": item.score,
            "volume": 1,
        }
        for item in reversed(assessments[:8])
    ]
    return {
        "transactionsAnalyzed": len(assessments),
        "highRisk": high_risk,
        "fraudDetected": confirmed_fraud,
        "preventedLoss": 0,
        "activeInvestigations": sum(item.score >= 31 for item in assessments),
        "averageRiskScore": round(sum(item.score for item in assessments) / max(len(assessments), 1), 1),
        "fraudRate": round(confirmed_fraud / max(len(labeled_assessments), 1), 4),
        "fraudOutcomeCoverage": round(len(labeled_assessments) / max(len(assessments), 1), 4),
        "spikeStatus": fraud_spike_status(assessments),
        "trend": trend,
        "potentialLoss": total_amount,
        "dataProvenance": "UPLOADED_DATASET" if active_dataset.id else "DEMO_SYNTHETIC",
        "activeDatasetId": active_dataset.id,
        "activeDatasetName": active_dataset.name,
        "financialDisclaimer": "Potential loss is flagged amount, not claimed prevented savings.",
    }


def fraud_spike_status(assessments: list[RiskAssessment]) -> str:
    result = detect_spike([(item.transaction.occurred_at, item.score) for item in assessments])
    return result.status.replace("_", " ").title()


@router.get("/risk/transactions")
def list_transactions(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    merchant = db.get(Merchant, current.merchant_id)
    return [
        transaction_view(item, merchant.external_id if merchant else None)
        for item in latest_assessments(db, current.merchant_id)
    ]


@router.get("/risk/transactions/{transaction_id}")
def get_transaction(
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
        .where(*transaction_scope(db, current.merchant_id), Transaction.external_id == transaction_id)
        .options(selectinload(RiskAssessment.transaction), selectinload(RiskAssessment.signals))
        .order_by(desc(RiskAssessment.created_at))
    )
    if assessment is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    merchant = db.get(Merchant, current.merchant_id)
    return transaction_view(assessment, merchant.external_id if merchant else None)


@router.get("/investigations/{transaction_id}")
def investigation(
    transaction_id: str,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    transaction = get_transaction(transaction_id, current, db)
    stored_assessment = db.scalar(
        select(RiskAssessment)
        .join(RiskAssessment.transaction)
        .where(*transaction_scope(db, current.merchant_id), Transaction.external_id == transaction_id)
        .options(selectinload(RiskAssessment.transaction))
        .order_by(desc(RiskAssessment.created_at))
    )
    try:
        feature_snapshot = (
            json.loads(stored_assessment.feature_snapshot)
            if stored_assessment and stored_assessment.feature_snapshot
            else {}
        )
    except (TypeError, ValueError):
        feature_snapshot = {}
    if not isinstance(feature_snapshot, dict):
        feature_snapshot = {}
    provenance_snapshot: dict[str, dict[str, object]] = {}
    graph_context: dict[str, object] = {}
    if stored_assessment:
        provenance_event = db.scalar(
            select(AuditEvent)
            .where(
                AuditEvent.merchant_id == current.merchant_id,
                AuditEvent.entity_id == stored_assessment.id,
                AuditEvent.event_type == "DECISION_SNAPSHOT_RECORDED",
            )
            .order_by(desc(AuditEvent.created_at))
        )
        if provenance_event:
            try:
                snapshot_body = json.loads(provenance_event.detail).get("body", {})
                provenance_snapshot = snapshot_body.get("featureProvenance", {})
                graph_context = snapshot_body.get("graphContext", {})
            except (AttributeError, TypeError, ValueError):
                provenance_snapshot = {}
                graph_context = {}
    amount_deviation = float(feature_snapshot.get("amount_deviation") or 0)
    historical_average = (
        round(float(transaction["amount"]) / amount_deviation, 2) if amount_deviation > 0 else None
    )
    facts = [f"Observed: {factor}" for factor in transaction["factors"]]
    recipient_reference = transaction["recipientAccountReference"] or transaction["recipientId"]
    recipient_value = str(recipient_reference) if recipient_reference else "Unavailable"
    if recipient_reference:
        facts.insert(
            0,
            (
                f"Observed transaction flow: {transaction['customerName'] or transaction['customerId']} sent "
                f"{transaction['currency']} {float(transaction['amount']):,.2f} to recipient "
                f"{transaction['recipientName'] or recipient_reference} ({recipient_reference})."
            ),
        )
    risk_score = int(transaction["riskScore"])
    fraud_model_version = str(transaction["engineVersion"]).split("/", 1)[0]
    return {
        "transaction": transaction,
        "fundsFlow": {
            "direction": "CUSTOMER_TO_RECIPIENT",
            "sender": {
                "customerReference": transaction["customerId"],
                "name": transaction["customerName"],
                "email": transaction["customerEmail"],
                "phone": transaction["customerPhone"],
                "accountReference": transaction["senderAccountReference"],
                "accountReferenceStatus": (
                    "COLLECTED" if transaction["senderAccountReference"] else "NOT_COLLECTED"
                ),
                "bankName": transaction["senderBankName"],
                "bankIfsc": transaction["senderBankIfsc"],
                "customerVerificationStatus": transaction["customerVerificationStatus"],
                "age": feature_snapshot.get("customer_age"),
                "accountAgeDays": feature_snapshot.get("account_age_days"),
                "historicalAverageAmount": historical_average,
                "historicalFraudCount": feature_snapshot.get("historical_fraud_count"),
                "deviceId": transaction["deviceId"],
                "deviceStatus": ("NEW" if feature_snapshot.get("new_device") else "KNOWN"),
                "location": transaction["location"],
                "locationStatus": ("UNUSUAL" if feature_snapshot.get("new_location") else "USUAL"),
            },
            "recipient": {
                "accountReference": recipient_reference,
                "entityReference": transaction["recipientId"],
                "name": transaction["recipientName"],
                "email": transaction["recipientEmail"],
                "phone": transaction["recipientPhone"],
                "bankName": transaction["recipientBankName"],
                "bankIfsc": transaction["recipientBankIfsc"],
                "type": transaction["recipientType"],
                "category": transaction["recipientCategory"],
                "verified": transaction["recipientVerified"],
                "riskScore": feature_snapshot.get("recipient_risk_score"),
                "usedBefore": bool(feature_snapshot.get("recipient_used_before")),
                "priorTransactionsFromCustomer": feature_snapshot.get("customer_recipient_transactions"),
                "transactionsLast15Minutes": feature_snapshot.get("same_recipient_transactions_15m"),
                "linkedCustomers": feature_snapshot.get("unique_customers_to_recipient"),
                "linkedDevices": feature_snapshot.get("unique_devices_to_recipient"),
            },
            "amount": transaction["amount"],
            "currency": transaction["currency"],
            "paymentMethod": transaction["paymentMethod"],
            "intent": transaction["transactionIntent"],
            "source": "stored transaction record",
        },
        "summary": f"{transaction_id} has an evidence-grounded risk score of {risk_score}/100.",
        "confidence": risk_score / 100,
        "recommendation": transaction["decision"],
        "missingInformation": [
            *(
                []
                if transaction["customerVerificationStatus"] != "NOT_COLLECTED"
                else ["Customer verification outcome"]
            ),
            "Delivery confirmation",
            *([] if recipient_reference else ["Recipient/account reference"]),
            *([] if transaction["senderAccountReference"] else ["Sender bank account reference"]),
        ],
        "facts": facts,
        "inferences": ["The combined observed signals support elevated risk review."]
        if risk_score >= 31
        else ["Observed signals do not currently support escalation."],
        "recommendations": ["A human reviewer should verify evidence before any high-impact action."],
        "evidence": [
            {
                "label": "Sender/customer reference",
                "value": str(transaction["customerId"]),
                "source": (
                    "stored transaction record"
                    if transaction["senderAccountReference"]
                    else "stored transaction record; sender bank account not collected"
                ),
            },
            {
                "label": "Recipient/account reference",
                "value": recipient_value,
                "source": (
                    "stored transaction record"
                    if recipient_reference
                    else "recipient reference not collected"
                ),
            },
            {
                "label": "Funds flow",
                "value": f"{transaction['customerId']} → {recipient_value}",
                "source": "stored transaction record",
            },
            {"label": "Risk fusion", "value": f"{risk_score}/100", "source": transaction["engineVersion"]},
            {
                "label": "Fraud probability",
                "value": f"{float(transaction['fraudProbability']) * 100:.1f}%",
                "source": fraud_model_version,
            },
            {"label": "Data provenance", "value": str(transaction["provenance"]), "source": "model manifest"},
            *[
                {
                    "label": f"Feature lineage · {name.replace('_', ' ')}",
                    "value": str(item.get("effective")),
                    "source": (f"{item.get('tier', 'UNKNOWN')} · {item.get('resolution', 'UNRECORDED')}"),
                }
                for name, item in provenance_snapshot.items()
                if name
                in {
                    "customer_average_amount",
                    "transactions_last_5_minutes",
                    "is_new_device",
                    "shared_device_accounts",
                    "recipient_used_before",
                    "recipient_risk_score",
                    "unique_customers_to_recipient",
                }
            ],
        ],
        "featureProvenance": provenance_snapshot,
        "graphContext": graph_context,
        "uncertainty": {
            "status": (
                "LEGACY_UNAVAILABLE"
                if not provenance_snapshot
                else (
                    "LIMITED_HISTORY"
                    if sum(not bool(item.get("available")) for item in provenance_snapshot.values()) >= 4
                    else "STANDARD"
                )
            ),
            "meaning": "Data sufficiency indicator, not calibrated certainty or probability of guilt.",
        },
        "limitations": ["Bundled models were evaluated on synthetic demonstration data."],
        "factInferenceSeparation": True,
    }


@router.get("/risk/network")
def network(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    assessments = latest_assessments(db, current.merchant_id)
    graph = nx.Graph()
    risk_by_node: dict[str, float] = {}
    for assessment in assessments:
        transaction = assessment.transaction
        customer = f"customer:{transaction.customer_id}"
        device = f"device:{transaction.device_id or 'unknown'}"
        graph.add_edge(customer, device)
        risk_by_node[customer] = max(risk_by_node.get(customer, 0), assessment.score / 100)
        risk_by_node[device] = max(risk_by_node.get(device, 0), float(assessment.graph_score or 0))
    nodes = [
        {
            "id": node,
            "label": node.split(":", 1)[1],
            "type": node.split(":", 1)[0].title(),
            "risk": risk_by_node.get(node, 0),
        }
        for node in graph.nodes
    ]
    links = [{"source": source, "target": target} for source, target in graph.edges]
    clusters = []
    for index, members in enumerate(nx.connected_components(graph) if graph else [], start=1):
        member_list = sorted(members)
        clusters.append(
            {
                "id": f"cluster-{index}",
                "members": member_list,
                "memberCount": len(member_list),
                "risk": round(max((risk_by_node.get(member, 0) for member in member_list), default=0), 4),
            }
        )
    return {
        "clusterCount": nx.number_connected_components(graph) if graph else 0,
        "customerCount": sum(node.startswith("customer:") for node in graph.nodes),
        "deviceCount": sum(node.startswith("device:") for node in graph.nodes),
        "ipCount": None,
        "ipStatus": "NOT_COLLECTED",
        "highRiskClusterCount": sum(cluster["risk"] >= 0.71 for cluster in clusters),
        "clusters": clusters,
        "nodes": nodes,
        "links": links,
    }


class ReviewInput(BaseModel):
    decision: str = Field(pattern="^(approve|reject|escalate|request_evidence)$")
    note: str | None = Field(default=None, max_length=2000)
    outcome: str | None = Field(default=None, pattern="^(CONFIRMED_FRAUD|LEGITIMATE|UNDETERMINED)$")


@router.post("/risk/reviews/{case_id}/decision")
def decide_review(
    case_id: str,
    payload: ReviewInput,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    if payload.outcome is not None:
        expected = {
            "approve": "LEGITIMATE",
            "reject": "CONFIRMED_FRAUD",
            "escalate": "UNDETERMINED",
            "request_evidence": "UNDETERMINED",
        }
        if not payload.note or not payload.note.strip():
            raise HTTPException(422, "An evidence-based reviewer reason is required")
        if payload.outcome != expected[payload.decision]:
            raise HTTPException(422, "Review outcome must match the decision")
    case = db.scalar(
        select(RiskCase)
        .join(Transaction, RiskCase.transaction_id == Transaction.id, isouter=True)
        .where(
            RiskCase.merchant_id == current.merchant_id,
            *transaction_scope(db, current.merchant_id),
            (RiskCase.case_reference == case_id) | (Transaction.external_id == case_id),
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Review case not found")
    decisions = {
        "approve": "APPROVED",
        "reject": "REJECTED",
        "escalate": "ESCALATED",
        "request_evidence": "EVIDENCE_REQUESTED",
    }
    case.human_decision = decisions[payload.decision]
    case.reviewer_note = payload.note
    case.assigned_user_id = current.user_id
    case.status = (
        "ESCALATED"
        if payload.decision == "escalate"
        else "PENDING_EVIDENCE"
        if payload.decision == "request_evidence"
        else "RESOLVED"
    )
    case_transaction = db.get(Transaction, case.transaction_id)
    dataset_id = case_transaction.dataset_id if case_transaction else None
    now = datetime.now(UTC)
    event_specs = [
        (
            "HUMAN_REVIEWER_ASSIGNED",
            "Human reviewer accepted responsibility for the case decision.",
        ),
        (
            f"HUMAN_DECISION_{case.human_decision}",
            payload.note or "Human decision recorded without an additional note.",
        ),
    ]
    if case.status == "RESOLVED":
        event_specs.append(("CASE_CLOSED", f"Case resolved as {case.human_decision}."))
    elif case.status == "ESCALATED":
        event_specs.append(("CASE_ESCALATED", "Case returned to the reviewer queue for reassignment."))
        case.assigned_user_id = None
    elif case.status == "PENDING_EVIDENCE":
        event_specs.append(("MORE_EVIDENCE_REQUESTED", "Case paused pending additional evidence."))
    events = [
        AuditEvent(
            merchant_id=current.merchant_id,
            dataset_id=dataset_id,
            entity_type="review_case",
            entity_id=case.case_reference,
            event_type=event_type,
            actor_type="USER",
            detail=detail,
            created_at=now + timedelta(microseconds=index),
        )
        for index, (event_type, detail) in enumerate(event_specs)
    ]
    db.add_all(events)
    if payload.outcome is not None:
        assessment = db.scalar(
            select(RiskAssessment)
            .where(RiskAssessment.transaction_id == case.transaction_id)
            .order_by(desc(RiskAssessment.created_at))
        )
        evidence = json.dumps(
            {
                "outcome": payload.outcome,
                "reason": payload.note.strip(),
                "reviewerId": current.user_id,
                "modelScore": assessment.score if assessment else None,
                "modelVersion": assessment.engine_version if assessment else None,
                "modelRisk": assessment.risk_level if assessment else None,
                "disagreesWithHighRisk": bool(
                    assessment and assessment.score >= 71 and payload.outcome == "LEGITIMATE"
                ),
                "labelStatus": "REVIEWER_ASSERTION_NOT_EXTERNAL_GROUND_TRUTH",
                "automaticRetraining": False,
            }
        )
        db.add_all(
            [
                AuditEvent(
                    merchant_id=current.merchant_id,
                    dataset_id=dataset_id,
                    entity_type="review_case",
                    entity_id=case.case_reference,
                    event_type=event_type,
                    actor_type="USER",
                    detail=evidence,
                    created_at=now + timedelta(microseconds=len(events) + index),
                )
                for index, event_type in enumerate(["REVIEW_FEEDBACK_RECORDED", "MODEL_FEEDBACK_MONITORING"])
            ]
        )
    db.commit()
    decision_event = events[1]
    db.refresh(decision_event)
    return {
        **audit_view(decision_event),
        "caseStatus": case.status,
        "decision": case.human_decision,
        "caseId": case.case_reference,
    }


def audit_view(event: AuditEvent) -> dict[str, object]:
    return {
        "id": event.id,
        "caseId": event.entity_id,
        "timestamp": event.created_at.isoformat(),
        "event": event.event_type.replace("_", " ").title(),
        "actor": event.actor_type,
        "note": (
            "Risk-input snapshot recorded; inspect the transaction's Data → decision panel for details."
            if event.event_type == "DECISION_SNAPSHOT_RECORDED"
            else event.detail
        ),
        "decisionVersion": "human-review-v1" if event.actor_type == "USER" else "risk-platform-v1",
    }


@router.get("/risk/audit")
def audit(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    active_dataset = get_active_dataset(db, current.merchant_id)
    query = select(AuditEvent).where(AuditEvent.merchant_id == current.merchant_id)
    if active_dataset.id is not None:
        query = query.where(AuditEvent.dataset_id == active_dataset.id)
    events = db.scalars(query.order_by(desc(AuditEvent.created_at)).limit(200))
    return [audit_view(event) for event in events]


@router.get("/monitoring/models")
def model_monitoring(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.VIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    manifest = load_models(current.merchant_id).manifest
    latencies = [
        float(assessment.inference_latency_ms)
        for assessment in latest_assessments(db, current.merchant_id)
        if assessment.inference_latency_ms is not None
    ]
    assessments = list(reversed(latest_assessments(db, current.merchant_id)[-500:]))
    midpoint = len(assessments) // 2
    reference, recent = assessments[:midpoint], assessments[midpoint:]

    def values(items: list[RiskAssessment], feature: str) -> list[object]:
        if feature == "transactionAmount":
            return [float(item.transaction.amount) for item in items]
        if feature == "deviceDistribution":
            return [item.transaction.device_id or "NOT_COLLECTED" for item in items]
        if feature == "locationDistribution":
            return [item.transaction.location or "NOT_COLLECTED" for item in items]
        return [item.score >= 71 for item in items]

    drift_details = {
        feature: distribution_shift(
            values(reference, feature),
            values(recent, feature),
            feature != "transactionAmount",
        )
        for feature in (
            "transactionAmount",
            "deviceDistribution",
            "locationDistribution",
            "highRiskRate",
        )
    }
    feature_status = {feature: detail["status"] for feature, detail in drift_details.items()}
    severity = {"INSUFFICIENT_DATA": -1, "LOW": 0, "MEDIUM": 1, "HIGH": 2}
    overall_status = max(feature_status.values(), key=lambda value: severity[value])
    telemetry = operational_metrics.snapshot()
    return {
        "models": {name: manifest[name] for name in ("fraud", "anomaly", "fusion", "return")},
        "dataset": manifest["dataset"],
        "operational": {
            "measuredRequests": len(latencies),
            "averageInferenceLatencyMs": (round(sum(latencies) / len(latencies), 3) if latencies else None),
            "errorRate": round(telemetry.error_rate, 6) if telemetry.error_rate is not None else None,
            "errorRateStatus": "PROCESS_LOCAL_MEASURED",
            "apiRequests": telemetry.requests,
            "apiErrors": telemetry.errors,
            "averageApiLatencyMs": (
                round(telemetry.average_latency_ms, 3) if telemetry.average_latency_ms is not None else None
            ),
        },
        "drift": {
            "status": overall_status,
            "sampleSize": len(assessments),
            "minimumRequired": 60,
            "referenceSamples": len(reference),
            "recentSamples": len(recent),
            "features": feature_status,
            "details": drift_details,
            "method": (
                "Older half versus newer half of up to 500 active-dataset events; "
                "PSI for amount and total-variation distance for categorical features."
            ),
        },
        "disclaimer": (
            "Evaluation uses the active merchant-labeled dataset's held-out split."
            if manifest["dataset"].get("provenance") == "MERCHANT_LABELED_REAL_TIME"
            else "Evaluation uses held-out synthetic demonstration data."
        ),
    }


@router.get("/monitoring/ieee-cis")
def ieee_cis_candidate_monitoring(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.VIEWER)),
    ],
) -> dict[str, object]:
    del current
    artifact_dir = Path(get_settings().ieee_cis_model_dir).resolve()

    def read_json(name: str) -> dict[str, object]:
        path = artifact_dir / name
        if not path.is_file():
            raise HTTPException(status_code=503, detail=f"IEEE-CIS artifact unavailable: {name}")
        return json.loads(path.read_text())

    report = read_json("training_report.json")
    risk = read_json("risk_config.json")
    threshold_analysis = read_json("threshold_analysis.json")
    manifest = read_json("artifact_manifest.json")
    promotion = ieee_cis_promotion_evidence()
    if promotion["servingStatus"] == "APPROVED":
        model_status = "APPROVED_SCHEMA_SPECIFIC"
    elif promotion["eligibleForSchemaSpecificPromotion"]:
        model_status = "CANDIDATE_NOT_PROMOTED"
    else:
        model_status = "CANDIDATE_REJECTED_BY_GOVERNANCE"
    return {
        "status": model_status,
        "modelVersion": risk["model_version"],
        "selectedModel": report["selected_model"],
        "selectionMetric": report["selection_metric"],
        "split": report["split"],
        "featureCount": report["feature_count"],
        "trainingRows": report["training_rows"],
        "calibrationRows": report["calibration_rows"],
        "selectionRows": report["selection_rows"],
        "lockedTestRows": report["locked_test_rows"],
        "candidateValidationResults": report["candidate_validation_results"],
        "lockedTest": report["locked_test_f1_threshold"],
        "thresholds": {
            "medium": risk["low_threshold"],
            "high": risk["high_threshold"],
            "review": risk["review_threshold"],
            "costSensitive": risk["profiles"]["cost_sensitive"]["threshold"],
        },
        "thresholdAnalysis": threshold_analysis["thresholds"],
        "costs": threshold_analysis["costs_inr"],
        "explainability": "PERMUTATION_SHAP_VERIFIED_FINAL_PROBABILITY",
        "artifactFiles": sorted(manifest["files"]),
        "disclaimer": (
            "Locked temporal test metrics for the IEEE-CIS candidate. The model is isolated from "
            "the ordinary merchant API and cannot execute financial actions. Cost values are "
            "illustrative configuration assumptions."
        ),
        "promotion": promotion,
    }


@router.get("/monitoring/deployment-readiness")
def deployment_readiness(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.VIEWER)),
    ],
) -> dict[str, object]:
    del current
    configuration = get_settings()
    promotion = ieee_cis_promotion_evidence()
    production = configuration.environment == "production"
    checks = [
        {
            "id": 1,
            "area": "ML performance",
            "status": "PASS_CANDIDATE" if promotion["eligibleForSchemaSpecificPromotion"] else "FAIL",
            "evidence": promotion["lockedTestMetrics"],
        },
        {
            "id": 2,
            "area": "Unseen temporal test",
            "status": "PASS" if promotion["gates"]["locked_temporal_test"] else "FAIL",
            "evidence": "IEEE-CIS locked chronological test; main model remains synthetic/demo.",
        },
        {"id": 3, "area": "Fraud scenarios", "status": "PASS", "evidence": "Automated API tests."},
        {"id": 4, "area": "Complete risk pipeline", "status": "PASS", "evidence": "Integration tests."},
        {
            "id": 5,
            "area": "Explainability",
            "status": "PASS_CANDIDATE",
            "evidence": (
                "Verified calibrated-probability permutation SHAP for IEEE-CIS; "
                "structured contributions for contextual fusion."
            ),
        },
        {
            "id": 6,
            "area": "RAG and LLM",
            "status": "BOUNDED_LOCAL",
            "evidence": (
                "Grounded ranked policy retrieval and deterministic agent; no external LLM configured."
            ),
        },
        {
            "id": 7,
            "area": "Database integrity",
            "status": "PASS_RUNTIME" if not configuration.database_url.startswith("sqlite") else "LOCAL_ONLY",
            "evidence": configuration.database_url.split(":", 1)[0],
        },
        {
            "id": 8,
            "area": "Security",
            "status": "PASS_RUNTIME" if production else "DEVELOPMENT_CONFIG",
            "evidence": {
                "rateLimitBackend": configuration.rate_limit_backend,
                "otpProvider": configuration.otp_delivery_provider,
                "secretProvider": configuration.secret_provider,
            },
        },
        {
            "id": 9,
            "area": "Performance and failures",
            "status": "CI_REQUIRED",
            "evidence": "10/100/1000 load harness and failure tests are part of verification.",
        },
        {
            "id": 10,
            "area": "End-to-end production flow",
            "status": "CI_REQUIRED",
            "evidence": "API E2E, browser E2E, PostgreSQL migrations, and container build are CI gates.",
        },
    ]
    blockers = [item for item in checks if item["status"] not in {"PASS", "PASS_RUNTIME"}]
    return {
        "productionReady": not blockers,
        "modelPromotion": promotion,
        "checks": checks,
        "blockerCount": len(blockers),
        "statement": (
            "Readiness is evidence-based; candidate and development checks are not production approval."
        ),
    }


@router.get("/fraud/spike")
def spike(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
    db: Annotated[Session, Depends(get_db)],
    current_minutes: Annotated[int, Query(ge=5, le=1440)] = 15,
    baseline_hours: Annotated[int, Query(ge=1, le=168)] = 24,
) -> dict[str, object]:
    assessments = latest_assessments(db, current.merchant_id)
    result = detect_spike(
        [(item.transaction.occurred_at, item.score) for item in assessments],
        current_minutes=current_minutes,
        baseline_hours=baseline_hours,
    )
    current_items = [assessments[index] for index in result.current_indexes]
    return {
        **result.as_dict(),
        "window": f"Latest {current_minutes} event-time minutes versus the preceding {baseline_hours} hours",
        "contributors": Counter(signal.code for item in current_items for signal in item.signals).most_common(
            5
        ),
        "minimumSamples": {"current": 5, "baseline": 20},
        "limitation": "A spike is emitted only when both event-time windows meet minimum support.",
    }


@router.get("/returns")
def returns(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    grouped: dict[str, list[RiskAssessment]] = {}
    for item in latest_assessments(db, current.merchant_id):
        grouped.setdefault(item.transaction.customer_id, []).append(item)
    summaries: list[dict[str, object]] = []
    for customer_id, items in grouped.items():
        scores = [float(item.return_risk_score or 0) for item in items]
        amounts = [float(item.transaction.amount) for item in items]
        elevated = sum(score >= 0.5 for score in scores)
        drivers = []
        if max(scores, default=0) >= 0.7:
            drivers.append("Return model output is elevated for at least one stored event")
        if len(items) >= 2:
            drivers.append("Repeated customer activity is available for historical comparison")
        if max(amounts, default=0) >= 2 * max(sum(amounts) / max(len(amounts), 1), 1):
            drivers.append("An order amount is materially above this customer's stored average")
        if not drivers:
            drivers.append("No dominant return-risk driver is available in the stored evidence")
        summaries.append(
            {
                "customerId": customer_id,
                "returnRisk": round(max(scores, default=0) * 100),
                "averageReturnRisk": round(sum(scores) / max(len(scores), 1) * 100),
                "elevatedSignalRate": round(elevated / max(len(items), 1), 4),
                "recentElevatedSignals": elevated,
                "transactionCount": len(items),
                "averageOrder": round(sum(amounts) / max(len(amounts), 1), 2),
                "riskDrivers": drivers,
                "recentTransactions": [
                    {
                        "transactionId": item.transaction.external_id,
                        "amount": float(item.transaction.amount),
                        "currency": item.transaction.currency,
                        "timestamp": item.transaction.occurred_at.isoformat(),
                        "returnRisk": round(float(item.return_risk_score or 0) * 100),
                    }
                    for item in items[:5]
                ],
                "category": "RETURN_RISK_NOT_FRAUD",
                "provenance": items[0].model_provenance,
                "limitation": (
                    "Return-risk outputs are model estimates. Confirmed returns and reasons are not stored, "
                    "so the app does not present them as observed outcomes."
                ),
            }
        )
    return sorted(summaries, key=lambda item: int(item["returnRisk"]), reverse=True)


def chargeback_assessment(
    chargeback_id: str,
    current: AuthContext,
    db: Session,
) -> RiskAssessment:
    transaction_id = f"TX-{chargeback_id.removeprefix('CB-')}"
    assessment = db.scalar(
        select(RiskAssessment)
        .join(RiskAssessment.transaction)
        .where(
            Transaction.external_id == transaction_id,
            *transaction_scope(db, current.merchant_id),
        )
        .options(selectinload(RiskAssessment.transaction), selectinload(RiskAssessment.signals))
        .order_by(desc(RiskAssessment.created_at))
    )
    if assessment is None or assessment.score < 31:
        raise HTTPException(status_code=404, detail="Chargeback case not found")
    return assessment


def chargeback_view(
    assessment: RiskAssessment,
    current: AuthContext,
    db: Session,
) -> dict[str, object]:
    transaction = assessment.transaction
    chargeback_id = f"CB-{transaction.external_id.removeprefix('TX-')}"
    history_count = (
        db.query(Transaction)
        .filter(
            Transaction.merchant_id == current.merchant_id,
            Transaction.customer_id == transaction.customer_id,
        )
        .count()
    )
    evidence = [
        {"label": "Transaction record", "source": transaction.external_id},
        {"label": "Risk assessment", "source": assessment.engine_version},
    ]
    if history_count > 1:
        evidence.append({"label": "Customer history", "source": f"{history_count - 1} prior records"})
    if transaction.device_id:
        evidence.append({"label": "Device information", "source": transaction.device_id})
    missing = ["Order information", "Delivery confirmation"]
    audit_events = list(
        db.scalars(
            select(AuditEvent)
            .where(
                AuditEvent.merchant_id == current.merchant_id,
                AuditEvent.entity_id == chargeback_id,
            )
            .order_by(AuditEvent.created_at)
        )
    )
    generated = any(event.event_type == "CHARGEBACK_EVIDENCE_SUMMARY_GENERATED" for event in audit_events)
    pending_review = any(event.event_type == "CHARGEBACK_SENT_FOR_REVIEW" for event in audit_events)
    policies = retrieve_policies(
        db,
        current.merchant_id,
        "chargeback transaction dispute evidence delivery response template human review",
        limit=3,
    )
    draft = None
    if generated:
        available_labels = ", ".join(item["label"] for item in evidence)
        draft = (
            f"Evidence summary for {chargeback_id}: verified sources available are {available_labels}. "
            f"Unavailable evidence: {', '.join(missing)}. "
            "This draft requires human approval before external submission."
        )
    return {
        "chargebackId": chargeback_id,
        "transactionId": transaction.external_id,
        "customerId": transaction.customer_id,
        "reason": "Transaction Dispute",
        "riskScore": assessment.score,
        "riskLevel": assessment.risk_level,
        "evidence": evidence,
        "missingEvidence": missing,
        "status": "PENDING_HUMAN_REVIEW" if pending_review else "DRAFT_READY" if generated else "OPEN",
        "draft": draft,
        "policySources": [
            {
                "name": policy.name,
                "version": policy.version,
                "excerpt": policy.excerpt,
                "relevance": round(policy.score, 3),
            }
            for policy in policies
        ],
        "timeline": [
            {
                "timestamp": transaction.created_at.isoformat(),
                "event": "Chargeback received",
                "actor": "SYSTEM",
            },
            {
                "timestamp": transaction.created_at.isoformat(),
                "event": "Chargeback case created",
                "actor": "SYSTEM",
            },
            *[
                {
                    "timestamp": event.created_at.isoformat(),
                    "event": event.event_type.replace("_", " ").title(),
                    "actor": event.actor_type,
                }
                for event in audit_events
            ],
        ],
        "externalSubmissionExecuted": False,
    }


@router.get("/chargebacks")
def chargebacks(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    return [
        chargeback_view(item, current, db)
        for item in latest_assessments(db, current.merchant_id)
        if item.score >= 31
    ]


@router.post("/chargebacks/{chargeback_id}/generate-summary")
def generate_chargeback_summary(
    chargeback_id: str,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    assessment = chargeback_assessment(chargeback_id, current, db)
    db.add(
        AuditEvent(
            merchant_id=current.merchant_id,
            dataset_id=assessment.transaction.dataset_id,
            entity_type="chargeback_case",
            entity_id=chargeback_id,
            event_type="CHARGEBACK_EVIDENCE_SUMMARY_GENERATED",
            actor_type="AGENT",
            detail="Draft generated from available evidence; missing evidence remained explicit.",
        )
    )
    db.commit()
    return chargeback_view(assessment, current, db)


@router.post("/chargebacks/{chargeback_id}/send-review")
def send_chargeback_for_review(
    chargeback_id: str,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    assessment = chargeback_assessment(chargeback_id, current, db)
    generated = db.scalar(
        select(AuditEvent.id).where(
            AuditEvent.merchant_id == current.merchant_id,
            AuditEvent.entity_id == chargeback_id,
            AuditEvent.event_type == "CHARGEBACK_EVIDENCE_SUMMARY_GENERATED",
        )
    )
    if generated is None:
        raise HTTPException(status_code=409, detail="Generate an evidence summary before review")
    db.add(
        AuditEvent(
            merchant_id=current.merchant_id,
            dataset_id=assessment.transaction.dataset_id,
            entity_type="chargeback_case",
            entity_id=chargeback_id,
            event_type="CHARGEBACK_SENT_FOR_REVIEW",
            actor_type="USER",
            detail="Draft routed to human review; no external submission executed.",
        )
    )
    db.commit()
    return chargeback_view(assessment, current, db)
