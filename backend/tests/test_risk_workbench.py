"""Regression coverage for non-mutating experiments and evidence provenance."""

import json
from contextlib import contextmanager

import pytest
from sqlalchemy import func, select
from test_auth_api import client as client
from test_auth_api import login

from app.core.security import hash_secret
from app.database.session import get_db
from app.main import app
from app.models.audit import AuditEvent
from app.models.auth import Merchant, User, UserRole
from app.models.cases import RiskCase
from app.models.risk import RiskAssessment, Transaction
from app.services.risk_workbench import confusion, distribution_shift, reliability_table, slice_report


@contextmanager
def session():
    yield from app.dependency_overrides[get_db]()


def credentials(client, role="admin"):
    auth = login(client, f"{role}@example.com")
    return {"Authorization": f"Bearer {auth['access_token']}"}, auth["user"]["merchant_id"]


def counts():
    with session() as db:
        return tuple(
            db.scalar(select(func.count()).select_from(model))
            for model in (Transaction, RiskAssessment, RiskCase, AuditEvent)
        )


def assess(client, headers, name="Suspicious transfer", txn="TEST-WORKBENCH", **updates):
    if updates.get("fraud_label") is not None:
        updates.setdefault("timestamp", "2026-01-01T00:00:00Z")
        updates.setdefault("fraud_label_observed_at", "2026-03-01T00:00:00Z")
    presets = client.get("/api/v1/workbench/presets", headers=headers).json()
    payload = {**presets[name], "transaction_id": txn, **updates}
    response = client.post("/api/v1/risk/assess", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return payload, response.json()


def test_simulation_uses_model_without_persisting(client):
    headers, merchant = credentials(client)
    presets = client.get("/api/v1/workbench/presets", headers=headers).json()
    before = counts()
    response = client.post("/api/v1/workbench/simulate", headers=headers, json=presets["Suspicious transfer"])
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["baseline"]["level"] == "HIGH"
    assert body["baseline"]["components"]["Fraud probability"] > 1  # percent, not 0–1
    assert len(body["counterfactuals"]) == 5
    assert all(row["delta"] == row["score"] - body["baseline"]["score"] for row in body["counterfactuals"])
    assert body["persisted"] is False and body["financialActionExecuted"] is False
    assert counts() == before
    assert (
        client.post(
            "/api/v1/workbench/simulate",
            headers=headers,
            json={**presets["Normal payment"], "merchant_id": merchant + "other"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/workbench/simulate", headers=headers, json={**presets["Normal payment"], "amount": -1}
        ).status_code
        == 422
    )


def test_snapshot_replay_counterfactual_privacy_and_integrity(client):
    headers, _ = credentials(client)
    _, result = assess(client, headers, customer_name="Private name", customer_email="private@example.com")
    path = "/api/v1/workbench/transactions/TEST-WORKBENCH"
    response = client.get(path + "/replay", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["snapshotStatus"] == "AVAILABLE"
    assert "Private name" not in json.dumps(body["snapshot"])
    assert "private@example.com" not in json.dumps(body["snapshot"])
    assert body["snapshot"]["body"]["result"]["score"] == result["risk_score"]
    assert body["behavioralFingerprint"]["sampleSize"] == 0
    assert all("riskDelta" not in item or item["riskDelta"] is None for item in body["observations"])
    before = counts()
    compared = client.post(path + "/counterfactuals", headers=headers)
    assert compared.status_code == 200, compared.text
    assert compared.json()["baseline"]["score"] == result["risk_score"]
    assert compared.json()["versionMatches"] is True
    assert counts() == before
    with session() as db:
        event = db.scalar(select(AuditEvent).where(AuditEvent.event_type == "DECISION_SNAPSHOT_RECORDED"))
        changed = json.loads(event.detail)
        changed["body"]["input"]["amount"] = "1"
        event.detail = json.dumps(changed)
        db.commit()
    assert client.get(path + "/replay", headers=headers).status_code == 409
    assert client.post(path + "/counterfactuals", headers=headers).status_code == 409


def test_legacy_and_dataset_scope(client):
    headers, merchant = credentials(client)
    assess(client, headers)
    path = "/api/v1/workbench/transactions/TEST-WORKBENCH"
    with session() as db:
        event = db.scalar(select(AuditEvent).where(AuditEvent.event_type == "DECISION_SNAPSHOT_RECORDED"))
        db.delete(event)
        db.commit()
    assert client.get(path + "/replay", headers=headers).json()["snapshotStatus"] == "LEGACY_UNAVAILABLE"
    assert client.post(path + "/counterfactuals", headers=headers).status_code == 409
    with session() as db:
        db.get(Merchant, merchant).active_dataset_id = "DIFFERENT-DATASET"
        db.commit()
    assert client.get(path + "/replay", headers=headers).status_code == 404
    assert client.post("/api/v1/workbench/impact", headers=headers, json={}).json()["transactions"] == 0


def test_feedback_is_reasoned_not_ground_truth(client):
    headers, _ = credentials(client)
    assess(client, headers, fraud_label=None)
    endpoint = "/api/v1/risk/reviews/TEST-WORKBENCH/decision"
    decision = {"decision": "approve", "outcome": "LEGITIMATE", "note": "Verified supporting documentation"}
    assert client.post(endpoint, headers=headers, json={**decision, "note": " "}).status_code == 422
    assert (
        client.post(endpoint, headers=headers, json={**decision, "outcome": "CONFIRMED_FRAUD"}).status_code
        == 422
    )
    assert client.post(endpoint, headers=headers, json=decision).status_code == 200
    replay = client.get("/api/v1/workbench/transactions/TEST-WORKBENCH/replay", headers=headers).json()
    assert replay["feedback"]["disagreesWithHighRisk"] is True
    assert replay["feedback"]["automaticRetraining"] is False
    assert replay["humanReview"]["status"] == "RESOLVED"
    with session() as db:
        assert db.scalar(select(Transaction)).fraud_label is None
    health = client.get("/api/v1/workbench/health", headers=headers)
    assert health.status_code == 200, health.text
    assert health.json()["reviewDisagreements"] == 1
    impact = client.post("/api/v1/workbench/impact", headers=headers, json={}).json()
    assert impact["labeledRows"] == 0
    assert impact["projection"] is None
    assert impact["recommended"] is None


@pytest.mark.parametrize(
    "role,simulate_status,health_status,stress_status",
    [
        ("viewer", 403, 200, 403),
        ("analyst", 200, 200, 403),
        ("reviewer", 200, 403, 403),
    ],
)
def test_roles(client, role, simulate_status, health_status, stress_status):
    admin, _ = credentials(client)
    preset = client.get("/api/v1/workbench/presets", headers=admin).json()["Normal payment"]
    headers, _ = credentials(client, role)
    assert (
        client.post("/api/v1/workbench/simulate", headers=headers, json=preset).status_code == simulate_status
    )
    assert client.get("/api/v1/workbench/health", headers=headers).status_code == health_status
    assert client.post("/api/v1/workbench/stress-test", headers=headers).status_code == stress_status
    assert client.get("/api/v1/workbench/health").status_code == 401


def test_business_costs_and_stress_lab(client):
    headers, _ = credentials(client)
    assess(client, headers, fraud_label=True)
    assess(client, headers, "Normal payment", "NORMAL-WORKBENCH", customer_id="NORMAL", fraud_label=False)
    body = client.post("/api/v1/workbench/impact", headers=headers, json={"review_capacity": 0.5}).json()
    assert body["labeledRows"] == 2
    assert body["selected"]["tp"] == 1 and body["selected"]["tn"] == 1
    assert body["selected"]["cost"] == 50
    assert body["projection"]["withoutSystem"] == 6000000
    assert body["projection"]["reviewCost"] == 60000
    assert body["projection"]["netEstimatedSavings"] == 5940000
    assert body["recommended"]["reviewRate"] <= 0.5
    assert client.post("/api/v1/workbench/impact", headers=headers, json={"fraud_rate": 1}).status_code == 422
    before = counts()
    stress = client.post("/api/v1/workbench/stress-test", headers=headers)
    assert stress.status_code == 200, stress.text
    assert stress.json()["total"] == 8
    assert stress.json()["passed"] == 8, stress.text
    assert counts() == before


def test_recent_supplied_label_is_withheld_from_evaluation(client):
    headers, _ = credentials(client)
    presets = client.get("/api/v1/workbench/presets", headers=headers).json()
    response = client.post(
        "/api/v1/risk/assess",
        headers=headers,
        json={
            **presets["Normal payment"],
            "transaction_id": "IMMATURE-LABEL",
            "fraud_label": False,
            "timestamp": "2026-08-20T00:00:00Z",
            "fraud_label_observed_at": "2026-09-01T00:00:00Z",
        },
    )
    assert response.status_code == 201, response.text
    impact = client.post("/api/v1/workbench/impact", headers=headers, json={}).json()
    assert impact["labeledRows"] == 0
    assert impact["immatureLabeledRows"] == 1
    health = client.get("/api/v1/workbench/health", headers=headers).json()
    assert health["reliability"]["samples"] == 0
    assert health["labelMaturity"]["immatureLabeledRows"] == 1


def test_confusion_and_drift_math():
    value = confusion([(90, True), (90, False), (10, True), (10, False)], 71, 100, 5000, 50)
    assert [value[k] for k in ("tp", "fp", "fn", "tn")] == [1, 1, 1, 1]
    assert value["cost"] == 5200
    assert value["precision"] == value["recall"] == value["fpr"] == 0.5
    assert confusion([], 71, 1, 1, 1)["precision"] is None
    assert distribution_shift([1] * 29, [1] * 30)["status"] == "INSUFFICIENT_DATA"
    assert distribution_shift(list(range(40)), list(range(40)))["value"] == 0
    assert distribution_shift(list(range(40)), list(range(100, 140)))["status"] == "HIGH"
    assert distribution_shift(["A"] * 30, ["B"] * 30, True)["value"] == 1
    assert distribution_shift([2000] * 30, [120000] * 30)["status"] == "HIGH"
    assert distribution_shift([2000] * 30, [2000] * 30)["value"] == 0


def test_other_merchant_cannot_read_or_simulate_case(client):
    headers, _ = credentials(client)
    assess(client, headers)
    with session() as db:
        merchant = Merchant(external_id="OTHER", name="Other merchant")
        db.add(merchant)
        db.flush()
        db.add(
            User(
                merchant_id=merchant.id,
                email_normalized="other@example.com",
                password_hash=hash_secret("a-secure-test-password"),
                display_name="Other admin",
                role=UserRole.ADMIN,
            )
        )
        db.commit()
    auth = login(client, "other@example.com")
    other = {"Authorization": f"Bearer {auth['access_token']}"}
    path = "/api/v1/workbench/transactions/TEST-WORKBENCH"
    assert client.get(path + "/replay", headers=other).status_code == 404
    assert client.post(path + "/counterfactuals", headers=other).status_code == 404
    assert client.post("/api/v1/workbench/impact", headers=other, json={}).json()["transactions"] == 0


def test_fingerprint_uses_prior_events_not_future_records(client):
    headers, _ = credentials(client)
    assess(client, headers, "Normal payment", "OLDER", timestamp="2026-08-01T09:00:00Z", amount=2000)
    assess(client, headers, "Normal payment", "FUTURE", timestamp="2026-08-01T12:00:00Z", amount=8000)
    assess(client, headers, txn="CURRENT", timestamp="2026-08-01T10:00:00Z")
    result = client.get("/api/v1/workbench/transactions/CURRENT/replay", headers=headers)
    assert result.status_code == 200, result.text
    profile = result.json()["behavioralFingerprint"]
    assert profile["sampleSize"] == 1
    assert profile["averageAmount"] == 2000


def test_submitted_history_cannot_reduce_risk_and_lineage_is_persisted(client):
    headers, merchant = credentials(client)
    payload = {
        "transaction_id": "TRUST-BOUNDARY-1",
        "customer_id": "CUSTOMER-A",
        "merchant_id": merchant,
        "amount": 120000,
        "customer_average_amount": 9999999,
        "device_id": "SHARED-DEVICE",
        "recipient_id": "RECIPIENT-X",
        "recipient_verified": True,
        "recipient_used_before": True,
        "customer_recipient_transactions": 999,
        "account_age_days": 5000,
    }
    response = client.post("/api/v1/risk/assess", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["feature_snapshot"]["recipient_verified"] is False
    assert body["feature_snapshot"]["recipient_used_before"] is False
    assert body["feature_snapshot"]["customer_recipient_transactions"] == 0
    assert body["feature_snapshot"]["amount_deviation_ratio"] == 1
    lineage = body["feature_provenance"]
    assert lineage["recipient_verified"]["submitted"] is True
    assert lineage["recipient_verified"]["effective"] is False
    assert lineage["customer_average_amount"]["effective"] == 120000
    assert lineage["customer_age"]["resolution"] == "EXCLUDED_FROM_RISK_DECISION_FAIRNESS_GUARD"
    with session() as db:
        event = db.scalar(select(AuditEvent).where(AuditEvent.event_type == "DECISION_SNAPSHOT_RECORDED"))
        snapshot_body = json.loads(event.detail)["body"]
        assert snapshot_body["schemaVersion"] == 2
        assert snapshot_body["featureProvenance"] == lineage

    second = client.post(
        "/api/v1/risk/assess",
        headers=headers,
        json={
            **payload,
            "transaction_id": "TRUST-BOUNDARY-2",
            "customer_id": "CUSTOMER-B",
            "timestamp": "2030-01-01T00:00:00Z",
            "customer_average_amount": None,
            "recipient_verified": False,
            "recipient_used_before": False,
            "customer_recipient_transactions": 0,
        },
    )
    assert second.status_code == 201, second.text
    graph = second.json()["graph_context"]
    assert graph["customers"] >= 2
    assert second.json()["feature_snapshot"]["shared_device_accounts"] == 2
    assert second.json()["feature_snapshot"]["unique_customers_to_recipient"] == 2


def test_reliability_slices_replay_queue_and_claim(client):
    headers, _ = credentials(client)
    assess(client, headers, fraud_label=True)
    assess(client, headers, "Normal payment", "NORMAL-REPLAY", customer_id="NORMAL", fraud_label=False)
    health = client.get("/api/v1/workbench/health", headers=headers).json()
    assert health["reliability"]["samples"] == 2
    assert health["reliability"]["status"] == "LIMITED_SAMPLE"
    assert health["slices"]
    assert health["labelMaturity"]["status"] == "ENFORCED_IN_TRAINING_AND_EVALUATION"
    assert health["operatingPolicy"]["source"] == "ACTIVE_ARTIFACT_MANIFEST"
    assert health["operatingPolicy"]["businessCostAnalysis"]
    replay = client.get("/api/v1/workbench/historical-replay", headers=headers)
    assert replay.status_code == 200, replay.text
    assert replay.json()["eligible"] == 2
    assert replay.json()["mode"] == "TEMPORAL_REPLAY_WITH_OFFLINE_SHADOW_COMPARISON"
    assert replay.json()["persisted"] is False
    comparison = replay.json()["championChallenger"]
    assert comparison["status"] == "NO_DISTINCT_CHALLENGER"
    assert comparison["sameFrozenInputs"] is True
    assert comparison["comparableRows"] == 2
    assert comparison["promotionDecision"] == "NOT_EVALUATED_AUTOMATICALLY"
    impact = client.post("/api/v1/workbench/impact", headers=headers, json={}).json()
    assert impact["queue"]["pending"] >= 1
    assert impact["queue"]["unassigned"] >= 1

    reviewer, _ = credentials(client, "reviewer")
    case = client.get("/api/v1/reviews", headers=reviewer).json()[0]
    claimed = client.post(f"/api/v1/reviews/{case['caseId']}/claim", headers=reviewer)
    assert claimed.status_code == 200, claimed.text
    updated = client.get("/api/v1/reviews", headers=reviewer).json()[0]
    assert updated["assignedToMe"] is True
    assert updated["ageHours"] >= 0


def test_reliability_and_slice_math():
    reliability = reliability_table([(0.1, False), (0.9, True)])
    assert reliability["brier"] == pytest.approx(0.01)
    assert reliability["ece"] == pytest.approx(0.1)
    assert reliability["status"] == "LIMITED_SAMPLE"
    slices = slice_report({"small": [(90, True)] * 9, "enough": [(90, True)] * 10})
    assert slices[1]["status"] == "WITHHELD_LOW_SUPPORT"
    assert slices[0]["metrics"]["recall"] == 1
