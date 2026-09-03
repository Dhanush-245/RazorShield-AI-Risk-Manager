import json
import uuid
from collections import Counter
from datetime import UTC, datetime
from time import perf_counter
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.api.dependencies import AuthContext, require_roles
from app.database.session import get_db
from app.models.audit import AuditEvent
from app.models.auth import Merchant, UserRole
from app.models.cases import RiskCase
from app.models.risk import RiskAssessment, RiskSignal, RuleConfiguration, Transaction
from app.schemas.risk import (
    BatchRiskAssessmentRequest,
    BatchRiskAssessmentResponse,
    IEEECISPredictionRequest,
    IEEECISPredictionResponse,
    RiskAssessmentRequest,
    RiskAssessmentResponse,
    RiskSignalResponse,
    RuleConfigurationPayload,
    RuleConfigurationResponse,
)
from app.services.dataset_adapter import adapt_dataset_rows
from app.services.dataset_scope import get_active_dataset
from app.services.feature_provenance import resolve_risk_context
from app.services.ieee_cis_risk import predict_ieee_transaction
from app.services.label_maturity import observed_at
from app.services.model_governance import ieee_cis_promotion_evidence
from app.services.model_risk import (
    TRAINING_FEATURE_NAMES,
    RuleThresholds,
    assess_with_models,
    feature_vector,
)
from app.services.realtime_training import train_active_dataset_once
from app.services.risk_workbench import decision_snapshot

router = APIRouter(prefix="/risk", tags=["risk"])


def get_rule_configuration(db: Session, merchant_id: str) -> RuleConfiguration:
    configuration = (
        db.query(RuleConfiguration).filter(RuleConfiguration.merchant_id == merchant_id).one_or_none()
    )
    if configuration is None:
        values = {
            "id": str(uuid.uuid4()),
            "merchant_id": merchant_id,
            "version": 1,
            "high_amount_ratio": 3.0,
            "velocity_5m_threshold": 5,
            "failed_attempts_threshold": 3,
            "shared_device_accounts_threshold": 4,
            "new_device_amount_ratio": 2.0,
            "geographic_amount_ratio": 2.0,
        }
        dialect = db.get_bind().dialect.name
        if dialect == "postgresql":
            statement = postgresql_insert(RuleConfiguration).values(**values)
            db.execute(statement.on_conflict_do_nothing(index_elements=["merchant_id"]))
        elif dialect == "sqlite":
            statement = sqlite_insert(RuleConfiguration).values(**values)
            db.execute(statement.on_conflict_do_nothing(index_elements=["merchant_id"]))
        else:
            raise RuntimeError(f"Unsupported database dialect for rule initialization: {dialect}")
        configuration = db.query(RuleConfiguration).filter(RuleConfiguration.merchant_id == merchant_id).one()
    return configuration


def rule_thresholds(configuration: RuleConfiguration) -> RuleThresholds:
    return RuleThresholds(
        version=configuration.version,
        high_amount_ratio=configuration.high_amount_ratio,
        velocity_5m_threshold=configuration.velocity_5m_threshold,
        failed_attempts_threshold=configuration.failed_attempts_threshold,
        shared_device_accounts_threshold=configuration.shared_device_accounts_threshold,
        new_device_amount_ratio=configuration.new_device_amount_ratio,
        geographic_amount_ratio=configuration.geographic_amount_ratio,
    )


def configuration_response(configuration: RuleConfiguration) -> RuleConfigurationResponse:
    return RuleConfigurationResponse(
        version=configuration.version,
        high_amount_ratio=configuration.high_amount_ratio,
        velocity_5m_threshold=configuration.velocity_5m_threshold,
        failed_attempts_threshold=configuration.failed_attempts_threshold,
        shared_device_accounts_threshold=configuration.shared_device_accounts_threshold,
        new_device_amount_ratio=configuration.new_device_amount_ratio,
        geographic_amount_ratio=configuration.geographic_amount_ratio,
        updated_at=configuration.updated_at,
    )


def behavior_context(
    payload: RiskAssessmentRequest,
    db: Session,
    merchant_id: str,
    behavior_score: float,
) -> dict[str, float | int | str | bool | None]:
    history = (
        db.query(Transaction)
        .filter(
            Transaction.merchant_id == merchant_id,
            Transaction.customer_id == payload.customer_id,
        )
        .order_by(Transaction.occurred_at.desc())
        .limit(100)
        .all()
    )
    amounts = [float(item.amount) for item in history]
    devices = Counter(item.device_id for item in history if item.device_id)
    locations = Counter(item.location for item in history if item.location)
    hours = sorted(item.occurred_at.hour for item in history)
    provided_average = float(payload.customer_average_amount or payload.amount)
    baseline_average = sum(amounts) / len(amounts) if amounts else provided_average
    amount_ratio = float(payload.amount) / max(baseline_average, 0.01)
    observed_new_device = (
        payload.device_id not in devices if history and payload.device_id else bool(payload.is_new_device)
    )
    observed_new_location = (
        payload.location not in locations if history and payload.location else bool(payload.is_new_location)
    )
    deviation_level = "HIGH" if behavior_score >= 0.7 else "MEDIUM" if behavior_score >= 0.35 else "LOW"
    return {
        "history_sample_size": len(history),
        "baseline_source": "MERCHANT_HISTORY" if history else "REQUEST_BASELINE",
        "model_average_amount": provided_average,
        "average_amount": round(baseline_average, 2),
        "normal_amount_min": round(min(amounts), 2) if amounts else None,
        "normal_amount_max": round(max(amounts), 2) if amounts else None,
        "typical_device": devices.most_common(1)[0][0] if devices else None,
        "typical_location": locations.most_common(1)[0][0] if locations else None,
        "typical_hour_start": hours[0] if hours else None,
        "typical_hour_end": hours[-1] if hours else None,
        "current_amount": float(payload.amount),
        "current_device": payload.device_id,
        "current_location": payload.location,
        "current_hour": payload.timestamp.hour,
        "submitted_is_new_device": bool(payload.is_new_device),
        "submitted_is_new_location": bool(payload.is_new_location),
        "is_new_device": observed_new_device,
        "is_new_location": observed_new_location,
        "model_amount_deviation_ratio": round(float(payload.amount) / max(provided_average, 0.01), 2),
        "amount_deviation_ratio": round(amount_ratio, 2),
        "deviation_level": deviation_level,
    }


def persist_assessment(
    payload: RiskAssessmentRequest,
    request: Request,
    db: Session,
    current: AuthContext,
    dataset_id: str | None,
) -> RiskAssessmentResponse:
    if payload.merchant_id != current.merchant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Merchant access denied")
    dataset_condition = (
        Transaction.dataset_id == dataset_id if dataset_id is not None else Transaction.dataset_id.is_(None)
    )
    existing = (
        db.query(Transaction.id)
        .filter(
            Transaction.merchant_id == current.merchant_id,
            Transaction.external_id == payload.transaction_id,
            dataset_condition,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Transaction ID already exists")
    submitted_payload = payload
    resolved = resolve_risk_context(payload, db, current.merchant_id, dataset_id)
    payload = resolved.payload
    started = perf_counter()
    configuration = get_rule_configuration(db, current.merchant_id)
    result = assess_with_models(payload, rule_thresholds(configuration))
    stored_features = {
        name: float(value)
        for name, value in zip(TRAINING_FEATURE_NAMES, feature_vector(payload)[0], strict=True)
    }
    customer_behavior = behavior_context(payload, db, current.merchant_id, result.behavior_score)
    inference_latency_ms = round((perf_counter() - started) * 1000, 3)
    transaction = Transaction(
        external_id=payload.transaction_id,
        merchant_id=payload.merchant_id,
        dataset_id=dataset_id,
        customer_id=payload.customer_id,
        customer_name=submitted_payload.customer_name,
        customer_email=submitted_payload.customer_email,
        customer_phone=submitted_payload.customer_phone,
        customer_verification_status=submitted_payload.customer_verification_status,
        sender_account_reference=submitted_payload.sender_account_reference,
        sender_bank_name=submitted_payload.sender_bank_name,
        sender_bank_ifsc=submitted_payload.sender_bank_ifsc,
        amount=payload.amount,
        currency=payload.currency,
        device_id=payload.device_id,
        location=payload.location,
        payment_method=payload.payment_method,
        customer_age=submitted_payload.customer_age,
        account_age_days=payload.account_age_days,
        recipient_id=payload.recipient_id,
        recipient_name=submitted_payload.recipient_name,
        recipient_account_reference=submitted_payload.recipient_account_reference,
        recipient_bank_name=submitted_payload.recipient_bank_name,
        recipient_bank_ifsc=submitted_payload.recipient_bank_ifsc,
        recipient_email=submitted_payload.recipient_email,
        recipient_phone=submitted_payload.recipient_phone,
        recipient_type=submitted_payload.recipient_type,
        recipient_category=submitted_payload.recipient_category,
        recipient_verified=submitted_payload.recipient_verified,
        transaction_intent=submitted_payload.transaction_intent,
        fraud_label=submitted_payload.fraud_label,
        return_label=submitted_payload.return_label,
        fraud_label_observed_at=observed_at(
            submitted_payload.fraud_label, submitted_payload.fraud_label_observed_at
        ),
        return_label_observed_at=observed_at(
            submitted_payload.return_label, submitted_payload.return_label_observed_at
        ),
        label_provenance=("T2_MERCHANT_ASSERTED_DATASET" if dataset_id else "T2_MERCHANT_ASSERTED_API")
        if submitted_payload.fraud_label is not None or submitted_payload.return_label is not None
        else None,
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
        contextual_adjustment=result.contextual_adjustment,
        return_risk_score=result.return_risk_score,
        model_provenance=result.provenance,
        inference_latency_ms=inference_latency_ms,
        feature_snapshot=json.dumps(stored_features, separators=(",", ":")),
        signals=[
            RiskSignal(code=item.code, score=item.score, evidence=item.evidence) for item in result.signals
        ],
    )
    db.add(assessment)
    db.flush()
    db.add(
        AuditEvent(
            merchant_id=payload.merchant_id,
            dataset_id=dataset_id,
            entity_type="risk_assessment",
            entity_id=assessment.id,
            event_type="DECISION_SNAPSHOT_RECORDED",
            actor_type="SYSTEM",
            detail=decision_snapshot(
                payload,
                rule_thresholds(configuration),
                result,
                feature_provenance=resolved.provenance,
                graph_context=resolved.graph,
            ),
            request_id=getattr(request.state, "request_id", None),
        )
    )
    case_reference: str | None = None
    if result.score >= 31:
        case_reference = (
            f"CASE-{payload.transaction_id}-{dataset_id[:8]}"
            if dataset_id is not None
            else f"CASE-{payload.transaction_id}"
        )
        db.add(
            RiskCase(
                case_reference=case_reference,
                merchant_id=current.merchant_id,
                transaction_id=transaction.id,
                case_type="FRAUD_REVIEW",
                recommendation=result.recommended_action,
            )
        )
    db.add(
        AuditEvent(
            merchant_id=payload.merchant_id,
            dataset_id=dataset_id,
            entity_type="risk_assessment",
            entity_id=assessment.id,
            event_type="TRAINED_RISK_ASSESSED",
            actor_type="SYSTEM",
            detail=f"Versioned risk fusion produced {result.level} score {result.score}.",
            request_id=getattr(request.state, "request_id", None),
        )
    )
    if case_reference:
        recorded_at = datetime.now(UTC)
        db.add_all(
            [
                AuditEvent(
                    merchant_id=payload.merchant_id,
                    dataset_id=dataset_id,
                    entity_type="review_case",
                    entity_id=case_reference,
                    event_type="MODEL_ENSEMBLE_EXECUTED",
                    actor_type="MODEL",
                    detail=f"Executed {result.versions}.",
                    created_at=recorded_at,
                ),
                AuditEvent(
                    merchant_id=payload.merchant_id,
                    dataset_id=dataset_id,
                    entity_type="review_case",
                    entity_id=case_reference,
                    event_type="RISK_SCORE_GENERATED",
                    actor_type="MODEL",
                    detail=f"Generated {result.level} risk score {result.score}/100.",
                    created_at=recorded_at,
                ),
                AuditEvent(
                    merchant_id=payload.merchant_id,
                    dataset_id=dataset_id,
                    entity_type="review_case",
                    entity_id=case_reference,
                    event_type="INVESTIGATION_CREATED",
                    actor_type="SYSTEM",
                    detail=f"Created investigation with recommendation {result.recommended_action}.",
                    created_at=recorded_at,
                ),
            ]
        )
    return RiskAssessmentResponse(
        assessment_id=assessment.id,
        transaction_id=payload.transaction_id,
        risk_score=result.score,
        risk_level=result.level,
        recommended_action=result.recommended_action,
        engine_type=assessment.engine_type,
        engine_version=assessment.engine_version,
        model_status="TRAINED_VERSIONED_MODELS",
        disclaimer=(
            "Model version was trained on merchant-labeled real-time data and evaluated on its "
            "held-out split. Performance may change as live behavior changes."
            if result.provenance == "MERCHANT_LABELED_REAL_TIME"
            else (
                "Models are trained on the bundled synthetic demonstration dataset. "
                "Metrics are not claims of real-world performance."
            )
        ),
        signals=[
            RiskSignalResponse(code=item.code, score=item.score, evidence=item.evidence)
            for item in result.signals
        ],
        fraud_probability=result.fraud_probability,
        anomaly_score=result.anomaly_score,
        behavior_score=result.behavior_score,
        velocity_score=result.velocity_score,
        graph_score=result.graph_score,
        rule_score=result.rule_score,
        contextual_adjustment=result.contextual_adjustment,
        return_risk_score=result.return_risk_score,
        model_provenance=result.provenance,
        inference_latency_ms=inference_latency_ms,
        feature_snapshot={
            "amount": float(payload.amount),
            "transaction_hour": payload.timestamp.hour,
            "transactions_last_5_minutes": payload.transactions_last_5_minutes,
            "transactions_last_15_minutes": payload.transactions_last_15_minutes,
            "transactions_last_hour": payload.transactions_last_hour,
            "failed_attempts_last_10_minutes": payload.failed_attempts_last_10_minutes,
            "amount_deviation_ratio": round(
                float(payload.amount) / max(float(payload.customer_average_amount or payload.amount), 0.01),
                2,
            ),
            "is_new_device": bool(payload.is_new_device),
            "is_new_location": bool(payload.is_new_location),
            "shared_device_accounts": payload.shared_device_accounts,
            "historical_return_rate": payload.historical_return_rate,
            "customer_age": payload.customer_age,
            "account_age_days": payload.account_age_days,
            "historical_fraud_count": payload.historical_fraud_count,
            "recipient_id": payload.recipient_id,
            "recipient_type": payload.recipient_type,
            "recipient_category": payload.recipient_category,
            "recipient_verified": payload.recipient_verified,
            "recipient_used_before": payload.recipient_used_before,
            "recipient_risk_score": payload.recipient_risk_score,
            "recipient_transaction_count": payload.recipient_transaction_count,
            "customer_recipient_transactions": payload.customer_recipient_transactions,
            "transactions_to_same_recipient_last_15_minutes": (
                payload.transactions_to_same_recipient_last_15_minutes
            ),
            "amount_to_same_recipient_last_hour": float(payload.amount_to_same_recipient_last_hour),
            "unique_customers_to_recipient": payload.unique_customers_to_recipient,
            "unique_devices_to_recipient": payload.unique_devices_to_recipient,
            "transaction_intent": payload.transaction_intent,
        },
        feature_provenance=resolved.provenance,
        graph_context=resolved.graph,
        uncertainty={
            "status": (
                "LIMITED_HISTORY"
                if sum(not item["available"] for item in resolved.provenance.values()) >= 4
                else "STANDARD"
            ),
            "unavailableDerivedFeatures": [
                name for name, item in resolved.provenance.items() if not item["available"]
            ],
            "meaning": "Data sufficiency indicator, not a calibrated confidence interval.",
        },
        behavior_context=customer_behavior,
        rule_results=[
            {
                "code": rule.code,
                "label": rule.label,
                "condition": rule.condition,
                "observed": rule.observed,
                "fired": rule.fired,
                "weight": rule.weight,
                "evidence": rule.evidence,
            }
            for rule in result.rule_results
        ],
        fusion_contributions=[
            {"feature": item.feature, "impact": item.impact, "direction": item.direction}
            for item in result.fusion_contributions
        ],
        model_contributions=[
            {"feature": item.feature, "impact": item.impact, "direction": item.direction}
            for item in result.model_contributions
        ],
        risk_explanation=result.explanation,
    )


@router.get("/rules/config", response_model=RuleConfigurationResponse)
def read_rule_configuration(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))],
) -> RuleConfigurationResponse:
    configuration = get_rule_configuration(db, current.merchant_id)
    db.commit()
    db.refresh(configuration)
    return configuration_response(configuration)


@router.patch("/rules/config", response_model=RuleConfigurationResponse)
def update_rule_configuration(
    payload: RuleConfigurationPayload,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))],
) -> RuleConfigurationResponse:
    configuration = get_rule_configuration(db, current.merchant_id)
    for field, value in payload.model_dump().items():
        setattr(configuration, field, value)
    configuration.version += 1
    db.add(
        AuditEvent(
            merchant_id=current.merchant_id,
            entity_type="rule_configuration",
            entity_id=configuration.id,
            event_type="RULE_CONFIGURATION_UPDATED",
            actor_type="USER",
            detail=f"Rule configuration updated to version {configuration.version}.",
        )
    )
    db.commit()
    db.refresh(configuration)
    return configuration_response(configuration)


@router.post("/assess", response_model=RiskAssessmentResponse, status_code=status.HTTP_201_CREATED)
def assess_risk(
    payload: RiskAssessmentRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
) -> RiskAssessmentResponse:
    active = get_active_dataset(db, current.merchant_id)
    try:
        response = persist_assessment(payload, request, db, current, active.id)
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Risk model is temporarily unavailable; no assessment was stored.",
        ) from exc
    db.commit()
    return response


@router.post("/assess/ieee-cis", response_model=IEEECISPredictionResponse)
def assess_ieee_cis_candidate(
    payload: IEEECISPredictionRequest,
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
) -> IEEECISPredictionResponse:
    """Score a raw IEEE-CIS-compatible row with the isolated real-data candidate.

    This endpoint does not persist or execute an action. The ordinary RazorShield
    transaction contract intentionally remains on its existing model until a
    production feature mapping is validated.
    """
    del current
    try:
        prediction = predict_ieee_transaction(payload.transaction, payload.identity)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    promotion = ieee_cis_promotion_evidence()
    if promotion["servingStatus"] == "APPROVED":
        model_status = "APPROVED_SCHEMA_SPECIFIC"
    elif promotion["eligibleForSchemaSpecificPromotion"]:
        model_status = "CANDIDATE_NOT_PROMOTED"
    else:
        model_status = "CANDIDATE_REJECTED_BY_GOVERNANCE"
    return IEEECISPredictionResponse(**prediction.__dict__, model_status=model_status)


@router.post("/assess/batch", response_model=BatchRiskAssessmentResponse, status_code=status.HTTP_201_CREATED)
def assess_batch(
    payload: BatchRiskAssessmentRequest,
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[
        AuthContext,
        Depends(require_roles(UserRole.ADMIN, UserRole.RISK_ANALYST)),
    ],
) -> BatchRiskAssessmentResponse:
    dataset_id = str(uuid.uuid4())
    activated_at = datetime.now(UTC)
    dataset_name = payload.dataset_name.strip()
    if not dataset_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Dataset name is required"
        )
    try:
        adapted_rows, adaptation = adapt_dataset_rows(payload.transactions, current.merchant_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    responses = [persist_assessment(item, request, db, current, dataset_id) for item in adapted_rows]
    merchant = db.get(Merchant, current.merchant_id)
    if merchant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Merchant not found")
    merchant.active_dataset_id = dataset_id
    merchant.active_dataset_name = dataset_name
    merchant.active_dataset_activated_at = activated_at
    db.add(
        AuditEvent(
            merchant_id=current.merchant_id,
            dataset_id=dataset_id,
            entity_type="dataset",
            entity_id=dataset_id,
            event_type="DATASET_ACTIVATED",
            actor_type="USER",
            detail=f"Activated {dataset_name} with {len(responses)} scored transactions.",
            request_id=getattr(request.state, "request_id", None),
        )
    )
    db.commit()
    return BatchRiskAssessmentResponse(
        processed=len(responses),
        dataset_id=dataset_id,
        dataset_name=dataset_name,
        activated_at=activated_at,
        assessments=responses,
        schema_mapping=dict(sorted(adaptation.mapping.items())),
        transformed_fields=sorted(adaptation.transformed_fields),
        unmapped_columns=sorted(adaptation.unmapped_columns),
        ingestion_warnings=sorted(adaptation.warnings),
    )


@router.post("/train/active-dataset")
def train_active_dataset(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[AuthContext, Depends(require_roles(UserRole.ADMIN))],
) -> dict[str, object]:
    active = get_active_dataset(db, current.merchant_id)
    if active.id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload and activate a labeled dataset before training.",
        )
    result = train_active_dataset_once(db, current.merchant_id, active.id)
    db.add(
        AuditEvent(
            merchant_id=current.merchant_id,
            dataset_id=active.id,
            entity_type="model_training",
            entity_id=str(result["trainingId"]),
            event_type="DATASET_MODEL_TRAINED",
            actor_type="USER",
            detail=(
                f"Trained and activated {result['modelVersion']} from {result['rows']} "
                "merchant-labeled rows with a held-out evaluation split."
            ),
            request_id=getattr(request.state, "request_id", None),
        )
    )
    db.commit()
    return result
