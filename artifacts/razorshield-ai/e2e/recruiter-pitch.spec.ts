import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test.beforeAll(async ({ request }) => {
  const datasetPath = process.env.RAZORSHIELD_RECRUITER_DATASET;
  if (!datasetPath) return;

  const [header, ...lines] = readFileSync(datasetPath, "utf8")
    .trim()
    .split(/\r?\n/);
  const columns = header.split(",");
  const transactions = lines.map((line) =>
    Object.fromEntries(
      line.split(",").map((value, index) => [columns[index], value]),
    ),
  );

  const login = await request.post("/api/v1/auth/login", {
    data: {
      identifier: "admin@razorshield.demo",
      password: "Admin-RazorShield-2026!",
    },
  });
  expect(login.status()).toBe(200);
  const { access_token: accessToken } = await login.json();
  const upload = await request.post("/api/v1/risk/assess/batch", {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      dataset_name: "RazorShield 1,000-transaction validation dataset",
      transactions,
    },
    timeout: 180_000,
  });
  expect(upload.status()).toBe(201);
  expect((await upload.json()).processed).toBe(1_000);
});

test("five-minute recruiter pitch", async ({ page }, testInfo) => {
  test.skip(
    process.env.RAZORSHIELD_RECORD_RECRUITER_PITCH !== "1",
    "Explicit recruiter-pitch recording opt-in required",
  );
  // Video timestamps can advance faster than wall time on resource-constrained
  // macOS capture hosts. Keep the assertion ceiling independent from the final
  // five-minute export, which is normalized and verified after recording.
  test.setTimeout(1_200_000);
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({
    width: Number(process.env.RAZORSHIELD_E2E_VIDEO_WIDTH ?? 1440),
    height: Number(process.env.RAZORSHIELD_E2E_VIDEO_HEIGHT ?? 1000),
  });

  const paced = process.env.RAZORSHIELD_RECRUITER_PITCH_PACED !== "0";
  const durations = paced
    ? [15, 15, 50, 30, 30, 30, 40, 30, 30, 15, 15]
    : Array(11).fill(0);
  const chapters: Array<{ start: number; end: number; title: string }> = [];
  const started = Date.now();
  const transactionId = `DEMO-RISK-R${testInfo.retry}`;
  const customerId = `DEMO-CUSTOMER-R${testInfo.retry}`;

  async function chapter(
    index: number,
    title: string,
    action: () => Promise<void>,
  ) {
    const start = (Date.now() - started) / 1000;
    await action();
    const remaining =
      durations[index] * 1000 - (Date.now() - started - start * 1000);
    if (remaining > 0) await page.waitForTimeout(remaining);
    chapters.push({ start, end: (Date.now() - started) / 1000, title });
  }

  async function visit(route: string, heading: string) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("status-query-error")).toHaveCount(0);
  }

  await page.goto("/");
  await chapter(0, "Problem and product", async () => {
    await page
      .getByRole("textbox", { name: "Email or phone number", exact: true })
      .fill("admin@razorshield.demo");
    await page
      .getByRole("textbox", { name: "Password Show password", exact: true })
      .fill("Admin-RazorShield-2026!");
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(
      page.getByText("Risk overview", { exact: true }),
    ).toBeVisible();
    if (process.env.RAZORSHIELD_RECRUITER_DATASET) {
      await expect(
        page.getByText("Transactions analyzed", { exact: true }).locator(".."),
      ).toContainText("1K");
    }
    await page
      .getByRole("heading", { name: "Risk intensity", exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByLabel("Risk trend chart", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", {
        name: "Password Show password",
        exact: true,
      }),
    ).toHaveCount(0);
  });

  await chapter(1, "Architecture and decision boundary", async () => {
    await page.setContent(`
      <main style="box-sizing:border-box;min-height:100vh;padding:54px 72px;background:#101d2c;color:#f7f5ef;font-family:Arial,sans-serif">
        <p style="margin:0;color:#77d3bd;font-size:15px;font-weight:700;letter-spacing:.2em">RAZORSHIELD AI · VERIFIED SYSTEM MAP</p>
        <h1 style="margin:12px 0 26px;font-size:45px;letter-spacing:-.04em">Evidence to an auditable decision</h1>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:13px;align-items:center;text-align:center">
          <section style="border:1px solid #77d3bd;padding:20px">TRANSACTION<br><small>API · CSV · manual</small></section><b>→</b>
          <section style="border:1px solid #77d3bd;padding:20px">FEATURES<br><small>trusted provenance</small></section><b>→</b>
          <section style="border:1px solid #e1a95f;padding:20px">RISK ENGINES<br><small>fraud · anomaly · behavior</small></section>
        </div>
        <div style="margin:20px 0;display:grid;grid-template-columns:repeat(5,1fr);gap:13px;align-items:center;text-align:center">
          <section style="border:1px solid #e1a95f;padding:20px">VELOCITY<br><small>graph · rules</small></section><b>→</b>
          <section style="border:1px solid #e1a95f;padding:20px">LEARNED FUSION<br><small>LOW · MEDIUM · HIGH</small></section><b>→</b>
          <section style="border:1px solid #77d3bd;padding:20px">EXPLANATION<br><small>evidence · policy · missing</small></section>
        </div>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:13px;align-items:center;text-align:center">
          <section style="border:1px solid #77d3bd;padding:20px">BOUNDED COPILOT<br><small>summarizes, never scores</small></section><b>→</b>
          <section style="border:2px solid #f07d5a;padding:20px">HUMAN REVIEW<br><small>authorized decision</small></section><b>→</b>
          <section style="border:1px solid #77d3bd;padding:20px">AUDIT + MONITOR<br><small>feedback · drift · replay</small></section>
        </div>
        <p style="margin-top:30px;color:#bdc7cf;font-size:17px">React + TypeScript · FastAPI + SQLAlchemy · PostgreSQL · scikit-learn · Docker · GitHub Actions</p>
      </main>
    `);
  });

  await chapter(2, "Suspicious transaction detection", async () => {
    await visit("/assess", "Risk assessment");
    for (const [label, value] of Object.entries({
      "Transaction ID": transactionId,
      "Customer ID": customerId,
      "Event timestamp (UTC)": "2026-01-01T13:00",
      "Amount (INR)": "60000",
      "Customer average": "20000",
      "Device ID": "DEMO-NEW-DEVICE-01",
      Location: "Delhi",
      "Transactions / 5 min": "5",
      "Transactions / 15 min": "7",
      "Transactions / hour": "15",
      "Failed attempts / 10 min": "1",
      "Shared device accounts": "1",
      "Historical return rate": "0",
    }))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page
      .getByText("Customer, recipient, and transaction context", {
        exact: true,
      })
      .click();
    await page
      .getByLabel("Recipient ID", { exact: true })
      .fill("DEMO-RECIPIENT-NEW");
    for (const [label, value] of Object.entries({
      "Account age (days)": "900",
      "Historical fraud outcomes": "0",
      "Recipient type": "UNKNOWN",
      "Recipient transaction count": "0",
      "Previous payments to recipient": "0",
      "Same-recipient payments / 15 min": "5",
      "Amount to recipient / hour": "0",
      "Customers linked to recipient": "0",
      "Devices linked to recipient": "0",
    }))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page
      .locator("label")
      .filter({ hasText: "Recipient category" })
      .locator("select")
      .selectOption("UNKNOWN");
    await page
      .locator("label")
      .filter({ hasText: "Transaction intent" })
      .locator("select")
      .selectOption("UNKNOWN");
    await page.getByLabel("Recipient risk (0–1)", { exact: true }).fill("0.2");
    await page.getByLabel("Verified recipient", { exact: true }).uncheck();
    await page.getByLabel("Recipient used before", { exact: true }).uncheck();
    await page.getByLabel("New device", { exact: true }).check();
    await page.getByLabel("New location", { exact: true }).check();
    const pending = page.waitForResponse(
      (response) =>
        response.url().endsWith("/risk/assess") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Submit transaction", exact: true })
      .click();
    const response = await pending;
    expect(response.status()).toBe(201);
    const result = await response.json();
    expect(result.risk_level).toBe("HIGH");
    expect(result.risk_score).toBe(98);
    await page
      .getByRole("heading", { name: "MANUAL REVIEW", exact: true })
      .scrollIntoViewIfNeeded();
  });

  await chapter(3, "Explainability and behavior", async () => {
    await page
      .getByText("Advanced model evidence · read only", { exact: true })
      .click();
    await page
      .getByText("Why is this transaction risky?", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByRole("heading", { name: "Signal contribution", exact: true }),
    ).toBeVisible();
    if (paced) await page.waitForTimeout(12_000);
    await visit("/network", "Risk network");
    await page
      .getByText("Relationship map", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText(/active links/, { exact: false }).first(),
    ).toBeVisible();
  });

  await chapter(4, "Legitimate high-value context", async () => {
    await visit("/simulator", "Risk simulator");
    await page
      .getByRole("button", { name: "Education payment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Simulate risk", exact: true })
      .click();
    await expect(page.getByText("LOW RISK", { exact: true })).toBeVisible();
    await expect(page.getByTestId("simulation-score")).toContainText("5 / 100");
    await page
      .getByText("Protective evidence — why not automatically fraud?")
      .click();
  });

  await chapter(5, "Simulator and counterfactuals", async () => {
    await visit(
      `/investigations/${encodeURIComponent(transactionId)}`,
      "Evidence review",
    );
    await page.getByTestId("decision-workbench").scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: "What would change?", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Run counterfactual analysis", exact: true })
      .click();
    await expect(page.getByText("Stored score:")).toBeVisible();
    const velocityRow = page
      .getByRole("row")
      .filter({ hasText: "Velocity normal" });
    await expect(velocityRow).toContainText("82");
    await expect(velocityRow).toContainText("-16");
    const combinedRow = page
      .getByRole("row")
      .filter({ hasText: "All four assumptions" });
    await expect(combinedRow).toContainText("22");
    await expect(combinedRow).toContainText("-76");
    await expect(combinedRow).toContainText("LOW");
    await combinedRow.scrollIntoViewIfNeeded();
  });

  await chapter(6, "AI-assisted investigation and policy", async () => {
    await page.goto(`/investigations/${encodeURIComponent(transactionId)}`);
    await expect(
      page.getByText("Financial action executed: no", { exact: true }),
    ).toBeVisible();
    await page
      .getByText("Retrieved company policy · RAG", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText("High-risk transaction review policy", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Agent orchestration trace ·/)).toBeVisible();
  });

  await chapter(7, "Human review and audit", async () => {
    await page.getByTestId("decision-workbench").scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: "Human vs model", exact: true })
      .click();
    await page
      .getByLabel("Evidence-based reviewer reason", { exact: true })
      .fill(
        "Recipient relationship and verification evidence need another reviewer.",
      );
    await page
      .getByRole("button", { name: "Escalate case", exact: true })
      .click();
    await expect(
      page.getByText("Case: ESCALATED", { exact: true }),
    ).toBeVisible();
    await visit("/audit", "Audit trail");
    await expect(
      page
        .locator('[data-testid^="audit-event-"]')
        .filter({ hasText: transactionId })
        .first(),
    ).toBeVisible();
  });

  await chapter(8, "Held-out metrics and business cost", async () => {
    await visit("/operations", "Risk operations");
    await expect(
      page.getByText("Deployed fusion — held-out evaluation", { exact: true }),
    ).toBeVisible();
    const metricsPanel = page
      .getByText("Deployed fusion — held-out evaluation", { exact: true })
      .locator("..");
    for (const [label, value] of [
      ["Precision", "36.23%"],
      ["Recall", "52.22%"],
      ["F1", "42.78%"],
      ["PR-AUC", "41.18%"],
      ["ROC-AUC", "81.35%"],
      ["False-positive rate", "9.95%"],
    ]) {
      await expect(
        metricsPanel.getByText(label, { exact: true }).locator(".."),
      ).toContainText(value);
    }
    await expect(
      page.getByText("Synthetic training is not real-world validation.", {
        exact: false,
      }),
    ).toBeVisible();
    const confusion = page
      .getByRole("heading", {
        name: "Locked-test confusion matrix",
        exact: true,
      })
      .locator("..");
    await expect(confusion).toContainText("TN 9,751");
    await expect(confusion).toContainText("FP 1,077");
    await expect(confusion).toContainText("FN 560");
    await expect(confusion).toContainText("TP 612");
    if (paced) await page.waitForTimeout(11_000);
    await page
      .getByRole("button", { name: "Business impact", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Evaluate policy", exact: true })
      .click();
    await expect(
      page.getByText("Operating-point comparison", { exact: true }),
    ).toBeVisible();
  });

  await chapter(9, "Security and reliability", async () => {
    await visit("/settings", "Settings");
    await expect(
      page.getByRole("heading", { name: "Agent safety", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Authenticated profile", { exact: true }),
    ).toBeVisible();
  });

  await chapter(10, "What broke and how it was fixed", async () => {
    await visit("/operations", "Risk operations");
    await page
      .getByRole("button", { name: "Engineering decisions", exact: true })
      .click();
    await expect(
      page.getByText("PostgreSQL enum ownership", { exact: true }),
    ).toBeVisible();
  });

  const elapsed = Date.now() - started;
  if (paced && elapsed < 300_000) await page.waitForTimeout(300_000 - elapsed);
  testInfo.attach("chapters", {
    body: Buffer.from(JSON.stringify(chapters, null, 2)),
    contentType: "application/json",
  });
});
