import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const cases = JSON.parse(readFileSync(
  new URL("../../../backend/tests/golden_transactions/cases.json", import.meta.url), "utf8",
));

test("submission rehearsal: low/high risk, parties, bounded investigation, human review and audit", async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const login = await request.post("/api/v1/auth/login", {
    data: { identifier: "analyst@razorshield.demo", password: "Analyst-RazorShield-2026!" },
  });
  expect(login.ok()).toBeTruthy();
  const auth = await login.json();
  const headers = { Authorization: `Bearer ${auth.access_token}` };
  const transactionIds = {
    LOW: `SUBMISSION-LOW-R${testInfo.retry}`,
    HIGH: `SUBMISSION-HIGH-R${testInfo.retry}`,
  } as const;
  const results = [];
  for (const [id, suffix, expectedLevels] of [
    ["normal_transaction", "LOW", ["LOW", "MEDIUM"]],
    ["suspicious_high_value", "HIGH", ["HIGH"]],
  ] as const) {
    const fixture = cases.find((item: { id: string }) => item.id === id);
    const result = await request.post("/api/v1/risk/assess", {
      headers,
      data: {
        ...fixture.input,
        transaction_id: transactionIds[suffix],
        customer_id: `SUBMISSION-CUSTOMER-${suffix}`,
        merchant_id: auth.user.merchant_id,
        customer_name: "Mira Demo",
        customer_email: "mira@example.invalid",
        sender_account_reference: "DEMO-SENDER-001",
        sender_bank_name: "Synthetic Sender Bank",
        sender_bank_ifsc: "DEMO0000001",
        recipient_name: suffix === "LOW" ? "Demo Utility" : "Demo Unknown Recipient",
        recipient_account_reference: `DEMO-RECEIVER-${suffix}`,
        recipient_bank_name: "Synthetic Receiver Bank",
        recipient_bank_ifsc: "DEMO0000002",
        recipient_email: "receiver@example.invalid",
        // Missing device/location is uncertainty, not novelty. Only the
        // suspicious case asserts a newly observed device and location.
        device_id: suffix === "HIGH" ? "DEMO-DEVICE-HIGH" : undefined,
        location: suffix === "HIGH" ? "Mumbai" : undefined,
      },
    });
    expect(result.status()).toBe(201);
    const body = await result.json();
    expect(expectedLevels).toContain(body.risk_level);
    if (suffix === "LOW") {
      expect(body.uncertainty.status).toBe("LIMITED_HISTORY");
      expect(body.feature_provenance.recipient_verified.resolution).toBe(
        "PROTECTIVE_ASSERTION_NOT_ADMITTED_FOR_SCORING",
      );
    }
    expect(body.model_provenance).toBe("SYNTHETIC");
    results.push(body);
  }
  expect(results[1].recommended_action).toBe("MANUAL_REVIEW");
  await testInfo.attach("synthetic-assessments", { body: JSON.stringify(results, null, 2), contentType: "application/json" });

  await page.goto("/");
  await page.getByRole("textbox", { name: "Email or phone number", exact: true }).fill("reviewer@razorshield.demo");
  await page.getByRole("textbox", { name: "Password Show password", exact: true }).fill("Reviewer-RazorShield-2026!");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Risk overview", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dashboard.png") });

  await page.goto(`/investigations/${transactionIds.LOW}`);
  await expect(page.getByRole("heading", { name: "Evidence review", exact: true })).toBeVisible();
  await expect(page.getByText("Funds flow", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("low-risk.png") });

  const agentResponse = page.waitForResponse(response =>
    response.url().includes(`/agent/investigate/${transactionIds.HIGH}`) && response.request().method() === "POST");
  await page.goto(`/investigations/${transactionIds.HIGH}`);
  const agent = await (await agentResponse).json();
  expect(agent.executedFinancialAction).toBe(false);
  expect(agent.recommendation).toBe("MANUAL_REVIEW");
  expect(agent.missingInformation.length).toBeGreaterThan(0);
  expect(agent.toolTrace.length).toBeGreaterThan(0);
  await expect(page.getByText("DEMO-SENDER-001", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Funds flow from customer").getByText("DEMO-RECEIVER-HIGH", { exact: true })).toBeVisible();
  await expect(page.getByText("Financial action executed: no", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("high-risk.png") });
  await page.getByLabel("Funds flow from customer").screenshot({ path: testInfo.outputPath("sender-receiver.png") });
  await page.getByText("Financial action executed: no", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("investigation.png") });

  await page.getByTestId("input-review-note").fill("Synthetic rehearsal: receiver verification is missing; escalate for evidence. No financial action authorized.");
  await page.getByTestId("button-decision-escalate").click();
  await expect(page.getByTestId("status-review-feedback")).toContainText(/escalat/i);
  await page.getByTestId("status-review-feedback").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("human-decision.png") });

  const timeline = await request.get(`/api/v1/cases/${agent.caseId}/timeline`, { headers });
  expect(timeline.ok()).toBeTruthy();
  expect((await timeline.json()).map((item: { event: string }) => item.event)).toEqual(expect.arrayContaining([
    "Transaction received", "Risk assessment completed", "Bounded Investigation Completed", "Human Decision Escalated",
  ]));
  await page.getByRole("link", { name: "Verify audit event", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Audit trail", exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="audit-event-"]').filter({ hasText: `CASE-${transactionIds.HIGH}` }).filter({ hasText: "Human Decision Escalated" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("audit.png") });
  // Reviewer navigation intentionally excludes monitoring. Use the analyst role for it.
  await expect(page.getByRole("link", { name: "Model monitoring", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("textbox", { name: "Email or phone number", exact: true }).fill("analyst@razorshield.demo");
  await page.getByRole("textbox", { name: "Password Show password", exact: true }).fill("Analyst-RazorShield-2026!");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Risk overview", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Model monitoring", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Model monitoring", exact: true })).toBeVisible();
  await expect(page.getByText("fusion-v3", { exact: true })).toBeVisible();
  await expect(page.getByTestId("status-query-error")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("monitoring.png") });
});
