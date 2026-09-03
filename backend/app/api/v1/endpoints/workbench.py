"""Merchant-scoped investigation tools; simulations never write to the ledger."""

import json
from collections import Counter, defaultdict
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies import AuthContext, require_roles
from app.api.v1.endpoints.risk import rule_thresholds
from app.core.config import get_settings
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.auth import UserRole
from app.models.cases import RiskCase
from app.models.risk import RiskAssessment, RuleConfiguration, Transaction
from app.schemas.risk import RiskAssessmentRequest
from app.services.dataset_scope import get_active_dataset, transaction_scope
from app.services.label_maturity import is_mature_label
from app.services.model_risk import RuleThresholds, assess_with_models, load_models
from app.services.risk_workbench import (
    confusion,
    digest,
    distribution_shift,
    reliability_table,
    scenario_inputs,
    simulate,
    slice_report,
)

router = APIRouter(prefix="/workbench", tags=["risk-workbench"])
Investigator = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.REVIEWER))
]
Observer = Annotated[
    AuthContext, Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST, UserRole.VIEWER))
]
Database = Annotated[Session, Depends(get_db)]


def current_rules(db: Session, merchant: str) -> RuleThresholds:
    configuration = db.scalar(select(RuleConfiguration).where(RuleConfiguration.merchant_id == merchant))
    return rule_thresholds(configuration) if configuration else RuleThresholds()


def scoped_assessments(db: Session, merchant: str) -> list[RiskAssessment]:
    return list(
        db.scalars(
            select(RiskAssessment)
            .join(Transaction)
            .options(selectinload(RiskAssessment.transaction))
            .where(*transaction_scope(db, merchant))
            .order_by(Transaction.occurred_at, RiskAssessment.id)
        )
    )


def find_assessment(db: Session, merchant: str, transaction_id: str) -> RiskAssessment:
    assessment = db.scalar(
        select(RiskAssessment)
        .join(Transaction)
        .where(*transaction_scope(db, merchant), Transaction.external_id == transaction_id)
        .order_by(desc(RiskAssessment.created_at))
    )
    if assessment is None:
        raise HTTPException(404, "Transaction not found in the active merchant dataset")
    return assessment


def snapshot(db: Session, merchant: str, assessment: RiskAssessment) -> dict | None:
    event = db.scalar(
        select(AuditEvent).where(
            AuditEvent.merchant_id == merchant,
            AuditEvent.entity_id == assessment.id,
            AuditEvent.event_type == "DECISION_SNAPSHOT_RECORDED",
        )
    )
    if not event:
        return None
    try:
        envelope = json.loads(event.detail)
        if digest(envelope["body"]) != envelope["sha256"]:
            raise ValueError("digest mismatch")
        return envelope
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(409, "Stored decision snapshot integrity check failed") from exc


@router.get("/presets")
def presets(current: Investigator) -> dict:
    return {key: value.model_dump(mode="json") for key, value in scenario_inputs(current.merchant_id).items()}


@router.post("/simulate")
def simulate_risk(payload: RiskAssessmentRequest, current: Investigator, db: Database) -> dict:
    if payload.merchant_id != current.merchant_id:
        raise HTTPException(403, "Merchant access denied")
    return simulate(payload, current_rules(db, current.merchant_id))


@router.post("/transactions/{transaction_id}/counterfactuals")
def counterfactuals(transaction_id: str, current: Investigator, db: Database) -> dict:
    assessment = find_assessment(db, current.merchant_id, transaction_id)
    envelope = snapshot(db, current.merchant_id, assessment)
    if envelope is None:
        raise HTTPException(
            409, "Historical raw inputs unavailable. Use the sandbox; no historical replay is claimed."
        )
    body = envelope["body"]
    payload = RiskAssessmentRequest.model_validate(body["input"])
    response = simulate(payload, RuleThresholds(**body["rules"]))
    response["storedScore"] = assessment.score
    response["storedVersion"] = assessment.engine_version
    response["versionMatches"] = assessment.engine_version == response["baseline"]["modelVersion"]
    response["context"] = (
        "Frozen enriched inputs and historical rule configuration; currently loaded model artifacts."
    )
    return response


@router.get("/transactions/{transaction_id}/replay")
def replay(transaction_id: str, current: Investigator, db: Database) -> dict:
    assessment = find_assessment(db, current.merchant_id, transaction_id)
    transaction = assessment.transaction
    envelope = snapshot(db, current.merchant_id, assessment)
    features = json.loads(assessment.feature_snapshot or "{}")
    case = db.scalar(
        select(RiskCase).where(
            RiskCase.transaction_id == transaction.id, RiskCase.merchant_id == current.merchant_id
        )
    )
    events = list(
        db.scalars(
            select(AuditEvent)
            .where(
                AuditEvent.merchant_id == current.merchant_id,
                AuditEvent.entity_id.in_([assessment.id, case.case_reference if case else ""]),
                AuditEvent.event_type != "DECISION_SNAPSHOT_RECORDED",
            )
            .order_by(AuditEvent.created_at)
        )
    )
    observations = []
    for key, label in [
        ("new_device", "New device reported"),
        ("new_location", "Unusual location reported"),
        ("transactions_5m", "Transactions in five minutes"),
        ("amount_deviation", "Amount / baseline ratio"),
        ("recipient_verified", "Recipient verification reported"),
        ("recipient_used_before", "Recipient used before"),
    ]:
        if key in features:
            observations.append(
                {
                    "label": label,
                    "value": features[key],
                    "observedAt": assessment.created_at.isoformat(),
                    "source": "Stored assessment feature snapshot",
                    "riskDelta": None,
                }
            )
    history = list(
        db.scalars(
            select(Transaction)
            .where(
                *transaction_scope(db, current.merchant_id),
                Transaction.customer_id == transaction.customer_id,
                Transaction.occurred_at < transaction.occurred_at,
            )
            .order_by(desc(Transaction.occurred_at))
            .limit(500)
        )
    )
    amounts = [float(item.amount) for item in history]
    baseline = {
        "sampleSize": len(history),
        "averageAmount": sum(amounts) / len(amounts) if amounts else None,
        "amountMin": min(amounts) if amounts else None,
        "amountMax": max(amounts) if amounts else None,
        "locations": dict(Counter(item.location for item in history if item.location)),
        "devices": len({item.device_id for item in history if item.device_id}),
        "recipients": len({item.recipient_id for item in history if item.recipient_id}),
        "source": "Prior-only active-dataset records (up to 500); excludes this and future transactions",
    }
    feedback = [
        json.loads(event.detail) for event in events if event.event_type == "REVIEW_FEEDBACK_RECORDED"
    ]
    return {
        "transactionId": transaction_id,
        "score": assessment.score,
        "level": assessment.risk_level,
        "modelVersion": assessment.engine_version,
        "snapshotStatus": "AVAILABLE" if envelope else "LEGACY_UNAVAILABLE",
        "snapshot": envelope,
        "observations": observations,
        "behavioralFingerprint": baseline,
        "events": [
            {
                "timestamp": transaction.created_at.isoformat(),
                "event": "Transaction received",
                "detail": f"Submitted event time: {transaction.occurred_at.isoformat()}",
            },
            *[
                {
                    "timestamp": event.created_at.isoformat(),
                    "event": event.event_type,
                    "detail": "Structured reviewer feedback recorded"
                    if event.event_type == "REVIEW_FEEDBACK_RECORDED"
                    else event.detail,
                }
                for event in events
            ],
        ],
        "humanReview": {
            "status": case.status,
            "decision": case.human_decision,
            "note": case.reviewer_note,
            "reviewerId": case.assigned_user_id,
        }
        if case
        else None,
        "feedback": feedback[-1] if feedback else None,
        "limitations": "This reconstructs stored evidence, not historical binary execution. "
        "No synthetic login/OTP timestamps or additive risk deltas. The local digest detects "
        "inconsistent content, not privileged database tampering; "
        "external append-only/WORM storage is required for immutable retention.",
    }


@router.get("/health")
def health(current: Observer, db: Database) -> dict:
    rows = scoped_assessments(db, current.merchant_id)
    manifest = load_models(current.merchant_id).manifest
    samples = rows[-500:]
    midpoint = len(samples) // 2
    reference, recent = samples[:midpoint], samples[midpoint:]

    def values(items: list[RiskAssessment], key: str) -> list:
        if key == "amount":
            return [float(item.transaction.amount) for item in items]
        if key == "location":
            return [item.transaction.location or "NOT_COLLECTED" for item in items]
        return [
            json.loads(item.feature_snapshot or "{}")[key]
            for item in items
            if key in json.loads(item.feature_snapshot or "{}")
        ]

    drift = {
        key: distribution_shift(
            values(reference, key), values(recent, key), key in {"new_device", "location"}
        )
        for key in ["amount", "transactions_5m", "new_device", "location"]
    }
    latencies = [float(item.inference_latency_ms) for item in rows if item.inference_latency_ms is not None]
    active = get_active_dataset(db, current.merchant_id)
    feedback_events = list(
        db.scalars(
            select(AuditEvent).where(
                AuditEvent.merchant_id == current.merchant_id,
                AuditEvent.dataset_id == active.id,
                AuditEvent.event_type == "MODEL_FEEDBACK_MONITORING",
            )
        )
    )
    maturity_days = get_settings().label_maturity_days
    supplied_labeled = [
        item
        for item in rows
        if item.transaction.fraud_label is not None and item.fraud_probability is not None
    ]
    labeled = [
        item
        for item in supplied_labeled
        if is_mature_label(
            item.transaction.occurred_at,
            item.transaction.fraud_label_observed_at,
            maturity_days=maturity_days,
        )
    ]
    reliability = reliability_table(
        [(float(item.fraud_probability), bool(item.transaction.fraud_label)) for item in labeled]
    )
    slice_groups: dict[str, list[tuple[int, bool]]] = defaultdict(list)
    for item in labeled:
        amount = float(item.transaction.amount)
        amount_band = (
            "amount:<10k" if amount < 10_000 else "amount:10k-100k" if amount < 100_000 else "amount:>=100k"
        )
        payment = f"payment:{item.transaction.payment_method or 'NOT_COLLECTED'}"
        tenure = (
            "tenure:<30d"
            if item.transaction.account_age_days < 30
            else "tenure:30-365d"
            if item.transaction.account_age_days < 365
            else "tenure:>=365d"
        )
        for group in (amount_band, payment, tenure):
            slice_groups[group].append((item.score, bool(item.transaction.fraud_label)))
    return {
        "modelVersion": manifest["fusion"]["version"],
        "metrics": manifest["fusion"].get("metrics", {}),
        "operatingPolicy": {
            "mediumProbabilityThreshold": manifest["fusion"].get("medium_threshold"),
            "highProbabilityThreshold": manifest["fusion"].get("high_threshold"),
            "selection": manifest["fusion"].get("threshold_selection", {}),
            "businessCostAnalysis": manifest["fusion"].get("business_cost_analysis"),
            "source": "ACTIVE_ARTIFACT_MANIFEST",
            "policyChanged": False,
        },
        "dataset": manifest["dataset"],
        "trainedAt": manifest.get("created_at"),
        "lastValidatedAt": manifest.get("validated_at"),
        "lastValidatedStatus": "NOT_RECORDED" if not manifest.get("validated_at") else "RECORDED",
        "drift": drift,
        "referenceSamples": len(reference),
        "recentSamples": len(recent),
        "referenceWindow": [
            reference[0].transaction.occurred_at.isoformat(),
            reference[-1].transaction.occurred_at.isoformat(),
        ]
        if reference
        else None,
        "recentWindow": [
            recent[0].transaction.occurred_at.isoformat(),
            recent[-1].transaction.occurred_at.isoformat(),
        ]
        if recent
        else None,
        "driftMethod": "Older half versus newer half of up to 500 active-dataset events; "
        "minimum 30 per window. PSI for numeric features, total-variation distance for categories. "
        "0.10/0.25 are heuristic warning thresholds, not fraud labels.",
        "reviewFeedbackEvents": len(feedback_events),
        "reviewDisagreements": sum(
            json.loads(item.detail).get("disagreesWithHighRisk", False) for item in feedback_events
        ),
        "measuredRequests": len(latencies),
        "averageInferenceMs": sum(latencies) / len(latencies) if latencies else None,
        "p95InferenceMs": sorted(latencies)[min(len(latencies) - 1, int(0.95 * len(latencies)))]
        if latencies
        else None,
        "reliability": reliability,
        "slices": slice_report(slice_groups),
        "sliceMethod": (
            "Active-dataset supplied labels at score threshold 71; metrics are withheld below 10 rows."
        ),
        "labelMaturity": {
            "windowDays": maturity_days,
            "suppliedLabeledRows": len(supplied_labeled),
            "matureLabeledRows": len(labeled),
            "immatureLabeledRows": len(supplied_labeled) - len(labeled),
            "status": "ENFORCED_IN_TRAINING_AND_EVALUATION",
            "limitation": (
                "Merchant-supplied labels retain T2 provenance; maturity prevents temporal leakage "
                "but does not independently verify the outcome."
            ),
        },
        "selectionBiasControl": {
            "status": "NOT_APPLICABLE_ADVISORY_ONLY",
            "reason": (
                "RazorShield does not autonomously block financial actions; humans retain final authority."
            ),
        },
        "calibrationDisclaimer": (
            "Active-dataset supplied labels are not the locked temporal test "
            "or a dedicated calibration split."
        ),
    }


@router.get("/historical-replay")
def historical_replay(current: Investigator, db: Database) -> dict:
    """Chronologically rescore frozen enriched inputs with the currently loaded artifacts."""

    assessments = scoped_assessments(db, current.merchant_id)[-500:]
    replayed: list[dict] = []
    invalid_snapshots = 0
    unavailable = 0
    daily: dict[str, dict[str, int]] = defaultdict(lambda: {"events": 0, "reviews": 0, "fraudLabels": 0})
    for assessment in assessments:
        try:
            envelope = snapshot(db, current.merchant_id, assessment)
        except HTTPException:
            invalid_snapshots += 1
            continue
        if envelope is None:
            unavailable += 1
            continue
        body = envelope["body"]
        try:
            payload = RiskAssessmentRequest.model_validate(body["input"])
            result = assess_with_models(payload, RuleThresholds(**body["rules"]))
        except (KeyError, TypeError, ValueError):
            invalid_snapshots += 1
            continue
        maturity_days = get_settings().label_maturity_days
        label = (
            assessment.transaction.fraud_label
            if assessment.transaction.fraud_label is not None
            and is_mature_label(
                assessment.transaction.occurred_at,
                assessment.transaction.fraud_label_observed_at,
                maturity_days=maturity_days,
            )
            else None
        )
        day = assessment.transaction.occurred_at.date().isoformat()
        daily[day]["events"] += 1
        daily[day]["reviews"] += int(result.score >= 71)
        daily[day]["fraudLabels"] += int(bool(label)) if label is not None else 0
        replayed.append(
            {
                "transactionId": assessment.transaction.external_id,
                "occurredAt": assessment.transaction.occurred_at.isoformat(),
                "storedScore": assessment.score,
                "replayedScore": result.score,
                "delta": result.score - assessment.score,
                "storedVersion": assessment.engine_version,
                "currentVersion": result.versions,
                "label": label,
            }
        )
    labeled_rows = [
        (item["replayedScore"], bool(item["label"])) for item in replayed if item["label"] is not None
    ]
    stored_labeled_rows = [
        (item["storedScore"], bool(item["label"])) for item in replayed if item["label"] is not None
    ]
    distinct_comparison = any(item["storedVersion"] != item["currentVersion"] for item in replayed)
    champion_challenger = {
        "status": (
            "VERSION_COMPARISON_AVAILABLE"
            if replayed and distinct_comparison
            else "NO_DISTINCT_CHALLENGER"
            if replayed
            else "INSUFFICIENT_SNAPSHOTS"
        ),
        "champion": "Stored decision artifact per event",
        "challenger": "Currently loaded artifact",
        "sameFrozenInputs": True,
        "comparableRows": len(replayed),
        "labeledRows": len(labeled_rows),
        "decisionDisagreementsAt71": sum(
            (item["storedScore"] >= 71) != (item["replayedScore"] >= 71) for item in replayed
        ),
        "meanAbsoluteScoreDelta": (
            sum(abs(item["delta"]) for item in replayed) / len(replayed) if replayed else None
        ),
        "championMetricsAt71": (confusion(stored_labeled_rows, 71, 0, 0, 0) if stored_labeled_rows else None),
        "challengerMetricsAt71": confusion(labeled_rows, 71, 0, 0, 0) if labeled_rows else None,
        "promotionDecision": "NOT_EVALUATED_AUTOMATICALLY",
        "limitation": (
            "A distinct challenger exists only when stored and current artifact versions differ. "
            "Supplied labels are diagnostic and cannot authorize automatic promotion."
        ),
    }
    return {
        "status": "AVAILABLE" if replayed else "INSUFFICIENT_SNAPSHOTS",
        "mode": "TEMPORAL_REPLAY_WITH_OFFLINE_SHADOW_COMPARISON",
        "shadowStatus": champion_challenger["status"],
        "scope": "Up to 500 active-dataset events in event-time order",
        "eligible": len(replayed),
        "legacyUnavailable": unavailable,
        "invalidSnapshots": invalid_snapshots,
        "modelVersionMatches": sum(item["storedVersion"] == item["currentVersion"] for item in replayed),
        "scoreChanges": sum(item["delta"] != 0 for item in replayed),
        "metricsAt71": confusion(labeled_rows, 71, 0, 0, 0) if labeled_rows else None,
        "championChallenger": champion_challenger,
        "dailyQueue": [{"date": day, **values} for day, values in sorted(daily.items())],
        "rows": replayed,
        "persisted": False,
        "financialActionExecuted": False,
        "limitations": (
            "This is a current-artifact replay over frozen enriched inputs, not historical "
            "binary execution. Legacy rows without snapshots are excluded. Supplied labels "
            "are not independently verified outcomes. A live online shadow remains disabled "
            "until a distinct schema-compatible challenger is registered."
        ),
    }


class ImpactInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    threshold: int = Field(default=71, ge=0, le=101)
    review_capacity: float = Field(default=0.05, gt=0, le=1)
    false_positive_cost: float = Field(default=100, ge=0, le=1e8)
    missed_fraud_cost: float = Field(default=5000, ge=0, le=1e8)
    review_cost: float = Field(default=50, ge=0, le=1e8)
    daily_transactions: int = Field(default=100000, ge=1, le=10000000)
    fraud_rate: float = Field(default=0.012, gt=0, lt=1)


@router.post("/impact")
def impact(payload: ImpactInput, current: Observer, db: Database) -> dict:
    assessments = scoped_assessments(db, current.merchant_id)
    maturity_days = get_settings().label_maturity_days
    rows = [
        (item.score, bool(item.transaction.fraud_label))
        for item in assessments
        if item.transaction.fraud_label is not None
        and is_mature_label(
            item.transaction.occurred_at,
            item.transaction.fraud_label_observed_at,
            maturity_days=maturity_days,
        )
    ]
    supplied_labels = sum(item.transaction.fraud_label is not None for item in assessments)
    cases = list(
        db.scalars(select(RiskCase).join(Transaction).where(*transaction_scope(db, current.merchant_id)))
    )
    selected = confusion(
        rows, payload.threshold, payload.false_positive_cost, payload.missed_fraud_cost, payload.review_cost
    )
    options = [
        confusion(
            rows, threshold, payload.false_positive_cost, payload.missed_fraud_cost, payload.review_cost
        )
        for threshold in range(102)
    ]
    eligible = [
        point
        for point in options
        if point["reviewRate"] is not None and point["reviewRate"] <= payload.review_capacity
    ]
    best = min(eligible, key=lambda point: (point["cost"], -point["threshold"])) if eligible else None
    projection = None
    if selected["recall"] is not None and selected["fpr"] is not None:
        n, prevalence = payload.daily_transactions, payload.fraud_rate
        positives = n * prevalence * selected["recall"]
        false_positives = n * (1 - prevalence) * selected["fpr"]
        reviews = positives + false_positives
        without = n * prevalence * payload.missed_fraud_cost
        missed = n * prevalence * (1 - selected["recall"]) * payload.missed_fraud_cost
        with_system = missed + false_positives * payload.false_positive_cost + reviews * payload.review_cost
        projection = {
            "withoutSystem": without,
            "withSystem": with_system,
            "netEstimatedSavings": without - with_system,
            "missedFraudCost": missed,
            "falsePositiveCost": false_positives * payload.false_positive_cost,
            "reviewCost": reviews * payload.review_cost,
            "reviews": reviews,
            "reviewRate": reviews / n,
            "withinCapacity": reviews / n <= payload.review_capacity,
        }
    now = datetime.now(UTC)
    pending_cases = [item for item in cases if item.status != "RESOLVED"]

    def age_hours(case: RiskCase) -> float:
        created = case.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        return max((now - created).total_seconds() / 3600, 0)

    ages = [age_hours(item) for item in pending_cases]
    daily_capacity = max(payload.daily_transactions * payload.review_capacity, 1)
    return {
        "scope": "Active dataset, not necessarily today",
        "transactions": len(assessments),
        "highRisk": sum(item.score >= 71 for item in assessments),
        "mediumRisk": sum(31 <= item.score < 71 for item in assessments),
        "pendingReviews": sum(item.status != "RESOLVED" for item in cases),
        "labeledRows": len(rows),
        "immatureLabeledRows": supplied_labels - len(rows),
        "unlabeledRows": len(assessments) - supplied_labels,
        "selected": selected,
        "recommended": best,
        "projection": projection,
        "queue": {
            "pending": len(pending_cases),
            "unassigned": sum(item.assigned_user_id is None for item in pending_cases),
            "olderThan24Hours": sum(age > 24 for age in ages),
            "oldestAgeHours": max(ages) if ages else 0,
            "medianAgeHours": sorted(ages)[len(ages) // 2] if ages else 0,
            "assumedDailyCapacity": daily_capacity,
            "backlogDays": len(pending_cases) / daily_capacity,
            "capacityUtilization": len(pending_cases) / daily_capacity,
            "slaHours": 24,
        },
        "assumptions": payload.model_dump(),
        "labelMaturityDays": maturity_days,
        "financialActionExecuted": False,
        "disclaimer": "Exploratory in-sample threshold analysis of supplied dataset labels, "
        "not held-out evaluation or confirmed prevented loss. "
        "Unlabeled rows are excluded from confusion metrics. "
        "Daily projection assumes unchanged TPR/FPR at the chosen fraud rate "
        "and successful prevention of reviewed positives; it is not a forecast. No policy is changed.",
    }


@router.get("/patterns")
def patterns(current: Investigator, db: Database) -> dict:
    rows = scoped_assessments(db, current.merchant_id)
    anchor = max((row.transaction.occurred_at for row in rows), default=None)
    groups = defaultdict(list)
    for row in rows:
        if (
            row.transaction.recipient_id
            and anchor
            and row.transaction.occurred_at >= anchor - timedelta(hours=72)
        ):
            groups[row.transaction.recipient_id].append(row)
    result = []
    for recipient, items in groups.items():
        customers = sorted({item.transaction.customer_id for item in items})
        high = sum(item.score >= 71 for item in items)
        if len(customers) >= 2 and high:
            result.append(
                {
                    "recipient": recipient,
                    "customers": customers,
                    "transactions": len(items),
                    "highRisk": high,
                    "totalValue": sum(float(item.transaction.amount) for item in items),
                    "firstSeen": min(item.transaction.occurred_at for item in items).isoformat(),
                    "lastSeen": max(item.transaction.occurred_at for item in items).isoformat(),
                    "transactionIds": [item.transaction.external_id for item in items],
                }
            )
    return {
        "patterns": sorted(result, key=lambda item: -item["highRisk"]),
        "windowHours": 72,
        "anchor": anchor.isoformat() if anchor else None,
        "disclaimer": "Shared-recipient patterns from observed edges only; not proof of coordinated fraud. "
        "No invented IP or intermediary-account links.",
    }


@router.post("/stress-test")
def stress_test(
    current: Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))], db: Database
) -> dict:
    presets = scenario_inputs(current.merchant_id)
    rules = current_rules(db, current.merchant_id)
    normal, suspicious, education = presets.values()
    cases = [
        ("Normal payment", normal, "LOW"),
        ("Suspicious transfer", suspicious, "HIGH"),
        ("Education context", education, "NOT_HIGH"),
        ("New device only", normal.model_copy(update={"is_new_device": True}), "NOT_HIGH"),
        ("Location only", normal.model_copy(update={"is_new_location": True}), "NOT_HIGH"),
        (
            "Extreme OOD",
            suspicious.model_copy(update={"amount": 999999999, "transactions_last_5_minutes": 10000}),
            "HIGH",
        ),
    ]
    outcomes = []
    for name, payload, expected in cases:
        result = assess_with_models(payload, rules)
        passed = result.level != "HIGH" if expected == "NOT_HIGH" else result.level == expected
        outcomes.append(
            {
                "name": name,
                "score": result.score,
                "level": result.level,
                "expected": expected,
                "passed": passed,
                "kind": "PROPERTY_CHECK",
            }
        )
    young = assess_with_models(normal.model_copy(update={"customer_age": 21}), rules)
    older = assess_with_models(normal.model_copy(update={"customer_age": 65}), rules)
    outcomes.append(
        {
            "name": "Age neutrality",
            "score": young.score,
            "level": young.level,
            "expected": "Identical score at ages 21 and 65",
            "passed": young.score == older.score,
            "kind": "INVARIANCE",
        }
    )
    repeated = assess_with_models(suspicious, rules)
    outcomes.append(
        {
            "name": "Deterministic replay",
            "score": repeated.score,
            "level": repeated.level,
            "expected": "Identical repeated prediction",
            "passed": repeated == assess_with_models(suspicious, rules),
            "kind": "INVARIANCE",
        }
    )
    return {
        "scenarios": outcomes,
        "passed": sum(item["passed"] for item in outcomes),
        "total": len(outcomes),
        "persisted": False,
        "disclaimer": "Eight hand-crafted property checks, not detection-rate or held-out accuracy evidence.",
    }
