"""Resolve scoring features across the API trust boundary.

Transaction facts are accepted from the request, but risk-reducing historical
claims are not.  Historical/graph features are recomputed from prior-only,
merchant-scoped records.  Caller assertions may only make an effective feature
more conservative when the feature has a monotonic risk interpretation.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.risk import Transaction
from app.schemas.risk import RiskAssessmentRequest


@dataclass(frozen=True)
class ResolvedRiskContext:
    payload: RiskAssessmentRequest
    provenance: dict[str, dict[str, Any]]
    graph: dict[str, Any]


def _comparable(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


def resolve_risk_context(
    payload: RiskAssessmentRequest,
    db: Session,
    merchant_id: str,
    dataset_id: str | None,
) -> ResolvedRiskContext:
    """Return effective scoring inputs plus field-level lineage.

    Every history query is strictly earlier than the event timestamp and is
    restricted to the active dataset.  This makes batch ingestion deterministic
    and prevents future records from leaking into a decision.
    """

    occurred_at = _comparable(payload.timestamp)
    dataset_condition = (
        Transaction.dataset_id == dataset_id if dataset_id is not None else Transaction.dataset_id.is_(None)
    )
    prior = (
        db.query(Transaction)
        .filter(
            Transaction.merchant_id == merchant_id,
            Transaction.occurred_at < occurred_at,
            dataset_condition,
        )
        .order_by(Transaction.occurred_at.desc())
        .limit(10_000)
        .all()
    )
    customer_history = [item for item in prior if item.customer_id == payload.customer_id]
    recipient_history = (
        [item for item in prior if item.recipient_id == payload.recipient_id] if payload.recipient_id else []
    )
    customer_recipient_history = [
        item for item in recipient_history if item.customer_id == payload.customer_id
    ]
    device_history = (
        [item for item in prior if item.device_id == payload.device_id] if payload.device_id else []
    )

    updates: dict[str, object] = {}
    lineage: dict[str, dict[str, Any]] = {}

    def record(
        name: str,
        submitted: object,
        derived: object,
        effective: object,
        *,
        tier: str = "T1_PLATFORM_DERIVED",
        rule: str,
        available: bool = True,
    ) -> None:
        def json_value(value: object) -> object:
            if isinstance(value, Decimal):
                return float(value)
            if isinstance(value, datetime):
                return value.isoformat()
            return value

        updates[name] = effective
        lineage[name] = {
            "tier": tier,
            "submitted": json_value(submitted),
            "derived": json_value(derived),
            "effective": json_value(effective),
            "resolution": rule,
            "available": available,
            "historyRows": len(prior),
            "asOf": payload.timestamp.isoformat(),
        }

    amounts = [float(item.amount) for item in customer_history]
    derived_average = sum(amounts) / len(amounts) if amounts else float(payload.amount)
    asserted_average = (
        float(payload.customer_average_amount) if payload.customer_average_amount is not None else None
    )
    # A lower average increases amount deviation; a higher asserted average is
    # never allowed to make the event look safer.
    effective_average = min(derived_average, asserted_average or derived_average)
    record(
        "customer_average_amount",
        asserted_average,
        round(derived_average, 6),
        Decimal(str(effective_average)),
        rule="PLATFORM_BASELINE_WITH_ASSERTED_RAISE_ONLY",
        available=bool(customer_history),
    )

    earliest = min((_comparable(item.occurred_at) for item in customer_history), default=None)
    derived_age = max(0, (occurred_at - earliest).days) if earliest else 0
    effective_age = min(derived_age, payload.account_age_days) if payload.account_age_days else derived_age
    record(
        "account_age_days",
        payload.account_age_days,
        derived_age,
        effective_age,
        rule="PLATFORM_TENURE_WITH_ASSERTED_RAISE_ONLY",
        available=earliest is not None,
    )

    windows = {
        "transactions_last_5_minutes": timedelta(minutes=5),
        "transactions_last_15_minutes": timedelta(minutes=15),
        "transactions_last_hour": timedelta(hours=1),
    }
    for name, window in windows.items():
        derived = 1 + sum(_comparable(item.occurred_at) >= occurred_at - window for item in customer_history)
        submitted = int(getattr(payload, name))
        record(
            name,
            submitted,
            derived,
            max(submitted, derived),
            rule="MAX_PLATFORM_AND_ASSERTED_RAISE_ONLY",
        )

    known_devices = {item.device_id for item in customer_history if item.device_id}
    known_locations = {item.location for item in customer_history if item.location}
    for name, current, known, asserted in (
        ("is_new_device", payload.device_id, known_devices, payload.is_new_device),
        ("is_new_location", payload.location, known_locations, payload.is_new_location),
    ):
        available = current is not None
        derived = current not in known if available else None
        effective = bool(asserted) or bool(derived)
        record(
            name,
            asserted,
            derived,
            effective,
            rule="PLATFORM_OBSERVATION_OR_ASSERTED_RAISE_ONLY",
            available=available,
        )

    shared_customers = {item.customer_id for item in device_history}
    if payload.device_id:
        shared_customers.add(payload.customer_id)
    derived_shared = len(shared_customers)
    record(
        "shared_device_accounts",
        payload.shared_device_accounts,
        derived_shared,
        max(payload.shared_device_accounts, derived_shared),
        rule="MAX_PLATFORM_AND_ASSERTED_RAISE_ONLY",
        available=payload.device_id is not None,
    )

    customer_recipient_count = len(customer_recipient_history)
    # Prior use is protective.  A request cannot manufacture that relationship.
    record(
        "recipient_used_before",
        payload.recipient_used_before,
        customer_recipient_count > 0,
        customer_recipient_count > 0,
        rule="PLATFORM_ONLY_PROTECTIVE_FEATURE",
        available=payload.recipient_id is not None,
    )
    record(
        "customer_recipient_transactions",
        payload.customer_recipient_transactions,
        customer_recipient_count,
        customer_recipient_count,
        rule="PLATFORM_ONLY_PROTECTIVE_FEATURE",
        available=payload.recipient_id is not None,
    )

    recent_recipient = [
        item
        for item in customer_recipient_history
        if _comparable(item.occurred_at) >= occurred_at - timedelta(minutes=15)
    ]
    recipient_hour = [
        item
        for item in customer_recipient_history
        if _comparable(item.occurred_at) >= occurred_at - timedelta(hours=1)
    ]
    recipient_counts = {
        "recipient_transaction_count": len(recipient_history) + (1 if payload.recipient_id else 0),
        "transactions_to_same_recipient_last_15_minutes": len(recent_recipient)
        + (1 if payload.recipient_id else 0),
        "unique_customers_to_recipient": len(
            {item.customer_id for item in recipient_history}
            | ({payload.customer_id} if payload.recipient_id else set())
        ),
        "unique_devices_to_recipient": len(
            {item.device_id for item in recipient_history if item.device_id}
            | ({payload.device_id} if payload.device_id and payload.recipient_id else set())
        ),
    }
    for name, derived in recipient_counts.items():
        submitted = int(getattr(payload, name))
        record(
            name,
            submitted,
            derived,
            max(submitted, derived),
            rule="MAX_PLATFORM_AND_ASSERTED_RAISE_ONLY",
            available=payload.recipient_id is not None,
        )

    derived_amount_hour = sum((item.amount for item in recipient_hour), start=payload.amount)
    record(
        "amount_to_same_recipient_last_hour",
        float(payload.amount_to_same_recipient_last_hour),
        float(derived_amount_hour),
        max(payload.amount_to_same_recipient_last_hour, derived_amount_hour),
        rule="MAX_PLATFORM_AND_ASSERTED_RAISE_ONLY",
        available=payload.recipient_id is not None,
    )

    prior_scores = [
        float(assessment.score) / 100 for item in recipient_history for assessment in item.assessments[-1:]
    ]
    derived_recipient_risk = sum(prior_scores) / len(prior_scores) if prior_scores else 0.5
    record(
        "recipient_risk_score",
        payload.recipient_risk_score,
        round(derived_recipient_risk, 6),
        max(payload.recipient_risk_score, derived_recipient_risk),
        rule="MAX_PLATFORM_AND_ASSERTED_RAISE_ONLY",
        available=bool(prior_scores),
    )

    # Verification is protective in the current feature contract. Until a
    # separately authenticated verification provider exists, the merchant claim
    # is preserved on the transaction record but cannot reduce model risk.
    record(
        "recipient_verified",
        payload.recipient_verified,
        None,
        False,
        tier="T2_MERCHANT_ASSERTED",
        rule="PROTECTIVE_ASSERTION_NOT_ADMITTED_FOR_SCORING",
        available=False,
    )

    for name in (
        "failed_attempts_last_10_minutes",
        "historical_return_rate",
        "historical_fraud_count",
    ):
        value = getattr(payload, name)
        record(
            name,
            value,
            None,
            value,
            tier="T2_MERCHANT_ASSERTED",
            rule="ASSERTED_RAISE_ONLY_SIGNAL_NO_PLATFORM_SOURCE",
            available=False,
        )

    # Age is kept on the party record for human verification but removed from
    # the scoring payload. The model's documented neutral default is used.
    record(
        "customer_age",
        payload.customer_age,
        None,
        None,
        tier="T2_MERCHANT_ASSERTED",
        rule="EXCLUDED_FROM_RISK_DECISION_FAIRNESS_GUARD",
        available=False,
    )

    nodes = {
        *(f"customer:{item.customer_id}" for item in recipient_history + device_history),
        *(f"device:{item.device_id}" for item in recipient_history + device_history if item.device_id),
        *(
            f"recipient:{item.recipient_id}"
            for item in recipient_history + device_history
            if item.recipient_id
        ),
        f"customer:{payload.customer_id}",
    }
    if payload.device_id:
        nodes.add(f"device:{payload.device_id}")
    if payload.recipient_id:
        nodes.add(f"recipient:{payload.recipient_id}")
    edges = {
        (f"customer:{item.customer_id}", f"device:{item.device_id}")
        for item in recipient_history + device_history
        if item.device_id
    } | {
        (f"customer:{item.customer_id}", f"recipient:{item.recipient_id}")
        for item in recipient_history + device_history
        if item.recipient_id
    }
    if payload.device_id:
        edges.add((f"customer:{payload.customer_id}", f"device:{payload.device_id}"))
    if payload.recipient_id:
        edges.add((f"customer:{payload.customer_id}", f"recipient:{payload.recipient_id}"))
    graph = {
        "source": "PRIOR_ONLY_PLATFORM_GRAPH_PLUS_CURRENT_EVENT",
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "cycleRankUpperBound": max(len(edges) - len(nodes) + 1, 0),
        "customers": len({node for node in nodes if node.startswith("customer:")}),
        "devices": len({node for node in nodes if node.startswith("device:")}),
        "recipients": len({node for node in nodes if node.startswith("recipient:")}),
        "limitation": (
            "Connectivity is evidence of shared infrastructure, not proof of coordination or fraud."
        ),
    }
    return ResolvedRiskContext(payload.model_copy(update=updates), lineage, graph)
