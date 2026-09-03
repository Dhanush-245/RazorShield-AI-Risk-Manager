from __future__ import annotations

from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import AuthContext, get_current_user, require_roles
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.auth import Merchant, User, UserRole
from app.models.cases import RiskCase
from app.models.risk import RiskAssessment, Transaction
from app.services.dataset_scope import get_active_dataset, transaction_scope
from app.services.spike_detection import detect_spike

router = APIRouter(tags=["risk-operations"])


def merchant_assessments(db: Session, merchant_id: str) -> list[tuple[RiskAssessment, Transaction]]:
    return list(
        db.execute(
            select(RiskAssessment, Transaction)
            .join(Transaction, RiskAssessment.transaction_id == Transaction.id)
            .where(*transaction_scope(db, merchant_id))
            .order_by(desc(Transaction.occurred_at))
        ).all()
    )


@router.get("/reviews")
def review_queue(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    rows = db.execute(
        select(RiskCase, Transaction, RiskAssessment, User)
        .join(Transaction, RiskCase.transaction_id == Transaction.id)
        .join(RiskAssessment, RiskAssessment.transaction_id == Transaction.id)
        .join(User, RiskCase.assigned_user_id == User.id, isouter=True)
        .where(RiskCase.merchant_id == current.merchant_id, *transaction_scope(db, current.merchant_id))
        .order_by(desc(RiskCase.created_at))
    )
    now = datetime.now(UTC)

    def age_hours(created_at: datetime) -> float:
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        return max((now - created_at).total_seconds() / 3600, 0)

    return [
        {
            "caseId": case.case_reference,
            "transactionId": transaction.external_id,
            "customerId": transaction.customer_id,
            "riskScore": assessment.score,
            "riskLevel": assessment.risk_level,
            "amount": float(transaction.amount),
            "currency": transaction.currency,
            "reason": assessment.engine_type,
            "status": case.status,
            "assignedReviewer": user.display_name if user else None,
            "assignedToMe": case.assigned_user_id == current.user_id,
            "caseType": case.case_type,
            "recommendation": case.recommendation,
            "humanDecision": case.human_decision,
            "createdAt": case.created_at.isoformat(),
            "ageHours": round(age_hours(case.created_at), 2),
            "slaStatus": "BREACHED"
            if case.status != "RESOLVED" and age_hours(case.created_at) > 24
            else "WITHIN_24H",
        }
        for case, transaction, assessment, user in rows
    ]


@router.post("/reviews/{case_reference}/claim")
def claim_review(
    case_reference: str,
    current: Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.REVIEWER))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    case = db.scalar(
        select(RiskCase)
        .join(Transaction, RiskCase.transaction_id == Transaction.id)
        .where(
            RiskCase.case_reference == case_reference,
            RiskCase.merchant_id == current.merchant_id,
            *transaction_scope(db, current.merchant_id),
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Review case not found")
    if case.status == "RESOLVED":
        raise HTTPException(status_code=409, detail="Resolved cases cannot be claimed")
    if case.assigned_user_id not in {None, current.user_id}:
        raise HTTPException(status_code=409, detail="Case is already assigned to another reviewer")
    case.assigned_user_id = current.user_id
    db.add(
        AuditEvent(
            merchant_id=current.merchant_id,
            dataset_id=get_active_dataset(db, current.merchant_id).id,
            entity_type="review_case",
            entity_id=case.case_reference,
            event_type="HUMAN_REVIEWER_CLAIMED",
            actor_type="USER",
            detail=f"Reviewer {current.user_id} claimed the case; no financial action was executed.",
        )
    )
    db.commit()
    return {
        "caseId": case.case_reference,
        "status": case.status,
        "assignedUserId": current.user_id,
        "financialActionExecuted": False,
    }


@router.get("/search")
def global_search(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
    q: Annotated[str, Query(min_length=2, max_length=100)],
) -> list[dict[str, object]]:
    pattern = f"%{q.strip()}%"
    transaction_rows = db.execute(
        select(Transaction, RiskAssessment)
        .join(RiskAssessment, RiskAssessment.transaction_id == Transaction.id)
        .where(
            *transaction_scope(db, current.merchant_id),
            or_(
                Transaction.external_id.ilike(pattern),
                Transaction.customer_id.ilike(pattern),
                Transaction.device_id.ilike(pattern),
                Transaction.location.ilike(pattern),
            ),
        )
        .order_by(desc(Transaction.occurred_at))
        .limit(20)
    )
    results = [
        {
            "type": "transaction",
            "id": transaction.external_id,
            "title": transaction.external_id,
            "subtitle": f"{transaction.customer_id} · {transaction.device_id or 'No device'}",
            "riskScore": assessment.score,
            "href": f"/investigations/{transaction.external_id}",
        }
        for transaction, assessment in transaction_rows
    ]
    cases = db.scalars(
        select(RiskCase)
        .join(Transaction, RiskCase.transaction_id == Transaction.id)
        .where(
            RiskCase.merchant_id == current.merchant_id,
            *transaction_scope(db, current.merchant_id),
            RiskCase.case_reference.ilike(pattern),
        )
        .limit(20)
    )
    results.extend(
        {
            "type": "case",
            "id": case.case_reference,
            "title": case.case_reference,
            "subtitle": f"{case.case_type} · {case.status}",
            "riskScore": None,
            "href": "/reviews",
        }
        for case in cases
    )
    customer_ids = sorted(
        {
            transaction.customer_id
            for _assessment, transaction in merchant_assessments(db, current.merchant_id)
            if q.lower() in transaction.customer_id.lower()
        }
    )[:10]
    results.extend(
        {
            "type": "customer",
            "id": customer_id,
            "title": customer_id,
            "subtitle": "Customer 360",
            "riskScore": None,
            "href": f"/entities/customers/{customer_id}",
        }
        for customer_id in customer_ids
    )
    device_rows: dict[str, list[tuple[RiskAssessment, Transaction]]] = defaultdict(list)
    for assessment, transaction in merchant_assessments(db, current.merchant_id):
        if transaction.device_id and q.lower() in transaction.device_id.lower():
            device_rows[transaction.device_id].append((assessment, transaction))
    results.extend(
        {
            "type": "device",
            "id": device_id,
            "title": device_id,
            "subtitle": (
                f"{len(items)} transactions · "
                f"{len({transaction.customer_id for _, transaction in items})} customers"
            ),
            "riskScore": max(assessment.score for assessment, _ in items),
            "href": f"/network?entity=device:{device_id}",
        }
        for device_id, items in sorted(device_rows.items())[:10]
    )
    return results[:30]


@router.get("/entities/customers/{customer_id}")
def customer_360(
    customer_id: str,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    rows = [
        (assessment, transaction)
        for assessment, transaction in merchant_assessments(db, current.merchant_id)
        if transaction.customer_id == customer_id
    ]
    if not rows:
        raise HTTPException(status_code=404, detail="Customer not found")
    devices = sorted({transaction.device_id for _, transaction in rows if transaction.device_id})
    locations = sorted({transaction.location for _, transaction in rows if transaction.location})
    return_events = sum(float(assessment.return_risk_score or 0) >= 0.5 for assessment, _ in rows)
    high_risk = sum(assessment.score >= 71 for assessment, _ in rows)
    amounts = [float(transaction.amount) for _, transaction in rows]
    return_scores = [float(assessment.return_risk_score or 0) for assessment, _ in rows]
    timeline = [
        {
            "timestamp": transaction.occurred_at.isoformat(),
            "event": "Transaction assessed",
            "reference": transaction.external_id,
            "riskScore": assessment.score,
            "detail": f"{transaction.currency} {float(transaction.amount):,.2f} · {assessment.risk_level}",
        }
        for assessment, transaction in rows
    ]
    return {
        "customerId": customer_id,
        "riskScore": max(assessment.score for assessment, _ in rows),
        "transactions": len(rows),
        "returns": return_events,
        "chargebackCandidates": sum(assessment.score >= 31 for assessment, _ in rows),
        "devices": devices,
        "locations": locations,
        "fraudFlags": high_risk,
        "relatedEntities": len(devices) + len(locations),
        "averageOrderValue": round(sum(amounts) / len(amounts), 2),
        "maximumReturnRisk": round(max(return_scores) * 100),
        "elevatedReturnRiskRate": round(return_events / len(rows), 4),
        "ipAddressStatus": "NOT_COLLECTED",
        "timeline": timeline,
        "provenance": (
            "Derived from merchant-scoped stored assessments; chargeback candidates are "
            "score-based workflow candidates, not observed disputes."
        ),
    }


@router.get("/cases/{case_reference}/timeline")
def case_timeline(
    case_reference: str,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    case = db.scalar(
        select(RiskCase)
        .join(Transaction, RiskCase.transaction_id == Transaction.id)
        .where(
            RiskCase.merchant_id == current.merchant_id,
            *transaction_scope(db, current.merchant_id),
            RiskCase.case_reference == case_reference,
        )
    )
    if case is None:
        raise HTTPException(status_code=404, detail="Case not found")
    transaction = db.get(Transaction, case.transaction_id)
    assessment = db.scalar(
        select(RiskAssessment)
        .where(RiskAssessment.transaction_id == case.transaction_id)
        .order_by(RiskAssessment.created_at)
    )
    events: list[dict[str, object]] = []
    if transaction:
        events.append(
            {
                "timestamp": transaction.created_at.isoformat(),
                "event": "Transaction received",
                "actor": "SYSTEM",
                "detail": transaction.external_id,
            }
        )
    if assessment:
        events.append(
            {
                "timestamp": assessment.created_at.isoformat(),
                "event": "Risk assessment completed",
                "actor": "MODEL",
                "detail": f"{assessment.risk_level} · {assessment.score}/100 · {assessment.engine_version}",
            }
        )
    events.append(
        {
            "timestamp": case.created_at.isoformat(),
            "event": "Review case created",
            "actor": "SYSTEM",
            "detail": case.recommendation,
        }
    )
    audits = db.scalars(
        select(AuditEvent)
        .where(AuditEvent.merchant_id == current.merchant_id, AuditEvent.entity_id == case.case_reference)
        .order_by(AuditEvent.created_at)
    )
    events.extend(
        {
            "timestamp": event.created_at.isoformat(),
            "event": event.event_type.replace("_", " ").title(),
            "actor": event.actor_type,
            "detail": event.detail,
        }
        for event in audits
    )
    return sorted(events, key=lambda event: str(event["timestamp"]))


@router.get("/notifications")
def notifications(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, object]]:
    rows = merchant_assessments(db, current.merchant_id)
    alerts: list[dict[str, object]] = []
    merchant = db.get(Merchant, current.merchant_id)
    merchant_label = merchant.external_id if merchant else current.merchant_id
    if len(rows) >= 4:
        current_rate = sum(assessment.score >= 71 for assessment, _ in rows[:3]) / 3
        baseline_rate = sum(assessment.score >= 71 for assessment, _ in rows[3:]) / max(len(rows[3:]), 1)
        if current_rate > baseline_rate + 0.25:
            alerts.append(
                {
                    "id": "fraud-spike-current",
                    "severity": "HIGH",
                    "type": "FRAUD_SPIKE",
                    "title": "Fraud spike detected",
                    "detail": f"High-risk rate moved from {baseline_rate:.1%} to {current_rate:.1%}.",
                    "href": "/fraud-intelligence",
                    "merchantId": merchant_label,
                    "window": "latest 3 events versus prior stored events",
                }
            )
    if rows:
        device_customers: dict[str, set[str]] = defaultdict(set)
        for _assessment, transaction in rows:
            if transaction.device_id:
                device_customers[transaction.device_id].add(transaction.customer_id)
        shared = sorted(
            (
                (device, len(customers))
                for device, customers in device_customers.items()
                if len(customers) >= 2
            ),
            key=lambda item: item[1],
            reverse=True,
        )
        if shared:
            device, customer_count = shared[0]
            alerts.append(
                {
                    "id": f"network-{device}",
                    "severity": "MEDIUM",
                    "type": "SUSPICIOUS_NETWORK_CLUSTER",
                    "title": f"Shared-device cluster {device}",
                    "detail": f"Observed across {customer_count} customers in the active merchant dataset.",
                    "href": f"/network?entity=device:{device}",
                    "merchantId": merchant_label,
                    "window": "active dataset",
                }
            )
        high_velocity = sum(float(assessment.velocity_score or 0) >= 0.7 for assessment, _ in rows[:10])
        if high_velocity:
            alerts.append(
                {
                    "id": "velocity-current",
                    "severity": "MEDIUM",
                    "type": "HIGH_VOLUME_ACTIVITY",
                    "title": "Elevated transaction velocity",
                    "detail": (
                        f"{high_velocity} of the latest {min(len(rows), 10)} events have "
                        "velocity scores at or above 70."
                    ),
                    "href": "/transactions",
                    "merchantId": merchant_label,
                    "window": "latest 10 stored events",
                }
            )
        chargeback_candidates = sum(assessment.score >= 31 for assessment, _ in rows)
        if len(rows) >= 4 and chargeback_candidates / len(rows) >= 0.5:
            alerts.append(
                {
                    "id": "chargeback-candidates-current",
                    "severity": "MEDIUM",
                    "type": "CHARGEBACK_CANDIDATE_INCREASE",
                    "title": "Chargeback candidate workload elevated",
                    "detail": (
                        f"{chargeback_candidates} of {len(rows)} active events meet the "
                        "documented candidate threshold."
                    ),
                    "href": "/chargebacks",
                    "merchantId": merchant_label,
                    "window": "active dataset",
                }
            )
    for assessment, transaction in rows[:10]:
        if assessment.score >= 71:
            alerts.append(
                {
                    "id": f"high-risk-{transaction.external_id}",
                    "severity": "HIGH",
                    "type": "HIGH_RISK_TRANSACTION",
                    "title": f"High-risk transaction {transaction.external_id}",
                    "detail": (
                        f"Score {assessment.score}/100 · {transaction.currency} "
                        f"{float(transaction.amount):,.2f}"
                    ),
                    "href": f"/investigations/{transaction.external_id}",
                    "merchantId": merchant_label,
                    "window": "active dataset",
                }
            )
    return alerts[:20]


@router.get("/fraud/intelligence")
def fraud_intelligence(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
    db: Annotated[Session, Depends(get_db)],
    current_minutes: Annotated[int, Query(ge=5, le=1440)] = 15,
    baseline_hours: Annotated[int, Query(ge=1, le=168)] = 24,
) -> dict[str, object]:
    rows = merchant_assessments(db, current.merchant_id)
    result = detect_spike(
        [(transaction.occurred_at, assessment.score) for assessment, transaction in rows],
        current_minutes=current_minutes,
        baseline_hours=baseline_hours,
    )
    latest = [rows[index] for index in result.current_indexes]
    locations = Counter(transaction.location or "Unknown" for _, transaction in latest)
    devices = Counter(transaction.device_id or "Unknown" for _, transaction in latest)
    methods = Counter(transaction.payment_method or "Unknown" for _, transaction in latest)
    trend = [
        {
            "timestamp": transaction.occurred_at.isoformat(),
            "riskScore": assessment.score,
            "highRisk": assessment.score >= 71,
        }
        for assessment, transaction in reversed(rows[:12])
    ]
    return {
        **result.as_dict(),
        "window": f"Latest {current_minutes} event-time minutes versus the preceding {baseline_hours} hours",
        "contributors": {
            "locations": locations.most_common(5),
            "devices": devices.most_common(5),
            "paymentMethods": methods.most_common(5),
        },
        "sampleSize": len(rows),
        "minimumSamples": {"current": 5, "baseline": 20},
        "trend": trend,
        "unavailableContributors": ["IP address", "merchant category"],
        "limitation": "A spike is emitted only when both event-time windows meet minimum support.",
    }


@router.get("/analytics")
def analytics(
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.VIEWER)),
    ],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    rows = merchant_assessments(db, current.merchant_id)
    cases = list(
        db.scalars(
            select(RiskCase)
            .join(Transaction, RiskCase.transaction_id == Transaction.id)
            .where(RiskCase.merchant_id == current.merchant_id, *transaction_scope(db, current.merchant_id))
        )
    )
    distribution = defaultdict(int)
    for assessment, _ in rows:
        distribution[assessment.risk_level] += 1
    labeled_transactions = [
        transaction for _assessment, transaction in rows if transaction.fraud_label is not None
    ]
    confirmed_fraud = sum(transaction.fraud_label is True for transaction in labeled_transactions)
    return {
        "transactions": len(rows),
        "flaggedTransactions": distribution["HIGH"] + distribution["MEDIUM"],
        "highRisk": distribution["HIGH"],
        "mediumRisk": distribution["MEDIUM"],
        "lowRisk": distribution["LOW"],
        "potentialLoss": round(
            sum(float(transaction.amount) for assessment, transaction in rows if assessment.score >= 71), 2
        ),
        "confirmedFraud": confirmed_fraud,
        "fraudOutcomeCoverage": round(len(labeled_transactions) / max(len(rows), 1), 4),
        "preventedLoss": 0,
        "returnRiskCases": sum(float(assessment.return_risk_score or 0) >= 0.5 for assessment, _ in rows),
        "chargebackCandidates": sum(assessment.score >= 31 for assessment, _ in rows),
        "openReviewWorkload": sum(case.status not in {"RESOLVED", "CLOSED"} for case in cases),
        "resolvedReviews": sum(case.status in {"RESOLVED", "CLOSED"} for case in cases),
        "costModel": (
            "Potential loss equals amount of HIGH-risk events. "
            "Prevented loss requires confirmed outcome data."
        ),
        "currency": "INR",
    }


@router.get("/settings/profile")
def settings_profile(
    current: Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    user = db.get(User, current.user_id)
    merchant = db.get(Merchant, current.merchant_id)
    active_dataset = get_active_dataset(db, current.merchant_id)
    return {
        "displayName": user.display_name if user else "Unknown",
        "role": current.role.value,
        "merchantId": merchant.external_id if merchant else current.merchant_id,
        "merchantName": merchant.name if merchant else "Unknown merchant",
        "environment": "development",
        "agentFinancialActions": "DISABLED",
        "dataProvenance": "UPLOADED_DATASET" if active_dataset.id else "SYNTHETIC_DEMO",
        "activeDatasetId": active_dataset.id,
        "activeDatasetName": active_dataset.name,
        "activeDatasetActivatedAt": (
            active_dataset.activated_at.isoformat() if active_dataset.activated_at else None
        ),
    }


@router.get("/datasets/active")
def active_dataset_status(
    current: Annotated[AuthContext, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, object]:
    active = get_active_dataset(db, current.merchant_id)
    row_count = db.scalar(
        select(func.count(Transaction.id)).where(*transaction_scope(db, current.merchant_id))
    )
    return {
        "datasetId": active.id,
        "datasetName": active.name,
        "activatedAt": active.activated_at.isoformat() if active.activated_at else None,
        "rowCount": int(row_count or 0),
        "source": "UPLOADED" if active.id else "BUNDLED_DEMO",
        "scope": "All operational sections use this dataset.",
    }
