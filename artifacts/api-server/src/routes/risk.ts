import { Router, type IRouter } from "express";
import {
  DecideReviewBody,
  DecideReviewParams,
  GetInvestigationParams,
  GetInvestigationResponse,
  GetRiskOverviewResponse,
  GetRiskNetworkResponse,
  GetRiskTransactionParams,
  GetRiskTransactionResponse,
  ListAuditEventsResponse,
  ListRiskTransactionsResponse,
} from "@workspace/api-zod";

type RiskTransaction = ReturnType<typeof buildTransactions>[number];

const transactions = buildTransactions();

const auditEvents = [
  {
    id: "AUD-1001",
    caseId: "TX-10482",
    timestamp: "2026-08-23T10:42:00Z",
    event: "Risk assessment created",
    actor: "RazorShield engine",
    note: "High-risk transaction routed to manual review.",
    decisionVersion: "risk-engine-v1.0",
  },
  {
    id: "AUD-1000",
    caseId: "TX-10467",
    timestamp: "2026-08-23T10:18:00Z",
    event: "Evidence pack generated",
    actor: "Risk investigator",
    note: "Evidence grounded in transaction, device, and customer history.",
    decisionVersion: "investigator-v1.0",
  },
];

function buildTransactions() {
  return [
    {
      transactionId: "TX-10482",
      customerId: "CUS-8831",
      merchantId: "MER-204",
      amount: 42800,
      currency: "INR",
      timestamp: "2026-08-23T10:38:00Z",
      riskScore: 93,
      riskLevel: "HIGH RISK",
      fraudProbability: 0.94,
      anomalyScore: 0.89,
      behaviorScore: 0.86,
      velocityScore: 0.91,
      graphScore: 0.82,
      decision: "TEMPORARY HOLD",
      status: "Needs review",
      factors: ["New device detected", "Amount is 8.4× customer baseline", "4 attempts in 10 minutes", "Device linked to 6 accounts"],
    },
    {
      transactionId: "TX-10467",
      customerId: "CUS-1182",
      merchantId: "MER-204",
      amount: 18900,
      currency: "INR",
      timestamp: "2026-08-23T10:18:00Z",
      riskScore: 78,
      riskLevel: "HIGH RISK",
      fraudProbability: 0.78,
      anomalyScore: 0.74,
      behaviorScore: 0.71,
      velocityScore: 0.68,
      graphScore: 0.9,
      decision: "MANUAL REVIEW",
      status: "Investigating",
      factors: ["Shared device across unrelated accounts", "High-risk entity cluster", "Unusual location change"],
    },
    {
      transactionId: "TX-10461",
      customerId: "CUS-4409",
      merchantId: "MER-118",
      amount: 7400,
      currency: "INR",
      timestamp: "2026-08-23T09:54:00Z",
      riskScore: 52,
      riskLevel: "MEDIUM RISK",
      fraudProbability: 0.41,
      anomalyScore: 0.62,
      behaviorScore: 0.48,
      velocityScore: 0.54,
      graphScore: 0.38,
      decision: "REQUEST VERIFICATION",
      status: "Needs review",
      factors: ["Recent failed attempts", "Amount above typical range"],
    },
    {
      transactionId: "TX-10432",
      customerId: "CUS-9920",
      merchantId: "MER-092",
      amount: 1250,
      currency: "INR",
      timestamp: "2026-08-23T09:32:00Z",
      riskScore: 18,
      riskLevel: "LOW RISK",
      fraudProbability: 0.04,
      anomalyScore: 0.11,
      behaviorScore: 0.16,
      velocityScore: 0.12,
      graphScore: 0.08,
      decision: "ALLOW",
      status: "Cleared",
      factors: ["Matches customer behavior", "Known device and location"],
    },
    {
      transactionId: "TX-10408",
      customerId: "CUS-2031",
      merchantId: "MER-204",
      amount: 9600,
      currency: "INR",
      timestamp: "2026-08-23T09:08:00Z",
      riskScore: 67,
      riskLevel: "MEDIUM RISK",
      fraudProbability: 0.56,
      anomalyScore: 0.58,
      behaviorScore: 0.64,
      velocityScore: 0.7,
      graphScore: 0.4,
      decision: "REQUEST VERIFICATION",
      status: "Needs review",
      factors: ["Velocity above merchant baseline", "New payment method"],
    },
  ];
}

function investigation(transaction: RiskTransaction) {
  return {
    transaction,
    summary: `Transaction ${transaction.transactionId} is ${transaction.riskLevel.toLowerCase()} with a fused risk score of ${transaction.riskScore}/100. The recommendation is based on verified transaction, behavior, velocity, and relationship signals.`,
    confidence: transaction.riskScore / 100,
    recommendation: transaction.decision,
    missingInformation: ["Delivery confirmation", "Customer verification outcome"],
    facts: transaction.factors.map((factor) => `Observed: ${factor}.`),
    inferences: ["The combined signals are consistent with elevated payment risk.", "Relationship signals increase the priority of human review."],
    recommendations: ["Keep the transaction in review until customer verification is complete.", "Preserve the evidence pack and record the reviewer decision."],
    evidence: [
      { label: "Risk engine", value: `${transaction.riskScore}/100 · ${transaction.riskLevel}`, source: "Risk fusion v1.0" },
      { label: "Fraud probability", value: `${Math.round(transaction.fraudProbability * 100)}%`, source: "Supervised model v1.0" },
      { label: "Behavior deviation", value: `${Math.round(transaction.behaviorScore * 100)}%`, source: "Behavioral engine v1.0" },
      { label: "Relationship signal", value: `${Math.round(transaction.graphScore * 100)}%`, source: "Entity graph snapshot" },
    ],
  };
}

const router: IRouter = Router();

router.get("/risk/overview", (_req, res) => {
  res.json(GetRiskOverviewResponse.parse({
    transactionsAnalyzed: 12480,
    highRisk: 184,
    fraudDetected: 67,
    preventedLoss: 2840000,
    activeInvestigations: 23,
    averageRiskScore: 34,
    fraudRate: 0.54,
    spikeStatus: "Elevated",
    trend: [
      { label: "08:00", risk: 28, volume: 52 },
      { label: "09:00", risk: 32, volume: 61 },
      { label: "10:00", risk: 48, volume: 88 },
      { label: "11:00", risk: 42, volume: 74 },
      { label: "12:00", risk: 36, volume: 69 },
      { label: "13:00", risk: 34, volume: 63 },
    ],
  }));
});

router.get("/risk/transactions", (_req, res) => {
  res.json(ListRiskTransactionsResponse.parse(transactions));
});

router.get("/risk/transactions/:transactionId", (req, res) => {
  const params = GetRiskTransactionParams.parse(req.params);
  const item = transactions.find((transaction) => transaction.transactionId === params.transactionId);
  if (!item) return res.status(404).json({ error: "Transaction not found" });
  return res.json(GetRiskTransactionResponse.parse(item));
});

router.get("/investigations/:transactionId", (req, res) => {
  const params = GetInvestigationParams.parse(req.params);
  const item = transactions.find((transaction) => transaction.transactionId === params.transactionId) ?? transactions[0];
  return res.json(GetInvestigationResponse.parse(investigation(item)));
});

router.get("/risk/network", (_req, res) => {
  res.json(GetRiskNetworkResponse.parse({
    clusterCount: 3,
    nodes: [
      { id: "cus-8831", label: "CUS-8831", type: "Customer", risk: 0.86 },
      { id: "dev-77a", label: "Device 77A", type: "Device", risk: 0.92 },
      { id: "cus-1182", label: "CUS-1182", type: "Customer", risk: 0.78 },
      { id: "ip-201", label: "IP 201", type: "Network", risk: 0.72 },
      { id: "mer-204", label: "MER-204", type: "Merchant", risk: 0.32 },
      { id: "cus-2031", label: "CUS-2031", type: "Customer", risk: 0.54 },
    ],
    links: [
      { source: "cus-8831", target: "dev-77a" },
      { source: "cus-1182", target: "dev-77a" },
      { source: "cus-1182", target: "ip-201" },
      { source: "cus-8831", target: "ip-201" },
      { source: "dev-77a", target: "mer-204" },
      { source: "cus-2031", target: "mer-204" },
    ],
  }));
});

router.post("/risk/reviews/:caseId/decision", (req, res) => {
  const params = DecideReviewParams.parse(req.params);
  const body = DecideReviewBody.parse(req.body);
  const event = {
    id: `AUD-${1002 + auditEvents.length}`,
    caseId: params.caseId,
    timestamp: new Date().toISOString(),
    event: `Human decision: ${body.decision}`,
    actor: "Risk analyst",
    note: body.note ?? "Decision recorded from review queue.",
    decisionVersion: "review-policy-v1.0",
  };
  auditEvents.unshift(event);
  return res.json(event);
});

router.get("/risk/audit", (_req, res) => {
  res.json(ListAuditEventsResponse.parse(auditEvents));
});

export default router;