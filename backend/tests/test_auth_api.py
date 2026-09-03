import csv
from collections.abc import Generator
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.security import hash_secret
from app.database.base import Base
from app.database.session import get_db
from app.main import app, auth_limiter
from app.models.auth import Merchant, User, UserRole
from app.services.operational_metrics import operational_metrics


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    auth_limiter.reset()
    operational_metrics.reset()
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)
    with testing_session() as db:
        merchant = Merchant(external_id="MER-TEST", name="Test Merchant")
        db.add(merchant)
        db.flush()
        for email, name, role, phone in (
            (
                "analyst@example.com",
                "Test Analyst",
                UserRole.RISK_ANALYST,
                "+919876543210",
            ),
            ("admin@example.com", "Test Admin", UserRole.ADMIN, None),
            ("reviewer@example.com", "Test Reviewer", UserRole.REVIEWER, None),
            ("viewer@example.com", "Test Viewer", UserRole.VIEWER, None),
        ):
            db.add(
                User(
                    merchant_id=merchant.id,
                    email_normalized=email,
                    phone_normalized=phone,
                    password_hash=hash_secret("a-secure-test-password"),
                    display_name=name,
                    role=role,
                )
            )
        db.commit()

    def override_db() -> Generator[Session, None, None]:
        with testing_session() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    auth_limiter.reset()
    operational_metrics.reset()
    Base.metadata.drop_all(engine)


def login(client: TestClient, identifier: str = "analyst@example.com") -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/login",
        json={"identifier": identifier, "password": "a-secure-test-password"},
    )
    assert response.status_code == 200
    return response.json()


def test_login_accepts_email_or_phone_and_rejects_bad_password(client: TestClient) -> None:
    authenticated = login(client)
    assert authenticated["user"]["role"] == "RISK_ANALYST"
    assert authenticated["user"]["merchant_reference"] == "MER-TEST"
    assert login(client, "+91 98765 43210")["user"]["display_name"] == "Test Analyst"
    rejected = client.post(
        "/api/v1/auth/login",
        json={"identifier": "analyst@example.com", "password": "incorrect-password"},
    )
    assert rejected.status_code == 401
    assert rejected.json()["detail"] == "Invalid credentials"


def test_refresh_session_rotates_once_and_logout_revokes(client: TestClient) -> None:
    authenticated = client.post(
        "/api/v1/auth/login",
        json={"identifier": "reviewer@example.com", "password": "a-secure-test-password"},
    )
    assert authenticated.status_code == 200
    first_cookie = client.cookies.get("razorshield_refresh")
    first_access = authenticated.json()["access_token"]
    assert first_cookie and "HttpOnly" in authenticated.headers["set-cookie"]
    assert "SameSite=strict" in authenticated.headers["set-cookie"]

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["session_rotated"] is True
    assert refreshed.json()["access_token"] != first_access
    second_cookie = client.cookies.get("razorshield_refresh")
    assert second_cookie and second_cookie != first_cookie

    client.cookies.set("razorshield_refresh", first_cookie, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401
    client.cookies.set("razorshield_refresh", second_cookie, path="/api/v1/auth")
    assert client.post("/api/v1/auth/refresh").status_code == 401

    assert (
        client.post(
            "/api/v1/auth/login",
            json={"identifier": "reviewer@example.com", "password": "a-secure-test-password"},
        ).status_code
        == 200
    )
    assert client.post("/api/v1/auth/logout").status_code == 200
    assert client.post("/api/v1/auth/refresh").status_code == 401


def test_role_permissions_are_enforced_by_the_api(client: TestClient) -> None:
    def headers_for(identifier: str) -> dict[str, str]:
        auth = login(client, identifier)
        return {"Authorization": f"Bearer {auth['access_token']}"}

    analyst = headers_for("analyst@example.com")
    reviewer = headers_for("reviewer@example.com")
    viewer = headers_for("viewer@example.com")
    admin = headers_for("admin@example.com")

    assert client.get("/api/v1/reviews", headers=analyst).status_code == 200
    assert (
        client.post(
            "/api/v1/risk/reviews/CASE-NOT-FOUND/decision",
            json={"decision": "approve"},
            headers=analyst,
        ).status_code
        == 403
    )

    assert client.get("/api/v1/reviews", headers=reviewer).status_code == 200
    assert (
        client.post(
            "/api/v1/risk/assess",
            json={
                "transaction_id": "TX-REVIEWER-DENIED",
                "customer_id": "CUS-1",
                "merchant_id": login(client, "reviewer@example.com")["user"]["merchant_id"],
                "amount": "100.00",
            },
            headers=reviewer,
        ).status_code
        == 403
    )

    assert client.get("/api/v1/analytics", headers=viewer).status_code == 200
    assert client.get("/api/v1/risk/transactions", headers=viewer).status_code == 403
    assert client.get("/api/v1/settings/profile", headers=viewer).status_code == 403

    assert client.get("/api/v1/reviews", headers=admin).status_code == 200
    assert client.get("/api/v1/settings/profile", headers=admin).status_code == 200


def test_recovery_is_generic_and_reset_is_single_use(client: TestClient) -> None:
    existing = client.post(
        "/api/v1/auth/password/forgot",
        json={"identifier": "analyst@example.com"},
    )
    missing = client.post(
        "/api/v1/auth/password/forgot",
        json={"identifier": "missing@example.com"},
    )
    assert existing.status_code == missing.status_code == 200
    assert existing.json()["message"] == missing.json()["message"]

    verified = client.post(
        "/api/v1/auth/password/verify-otp",
        json={"identifier": "analyst@example.com", "otp": existing.json()["development_otp"]},
    )
    assert verified.status_code == 200
    reset_payload = {
        "reset_token": verified.json()["reset_token"],
        "new_password": "a-new-secure-test-password",
        "confirm_password": "a-new-secure-test-password",
    }
    assert client.post("/api/v1/auth/password/reset", json=reset_payload).status_code == 200
    assert client.post("/api/v1/auth/password/reset", json=reset_payload).status_code == 400

    new_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": "analyst@example.com", "password": "a-new-secure-test-password"},
    )
    assert new_login.status_code == 200


def test_risk_assessment_enforces_authentication_and_merchant_boundary(client: TestClient) -> None:
    transaction = {
        "transaction_id": "TX-SECURITY-1",
        "customer_id": "CUS-1",
        "customer_name": "Dhanush Kumar",
        "customer_email": "dhanush@example.com",
        "customer_phone": "+919900001111",
        "customer_verification_status": "VERIFIED",
        "sender_account_reference": "XXXX1111",
        "sender_bank_name": "RazorShield Bank",
        "sender_bank_ifsc": "RSBK0001234",
        "merchant_id": "not-the-authenticated-merchant",
        "amount": "42000.00",
        "customer_average_amount": "3200.00",
        "device_id": "DEV-NEW",
        "location": "Hyderabad",
        "recipient_id": "ACC-DEST-1",
        "recipient_name": "Ananya Rao",
        "recipient_account_reference": "XXXX9001",
        "recipient_bank_name": "Merchant Trust Bank",
        "recipient_bank_ifsc": "MTBK0004321",
        "recipient_email": "ananya@example.com",
        "recipient_phone": "+919900009001",
        "recipient_type": "PERSONAL",
        "recipient_category": "PERSONAL_TRANSFER",
        "recipient_verified": False,
        "is_new_device": True,
        "is_new_location": True,
    }
    assert client.post("/api/v1/risk/assess", json=transaction).status_code == 401

    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    assert client.post("/api/v1/risk/assess", json=transaction, headers=headers).status_code == 403

    transaction["merchant_id"] = auth["user"]["merchant_id"]
    accepted = client.post("/api/v1/risk/assess", json=transaction, headers=headers)
    assert accepted.status_code == 201
    assert accepted.json()["model_status"] == "TRAINED_VERSIONED_MODELS"
    assert accepted.json()["model_provenance"] == "SYNTHETIC"
    assert accepted.json()["inference_latency_ms"] >= 0
    assert accepted.json()["feature_snapshot"]["amount"] == 42000
    assert accepted.json()["feature_snapshot"]["amount_deviation_ratio"] == 13.12
    assert accepted.json()["behavior_context"]["history_sample_size"] == 0
    assert accepted.json()["behavior_context"]["baseline_source"] == "REQUEST_BASELINE"
    assert accepted.json()["behavior_context"]["model_average_amount"] == 3200
    assert accepted.json()["behavior_context"]["model_amount_deviation_ratio"] == 13.12
    assert accepted.json()["behavior_context"]["submitted_is_new_device"] is True
    assert accepted.json()["behavior_context"]["is_new_device"] is True
    assert accepted.json()["behavior_context"]["deviation_level"] == "HIGH"
    assert any(rule["code"] == "VELOCITY_ALERT" for rule in accepted.json()["rule_results"])
    assert accepted.json()["fusion_contributions"]
    assert accepted.json()["model_contributions"]
    assert accepted.json()["risk_explanation"]
    investigation = client.get("/api/investigations/TX-SECURITY-1", headers=headers)
    flow = investigation.json()["fundsFlow"]
    assert flow["direction"] == "CUSTOMER_TO_RECIPIENT"
    assert flow["amount"] == 42000.0
    assert flow["source"] == "stored transaction record"
    assert flow["sender"] == {
        "customerReference": "CUS-1",
        "name": "Dhanush Kumar",
        "email": "dhanush@example.com",
        "phone": "+919900001111",
        "accountReference": "XXXX1111",
        "accountReferenceStatus": "COLLECTED",
        "bankName": "RazorShield Bank",
        "bankIfsc": "RSBK0001234",
        "customerVerificationStatus": "VERIFIED",
        "age": 35.0,
        "accountAgeDays": 0.0,
        "historicalAverageAmount": 3200.0,
        "historicalFraudCount": 0.0,
        "deviceId": "DEV-NEW",
        "deviceStatus": "NEW",
        "location": "Hyderabad",
        "locationStatus": "UNUSUAL",
    }
    assert flow["recipient"]["entityReference"] == "ACC-DEST-1"
    assert flow["recipient"]["name"] == "Ananya Rao"
    assert flow["recipient"]["accountReference"] == "XXXX9001"
    assert flow["recipient"]["bankName"] == "Merchant Trust Bank"
    assert flow["recipient"]["bankIfsc"] == "MTBK0004321"
    assert flow["recipient"]["email"] == "ananya@example.com"
    assert flow["recipient"]["phone"] == "+919900009001"
    assert "Customer verification outcome" not in investigation.json()["missingInformation"]
    assert "Sender bank account reference" not in investigation.json()["missingInformation"]
    assert flow["recipient"]["type"] == "PERSONAL"
    assert flow["recipient"]["category"] == "PERSONAL_TRANSFER"
    assert flow["recipient"]["verified"] is False
    assert flow["recipient"]["riskScore"] == 0.5
    assert flow["recipient"]["usedBefore"] is False
    assert any(
        item["label"] == "Recipient/account reference" and item["value"] == "XXXX9001"
        for item in investigation.json()["evidence"]
    )
    fraud_evidence = next(
        item for item in investigation.json()["evidence"] if item["label"] == "Fraud probability"
    )
    assert fraud_evidence["source"] == accepted.json()["engine_version"].split("/", 1)[0]

    admin_auth = login(client, "admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_auth['access_token']}"}
    policy = client.post(
        "/api/v1/agent/policies",
        headers=admin_headers,
        json={
            "name": "Review policy",
            "version": "2.0",
            "content": (
                "High-risk transactions with verification failures require manual review. "
                "No financial action may be executed by the investigator."
            ),
        },
    )
    assert policy.status_code == 201
    agent = client.post(
        "/api/v1/agent/investigate/TX-SECURITY-1",
        headers=headers,
    )
    assert agent.status_code == 200
    assert agent.json()["riskLevel"] == "HIGH"
    assert agent.json()["executedFinancialAction"] is False
    assert agent.json()["network"]["submittedSharedAccounts"] == 0
    assert agent.json()["network"]["observedRelatedCustomerAccounts"] == 0
    assert len(agent.json()["toolTrace"]) == 9
    assert agent.json()["policies"][0]["name"] == "Review policy"
    assert "does not label a person" in agent.json()["responsibleAIStatement"]
    repeated_agent = client.post(
        "/api/v1/agent/investigate/TX-SECURITY-1",
        headers=headers,
    )
    assert repeated_agent.status_code == 200
    assert repeated_agent.json()["runId"] == agent.json()["runId"]


def test_admin_can_version_configurable_rule_thresholds(client: TestClient) -> None:
    admin_auth = login(client, "admin@example.com")
    admin_headers = {"Authorization": f"Bearer {admin_auth['access_token']}"}
    analyst_auth = login(client)
    analyst_headers = {"Authorization": f"Bearer {analyst_auth['access_token']}"}

    assert client.get("/api/v1/risk/rules/config", headers=analyst_headers).status_code == 403
    initial = client.get("/api/v1/risk/rules/config", headers=admin_headers)
    assert initial.status_code == 200
    assert initial.json()["version"] == 1

    updated = client.patch(
        "/api/v1/risk/rules/config",
        headers=admin_headers,
        json={
            "high_amount_ratio": 2.5,
            "velocity_5m_threshold": 3,
            "failed_attempts_threshold": 2,
            "shared_device_accounts_threshold": 3,
            "new_device_amount_ratio": 1.5,
            "geographic_amount_ratio": 1.5,
        },
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2

    assessment = client.post(
        "/api/v1/risk/assess",
        headers=analyst_headers,
        json={
            "transaction_id": "TX-CONFIGURED-RULES",
            "customer_id": "CUS-RULES",
            "merchant_id": analyst_auth["user"]["merchant_id"],
            "amount": 300,
            "customer_average_amount": 100,
            "transactions_last_5_minutes": 3,
            "failed_attempts_last_10_minutes": 2,
            "is_new_device": True,
            "is_new_location": True,
            "shared_device_accounts": 3,
        },
    )
    assert assessment.status_code == 201
    fired = {rule["code"] for rule in assessment.json()["rule_results"] if rule["fired"]}
    assert fired >= {
        "HIGH_AMOUNT",
        "VELOCITY_ALERT",
        "NEW_DEVICE_HIGH_AMOUNT",
        "REPEATED_FAILURES",
        "GEOGRAPHIC_MOVEMENT",
        "SHARED_DEVICE_NETWORK",
    }


def test_batch_operations_search_entity_and_timeline(client: TestClient) -> None:
    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    merchant_id = auth["user"]["merchant_id"]
    transactions = [
        {
            "transaction_id": f"TX-BATCH-{index}",
            "customer_id": "CUS-BATCH",
            "merchant_id": merchant_id,
            "amount": 42000 + index,
            "customer_average_amount": 3200,
            "transactions_last_5_minutes": 8,
            "transactions_last_hour": 21,
            "failed_attempts_last_10_minutes": 5,
            "is_new_device": True,
            "is_new_location": True,
            "shared_device_accounts": 6,
            "device_id": "DEV-BATCH",
            "location": "Hyderabad",
            "historical_return_rate": 0.61,
        }
        for index in range(2)
    ]
    batch = client.post(
        "/api/v1/risk/assess/batch",
        json={"transactions": transactions},
        headers=headers,
    )
    assert batch.status_code == 201
    assert batch.json()["processed"] == 2

    search = client.get("/api/v1/search?q=CUS-BATCH", headers=headers)
    assert search.status_code == 200
    assert {item["type"] for item in search.json()} >= {"transaction", "customer"}
    device_search = client.get("/api/v1/search?q=DEV-BATCH", headers=headers)
    assert {item["type"] for item in device_search.json()} >= {"transaction", "device"}

    reviews = client.get("/api/v1/reviews", headers=headers)
    assert reviews.status_code == 200
    assert reviews.json()[0]["caseId"].startswith("CASE-TX-BATCH")

    entity = client.get("/api/v1/entities/customers/CUS-BATCH", headers=headers)
    assert entity.status_code == 200
    assert entity.json()["transactions"] == 2
    assert entity.json()["devices"] == ["DEV-BATCH"]
    assert entity.json()["averageOrderValue"] == 42000.5
    assert entity.json()["ipAddressStatus"] == "NOT_COLLECTED"

    timeline = client.get(
        f"/api/v1/cases/{reviews.json()[0]['caseId']}/timeline",
        headers=headers,
    )
    assert timeline.status_code == 200
    assert {event["event"] for event in timeline.json()} >= {
        "Transaction received",
        "Risk assessment completed",
        "Review case created",
    }

    reviewer_auth = login(client, "reviewer@example.com")
    reviewer_headers = {"Authorization": f"Bearer {reviewer_auth['access_token']}"}
    decision = client.post(
        f"/api/v1/risk/reviews/{reviews.json()[0]['caseId']}/decision",
        headers=reviewer_headers,
        json={"decision": "approve", "note": "Verified evidence reviewed."},
    )
    assert decision.status_code == 200
    assert decision.json()["caseStatus"] == "RESOLVED"
    assert decision.json()["decision"] == "APPROVED"
    completed_timeline = client.get(
        f"/api/v1/cases/{reviews.json()[0]['caseId']}/timeline",
        headers=headers,
    ).json()
    assert {event["event"] for event in completed_timeline} >= {
        "Human Reviewer Assigned",
        "Human Decision Approved",
        "Case Closed",
    }

    assert client.get("/api/v1/notifications", headers=headers).status_code == 200
    analytics = client.get("/api/v1/analytics", headers=headers)
    assert analytics.status_code == 200
    assert analytics.json()["transactions"] == 2


def test_uploaded_dataset_becomes_scope_for_all_operations_and_live_events(
    client: TestClient,
) -> None:
    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    merchant_id = auth["user"]["merchant_id"]
    before = {
        "transaction_id": "TX-BEFORE-DATASET",
        "customer_id": "CUS-BEFORE",
        "merchant_id": merchant_id,
        "amount": 9000,
    }
    assert client.post("/api/v1/risk/assess", json=before, headers=headers).status_code == 201

    uploaded = [
        {
            "transaction_id": f"TX-ACTIVE-{index}",
            "customer_id": f"CUS-ACTIVE-{index}",
            "merchant_id": merchant_id,
            "amount": 41000 + index,
            "customer_average_amount": 3000,
            "device_id": "DEV-ACTIVE",
            "location": "Hyderabad",
            "transactions_last_5_minutes": 8,
            "transactions_last_hour": 20,
            "failed_attempts_last_10_minutes": 4,
            "shared_device_accounts": 5,
            "historical_return_rate": 0.52,
        }
        for index in range(2)
    ]
    batch = client.post(
        "/api/v1/risk/assess/batch",
        json={"dataset_name": "merchant-events.csv", "transactions": uploaded},
        headers=headers,
    )
    assert batch.status_code == 201
    assert batch.json()["dataset_name"] == "merchant-events.csv"
    admin_auth = login(client, "admin@example.com")
    training_without_labels = client.post(
        "/api/v1/risk/train/active-dataset",
        headers={"Authorization": f"Bearer {admin_auth['access_token']}"},
    )
    assert training_without_labels.status_code == 422
    assert "mature rows" in training_without_labels.json()["detail"]

    replacement = client.post(
        "/api/v1/risk/assess/batch",
        json={"dataset_name": "merchant-events-corrected.csv", "transactions": uploaded},
        headers=headers,
    )
    assert replacement.status_code == 201
    assert replacement.json()["dataset_id"] != batch.json()["dataset_id"]

    active = client.get("/api/v1/datasets/active", headers=headers).json()
    assert active["source"] == "UPLOADED"
    assert active["datasetName"] == "merchant-events-corrected.csv"
    assert active["rowCount"] == 2

    transactions = client.get("/api/v1/risk/transactions", headers=headers).json()
    assert {item["transactionId"] for item in transactions} == {"TX-ACTIVE-0", "TX-ACTIVE-1"}
    assert client.get("/api/v1/risk/transactions/TX-BEFORE-DATASET", headers=headers).status_code == 404
    assert client.get("/api/v1/risk/overview", headers=headers).json()["transactionsAnalyzed"] == 2
    assert client.get("/api/v1/analytics", headers=headers).json()["transactions"] == 2
    assert client.get("/api/v1/search?q=BEFORE", headers=headers).json() == []
    assert len(client.get("/api/v1/reviews", headers=headers).json()) == 2
    assert len(client.get("/api/v1/returns", headers=headers).json()) == 2
    return_profile = client.get("/api/v1/returns", headers=headers).json()[0]
    assert return_profile["category"] == "RETURN_RISK_NOT_FRAUD"
    assert "confirmed returns" in return_profile["limitation"].lower()
    assert return_profile["recentTransactions"]
    chargebacks = client.get("/api/v1/chargebacks", headers=headers).json()
    assert len(chargebacks) == 2
    chargeback_id = chargebacks[0]["chargebackId"]
    generated = client.post(
        f"/api/v1/chargebacks/{chargeback_id}/generate-summary",
        headers=headers,
    )
    assert generated.status_code == 200
    assert "Unavailable evidence" in generated.json()["draft"]
    assert generated.json()["externalSubmissionExecuted"] is False
    sent = client.post(
        f"/api/v1/chargebacks/{chargeback_id}/send-review",
        headers=headers,
    )
    assert sent.status_code == 200
    assert sent.json()["status"] == "PENDING_HUMAN_REVIEW"
    assert sent.json()["externalSubmissionExecuted"] is False
    network = client.get("/api/v1/risk/network", headers=headers).json()
    assert {node["label"] for node in network["nodes"]} >= {
        "CUS-ACTIVE-0",
        "CUS-ACTIVE-1",
        "DEV-ACTIVE",
    }
    assert network["customerCount"] == 2
    assert network["deviceCount"] == 1
    assert network["ipStatus"] == "NOT_COLLECTED"
    assert network["clusters"][0]["memberCount"] == 3
    monitoring = client.get("/api/v1/monitoring/models", headers=headers).json()
    assert monitoring["operational"]["measuredRequests"] == 2
    assert monitoring["drift"]["sampleSize"] == 2
    assert monitoring["drift"]["features"]["transactionAmount"] == "INSUFFICIENT_DATA"

    live = {**before, "transaction_id": "TX-LIVE-AFTER-UPLOAD", "customer_id": "CUS-LIVE"}
    assert client.post("/api/v1/risk/assess", json=live, headers=headers).status_code == 201
    assert client.get("/api/v1/datasets/active", headers=headers).json()["rowCount"] == 3
    assert client.get("/api/v1/risk/overview", headers=headers).json()["transactionsAnalyzed"] == 3


def test_batch_upload_adapts_common_external_schema(client: TestClient) -> None:
    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    external_row = {
        "transaction_id": "TX-EXTERNAL-001",
        "customer_id": "CUS-EXTERNAL-001",
        "amount": "64312",
        "customer_age": "39",
        "account_age_days": "2226",
        "recipient_id": "ACC999",
        "recipient_type": "UNKNOWN",
        "recipient_verified": "False",
        "transaction_purpose": "UNKNOWN",
        "previous_transactions": "13",
        "customer_avg_amount": "2292",
        "transactions_last_15m": "10",
        "transactions_last_1h": "26",
        "same_recipient_transactions_15m": "8",
        "device_status": "NEW",
        "location_status": "UNUSUAL",
        "previous_fraud_count": "2",
        "recipient_previous_customers": "1",
        "recipient_risk_score": "91",
        "is_fraud": "1",
    }
    response = client.post(
        "/api/v1/risk/assess/batch",
        headers=headers,
        json={"dataset_name": "external-schema.csv", "transactions": [external_row]},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["processed"] == 1
    assert body["schema_mapping"]["customer_avg_amount"] == "customer_average_amount"
    assert body["schema_mapping"]["is_fraud"] == "fraud_label"
    assert body["schema_mapping"]["device_status"] == "is_new_device"
    assert body["unmapped_columns"] == ["previous_transactions"]
    assert any("0–1 scale" in item for item in body["transformed_fields"])
    assessment = body["assessments"][0]
    assert assessment["feature_snapshot"]["recipient_risk_score"] == 0.91
    assert assessment["feature_snapshot"]["is_new_device"] is True
    assert assessment["feature_snapshot"]["is_new_location"] is True
    assert assessment["feature_snapshot"]["amount_deviation_ratio"] == 28.06
    overview = client.get("/api/v1/risk/overview", headers=headers).json()
    assert overview["fraudDetected"] == 1
    assert overview["fraudRate"] == 1
    assert overview["fraudOutcomeCoverage"] == 1
    analytics = client.get("/api/v1/analytics", headers=headers).json()
    assert analytics["confirmedFraud"] == 1
    assert analytics["fraudOutcomeCoverage"] == 1


def test_complete_party_dataset_round_trip(client: TestClient) -> None:
    """Every synthetic identity survives upload, storage, and investigation reads."""
    dataset = Path(__file__).resolve().parents[2] / "examples" / "complete-party-details.csv"
    with dataset.open(newline="") as source:
        rows = list(csv.DictReader(source))
    assert len(rows) == 24
    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    uploaded = client.post(
        "/api/v1/risk/assess/batch",
        json={"dataset_name": dataset.name, "transactions": rows},
        headers=headers,
    )
    assert uploaded.status_code == 201, uploaded.text
    result = uploaded.json()
    assert result["processed"] == 24
    assert result["unmapped_columns"] == []
    parties = {
        "sender": {
            "customerReference": "customer_id",
            "name": "customer_name",
            "email": "customer_email",
            "phone": "customer_phone",
            "accountReference": "sender_account_reference",
            "bankName": "sender_bank_name",
            "bankIfsc": "sender_bank_ifsc",
            "customerVerificationStatus": "customer_verification_status",
        },
        "recipient": {
            "entityReference": "recipient_id",
            "name": "recipient_name",
            "email": "recipient_email",
            "phone": "recipient_phone",
            "accountReference": "recipient_account_reference",
            "bankName": "recipient_bank_name",
            "bankIfsc": "recipient_bank_ifsc",
        },
    }
    for row in rows:
        response = client.get(f"/api/investigations/{row['transaction_id']}", headers=headers)
        assert response.status_code == 200
        investigation = response.json()
        flow = investigation["fundsFlow"]
        assert flow["amount"] == float(row["amount"])
        assert flow["currency"] == row["currency"]
        for party, fields in parties.items():
            for output, column in fields.items():
                assert flow[party][output] == row[column], (row["transaction_id"], column)
        assert investigation["evidence"]
        assert "Sender bank account reference" not in investigation["missingInformation"]
    overview = client.get("/api/v1/risk/overview", headers=headers).json()
    assert overview["transactionsAnalyzed"] == 24
    assert overview["fraudDetected"] == 6
    assert overview["fraudOutcomeCoverage"] == 1
    analytics = client.get("/api/v1/analytics", headers=headers).json()
    assert analytics["transactions"] == 24
    assert analytics["confirmedFraud"] == 6
    active = client.get("/api/v1/datasets/active", headers=headers).json()
    assert active["rowCount"] == 24
    assert active["datasetName"] == dataset.name
    earliest = client.post("/api/v1/agent/investigate/FULL-TX-0002", headers=headers).json()
    assert earliest["behavior"]["historySampleSize"] == 0
    assert earliest["behavior"]["historicalAverage"] is None
    assert earliest["network"]["submittedSharedAccounts"] == 7
    assert earliest["network"]["observedRelatedCustomerAccounts"] == 0
    later = client.post("/api/v1/agent/investigate/FULL-TX-0010", headers=headers).json()
    assert later["behavior"]["historySampleSize"] == 1
    assert later["behavior"]["historicalAverage"] == 66700


def test_batch_upload_generates_missing_ids_but_requires_amount(client: TestClient) -> None:
    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    accepted = client.post(
        "/api/v1/risk/assess/batch",
        headers=headers,
        json={"dataset_name": "minimal.csv", "transactions": [{"payment_amount": "1200"}]},
    )
    assert accepted.status_code == 201
    body = accepted.json()
    assert body["assessments"][0]["transaction_id"] == "UPLOAD-000001"
    assert len(body["ingestion_warnings"]) == 2

    rejected = client.post(
        "/api/v1/risk/assess/batch",
        headers=headers,
        json={"dataset_name": "no-amount.csv", "transactions": [{"event_id": "EV-1"}]},
    )
    assert rejected.status_code == 422
    assert "no transaction amount column" in rejected.json()["detail"]


def test_admin_can_train_active_labeled_dataset_once(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    auth = login(client, "admin@example.com")
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    merchant_id = auth["user"]["merchant_id"]
    rows = []
    for index in range(100):
        positive = index % 5 == 0
        rows.append(
            {
                "transaction_id": f"TX-TRAIN-{index:03d}",
                "customer_id": f"CUS-TRAIN-{index % 20:02d}",
                "merchant_id": merchant_id,
                "amount": 45_000 if positive else 1_500,
                "customer_average_amount": 3_000,
                "transactions_last_5_minutes": 8 if positive else 1,
                "transactions_last_hour": 20 if positive else 3,
                "failed_attempts_last_10_minutes": 4 if positive else 0,
                "is_new_device": positive,
                "is_new_location": positive,
                "shared_device_accounts": 6 if positive else 0,
                "historical_return_rate": 0.7 if positive else 0.05,
                "fraud_label": positive,
                "return_label": positive,
                "timestamp": f"2025-01-{(index % 28) + 1:02d}T{index % 24:02d}:00:00Z",
                "fraud_label_observed_at": "2025-04-01T00:00:00Z",
                "return_label_observed_at": "2025-04-01T00:00:00Z",
            }
        )
    uploaded = client.post(
        "/api/v1/risk/assess/batch",
        headers=headers,
        json={"dataset_name": "labeled-real-time.csv", "transactions": rows},
    )
    assert uploaded.status_code == 201
    monkeypatch.setattr(
        "app.services.realtime_training.get_settings",
        lambda: SimpleNamespace(model_dir=str(tmp_path), label_maturity_days=45),
    )
    trained = client.post("/api/v1/risk/train/active-dataset", headers=headers)
    assert trained.status_code == 200
    assert trained.json()["status"] == "TRAINED_AND_ACTIVATED"
    assert trained.json()["provenance"] == "MERCHANT_LABELED_REAL_TIME"
    assert trained.json()["rows"] == 100
    assert trained.json()["heldOutRows"] == 20
    assert trained.json()["split"] == "TEMPORAL_60_20_20"
    assert trained.json()["businessCostAnalysis"]["locked_test_at_f1_threshold"]
    assert trained.json()["businessCostAnalysis"]["locked_test_always_allow_baseline"]
    merchant_artifacts = tmp_path / "merchants" / str(merchant_id)
    assert (merchant_artifacts / "manifest.json").is_file()
    assert client.post("/api/v1/risk/train/active-dataset", headers=headers).status_code == 409


def test_ieee_candidate_endpoint_is_authenticated_and_schema_safe(client: TestClient) -> None:
    payload = {
        "transaction": {
            "TransactionID": "TEST-IEEE-API-1",
            "TransactionDT": 13_200_000,
            "TransactionAmt": 125.50,
            "ProductCD": "W",
            "card1": 12_345,
            "card4": "visa",
            "card6": "debit",
        }
    }
    assert client.post("/api/v1/risk/assess/ieee-cis", json=payload).status_code == 401
    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    accepted = client.post("/api/v1/risk/assess/ieee-cis", headers=headers, json=payload)
    if not (Path(get_settings().ieee_cis_model_dir) / "fraud_model.pkl").is_file():
        # A fresh public checkout must fail closed, not invent candidate predictions.
        assert accepted.status_code == 503
        return
    assert accepted.status_code == 200
    result = accepted.json()
    assert result["transaction_id"] == "TEST-IEEE-API-1"
    assert 0 <= result["fraud_probability"] <= 1
    assert result["model_version"] == "ieee-cis-xgboost-v2"
    assert result["model_status"] == "CANDIDATE_REJECTED_BY_GOVERNANCE"
    assert result["explanation_status"] == "PERMUTATION_SHAP_VERIFIED_FINAL_PROBABILITY"
    assert len(result["contributions"]) == 8

    monitoring = client.get("/api/v1/monitoring/ieee-cis", headers=headers)
    assert monitoring.status_code == 200
    benchmark = monitoring.json()
    assert benchmark["modelVersion"] == "ieee-cis-xgboost-v2"
    assert benchmark["lockedTestRows"] == 88_581
    assert len(benchmark["thresholdAnalysis"]) == 17
    assert benchmark["explainability"] == "PERMUTATION_SHAP_VERIFIED_FINAL_PROBABILITY"
    readiness = client.get("/api/v1/monitoring/deployment-readiness", headers=headers)
    assert readiness.status_code == 200
    assert readiness.json()["modelPromotion"]["eligibleForSchemaSpecificPromotion"] is False
    assert readiness.json()["productionReady"] is False

    missing_schema = client.post(
        "/api/v1/risk/assess/ieee-cis",
        headers=headers,
        json={"transaction": {"TransactionID": "X"}},
    )
    assert missing_schema.status_code == 422
    assert "Missing required IEEE-CIS fields" in missing_schema.json()["detail"]


def test_model_outage_fails_closed_without_persisting_an_assessment(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.api.v1.endpoints import risk as risk_endpoint

    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}

    def unavailable(*_args: object, **_kwargs: object) -> object:
        raise RuntimeError("injected model outage")

    monkeypatch.setattr(risk_endpoint, "persist_assessment", unavailable)
    response = client.post(
        "/api/v1/risk/assess",
        headers=headers,
        json={
            "transaction_id": "TX-MODEL-OUTAGE",
            "customer_id": "CUS-OUTAGE",
            "merchant_id": auth["user"]["merchant_id"],
            "amount": "1000.00",
        },
    )
    assert response.status_code == 503
    assert response.json()["detail"] == ("Risk model is temporarily unavailable; no assessment was stored.")
    monitoring = client.get("/api/v1/monitoring/models", headers=headers).json()
    assert monitoring["operational"]["apiErrors"] >= 1


def test_complete_risk_to_human_decision_to_audit_flow(client: TestClient) -> None:
    analyst_auth = login(client)
    analyst_headers = {"Authorization": f"Bearer {analyst_auth['access_token']}"}
    merchant_id = analyst_auth["user"]["merchant_id"]
    assessed = client.post(
        "/api/v1/risk/assess",
        headers=analyst_headers,
        json={
            "transaction_id": "TX-E2E-HIGH-001",
            "customer_id": "CUS-E2E-001",
            "merchant_id": merchant_id,
            "amount": 120_000,
            "customer_average_amount": 3_000,
            "transactions_last_5_minutes": 8,
            "transactions_last_15_minutes": 10,
            "transactions_last_hour": 24,
            "failed_attempts_last_10_minutes": 5,
            "is_new_device": True,
            "is_new_location": True,
            "shared_device_accounts": 7,
            "recipient_id": "ACC-E2E-UNKNOWN",
            "recipient_category": "UNKNOWN",
            "recipient_verified": False,
            "recipient_risk_score": 0.91,
            "transactions_to_same_recipient_last_15_minutes": 8,
        },
    )
    assert assessed.status_code == 201
    assert assessed.json()["risk_level"] == "HIGH"
    assert assessed.json()["recommended_action"] == "MANUAL_REVIEW"
    assert assessed.json()["signals"]

    investigation = client.get("/api/v1/investigations/TX-E2E-HIGH-001", headers=analyst_headers)
    assert investigation.status_code == 200
    assert investigation.json()["fundsFlow"]["recipient"]["accountReference"] == ("ACC-E2E-UNKNOWN")
    assert investigation.json()["missingInformation"]

    agent = client.post("/api/v1/agent/investigate/TX-E2E-HIGH-001", headers=analyst_headers)
    assert agent.status_code == 200
    assert agent.json()["executedFinancialAction"] is False
    assert agent.json()["recommendation"] == "MANUAL_REVIEW"
    case_id = agent.json()["caseId"]

    reviewer_auth = login(client, "reviewer@example.com")
    reviewer_headers = {"Authorization": f"Bearer {reviewer_auth['access_token']}"}
    decision = client.post(
        f"/api/v1/risk/reviews/{case_id}/decision",
        headers=reviewer_headers,
        json={"decision": "escalate", "note": "Recipient evidence requires senior review."},
    )
    assert decision.status_code == 200
    assert decision.json()["caseStatus"] == "ESCALATED"

    timeline = client.get(f"/api/v1/cases/{case_id}/timeline", headers=analyst_headers)
    assert timeline.status_code == 200
    assert {event["event"] for event in timeline.json()} >= {
        "Transaction received",
        "Risk assessment completed",
        "Investigation Created",
        "Bounded Investigation Completed",
        "Human Decision Escalated",
    }
    audit = client.get("/api/v1/risk/audit", headers=analyst_headers)
    assert audit.status_code == 200
    assert any(event["caseId"] == case_id for event in audit.json())


def test_adversarial_transaction_inputs_are_rejected(client: TestClient) -> None:
    auth = login(client)
    headers = {"Authorization": f"Bearer {auth['access_token']}"}
    merchant_id = auth["user"]["merchant_id"]
    base = {
        "transaction_id": "TX-INVALID",
        "customer_id": "CUS-INVALID",
        "merchant_id": merchant_id,
        "amount": 100,
    }

    for invalid in (
        {**base, "amount": -500},
        {**base, "amount": "hello"},
        {**base, "customer_id": None},
        {**base, "transaction_id": "X" * 101},
    ):
        response = client.post("/api/v1/risk/assess", headers=headers, json=invalid)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    oversized = client.post(
        "/api/v1/risk/assess/batch",
        headers=headers,
        json={"transactions": [{"amount": 1}] * 5_001},
    )
    assert oversized.status_code == 422


def test_auth_rate_limit_and_security_headers(client: TestClient) -> None:
    original_limit = auth_limiter.limit
    auth_limiter.limit = 2
    try:
        first = client.post(
            "/api/v1/auth/login",
            json={"identifier": "analyst@example.com", "password": "definitely-wrong-password"},
        )
        second = client.post(
            "/api/v1/auth/login",
            json={"identifier": "analyst@example.com", "password": "definitely-wrong-password"},
        )
        blocked = client.post(
            "/api/v1/auth/login",
            json={"identifier": "analyst@example.com", "password": "definitely-wrong-password"},
        )
        assert first.status_code == second.status_code == 401
        assert blocked.status_code == 429
        assert blocked.headers["retry-after"] == "60"
        assert blocked.headers["x-content-type-options"] == "nosniff"
        assert blocked.headers["x-frame-options"] == "DENY"
        assert blocked.headers["referrer-policy"] == "no-referrer"
        assert blocked.headers["cache-control"] == "no-store"
        assert blocked.headers["content-security-policy"] == ("default-src 'none'; frame-ancestors 'none'")
    finally:
        auth_limiter.limit = original_limit
        auth_limiter.reset()


def test_oversized_request_is_rejected_before_body_processing(client: TestClient) -> None:
    response = client.post(
        "/api/v1/risk/assess/batch",
        headers={"Content-Length": str(10 * 1024 * 1024 + 1)},
        content=b"{}",
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "REQUEST_TOO_LARGE"
    assert response.headers["x-content-type-options"] == "nosniff"
