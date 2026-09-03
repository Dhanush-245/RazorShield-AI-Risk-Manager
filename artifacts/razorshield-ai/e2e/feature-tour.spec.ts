import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Opt-in recording, isolated by playwright.config.ts. Never target a merchant DB.
test("authentication-first feature tour", async ({ page }, testInfo) => {
  test.skip(
    process.env.RAZORSHIELD_RECORD_FEATURE_TOUR !== "1",
    "Explicit recording opt-in required",
  );
  test.setTimeout(420_000);
  page.setDefaultTimeout(12_000);
  const fast = process.env.RAZORSHIELD_TOUR_FAST === "1";
  const chapters: Array<{
    start: number;
    end: number;
    title: string;
    caption: string;
  }> = [];
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Recording annotations only: no application source, evidence or scores changed.
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const footer = document.createElement("aside");
      footer.id = "recording-caption";
      footer.style.cssText =
        "position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#101d2c;color:#fff;padding:17px 32px;font:22px/1.4 system-ui;box-shadow:0 -2px 12px #0003;pointer-events:none;min-height:76px";
      footer.textContent =
        sessionStorage.getItem("recording-caption") ??
        "RAZORSHIELD AI · Track 02 — AI Risk Manager · Fictional-data demo";
      document.body.appendChild(footer);
      const style = document.createElement("style");
      style.textContent =
        "body {padding-bottom:125px!important} html {scroll-padding-bottom:150px!important;scroll-padding-top:110px!important}";
      document.head.appendChild(style);
    });
  });
  await page.goto("/");
  const started = Date.now();
  async function caption(text: string) {
    await page.evaluate((value) => {
      sessionStorage.setItem("recording-caption", value);
      const footer = document.getElementById("recording-caption");
      if (footer) footer.textContent = value;
    }, text);
  }
  async function pause(ms = 1800) {
    if (!fast) await page.waitForTimeout(ms);
  }
  async function chapter(
    title: string,
    seconds: number,
    text: string,
    action: () => Promise<void>,
  ) {
    const start = (Date.now() - started) / 1000;
    await caption(`${title}  |  ${text}`);
    await action();
    await expect(page.getByTestId("status-query-error")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(
        `${String(chapters.length + 1).padStart(2, "0")}.png`,
      ),
    });
    const remaining = seconds * 1000 - (Date.now() - started - start * 1000);
    if (!fast && remaining > 0) await page.waitForTimeout(remaining);
    chapters.push({
      start,
      end: (Date.now() - started) / 1000,
      title,
      caption: text,
    });
    console.log(`Tour chapter complete: ${title}`);
  }
  async function login(role: "admin" | "reviewer" | "viewer") {
    const name = role[0].toUpperCase() + role.slice(1);
    await page
      .getByRole("textbox", { name: "Email or phone number", exact: true })
      .fill(`${role}@razorshield.demo`);
    await page
      .getByRole("textbox", { name: "Password Show password", exact: true })
      .fill(`${name}-RazorShield-2026!`);
    await pause(1200);
    await page.getByRole("button", { name: "Login", exact: true }).click();
    await expect(
      page.getByText("Risk overview", { exact: true }),
    ).toBeVisible();
  }
  async function visit(route: string, heading: string) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await pause(1000);
  }
  async function fill(fields: Record<string, string>) {
    for (const [label, value] of Object.entries(fields))
      await page.getByLabel(label, { exact: true }).fill(value);
  }
  async function assess(expected: "LOW" | "HIGH") {
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/risk/assess") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Submit transaction", exact: true })
      .click();
    const result = await response;
    expect(result.status()).toBe(201);
    const body = await result.json();
    expect(body.risk_level).toBe(expected);
    expect(body.model_provenance).toBe("SYNTHETIC");
    if (expected === "HIGH")
      expect(body.recommended_action).toBe("MANUAL_REVIEW");
    await page
      .getByRole("heading", {
        name: body.recommended_action.replaceAll("_", " "),
        exact: true,
      })
      .scrollIntoViewIfNeeded();
    await caption(
      `${expected} RISK · Observed score ${body.risk_score}/100 | ${expected === "LOW" ? "Familiar utility-payment context." : "Unfamiliar recipient, elevated velocity and amount deviation. Human review—not a financial action."}`,
    );
    return body;
  }

  await chapter(
    "01 · Merchant authentication",
    20,
    "RazorShield AI helps merchants investigate risk—not act on a score alone. Four permission levels; passwords stay masked.",
    async () => {
      await expect(
        page.getByRole("heading", { name: "Merchant access", exact: true }),
      ).toBeVisible();
      await pause(7000);
      await login("admin");
    },
  );
  await chapter(
    "02 · Risk overview",
    14,
    "What is happening? What is dangerous? Why? What needs a human? This dashboard summarizes the active dataset.",
    async () => {
      await expect(
        page.getByText("Transactions analyzed", { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Notifications", exact: true })
        .click();
      await pause(2000);
      await page
        .getByRole("button", { name: "Close notifications", exact: true })
        .click();
    },
  );
  await chapter(
    "03 · Dataset ingestion",
    20,
    "Upload: 24 fictional records with customer names, sender/receiver accounts, bank references and behavioral context. Not training data.",
    async () => {
      await visit("/datasets", "Dataset analysis");
      await page
        .locator('input[type="file"]')
        .setInputFiles(
          fileURLToPath(
            new URL(
              "../../../examples/complete-party-details.csv",
              import.meta.url,
            ),
          ),
        );
      await expect(
        page.getByText(/24 rows converted, scored, and stored/),
      ).toBeVisible({ timeout: 60_000 });
      await page
        .getByText("Schema conversion report", { exact: true })
        .scrollIntoViewIfNeeded();
    },
  );
  await chapter(
    "04 · Transaction ledger",
    10,
    "API, upload and manual assessment feed the same risk workflow. The ledger keeps transaction IDs and evidence connected.",
    async () => {
      await visit("/transactions", "Transactions");
      await expect(
        page.getByText("FULL-TX-0002", { exact: true }).first(),
      ).toBeVisible();
    },
  );
  await chapter(
    "05 · Assess a normal payment",
    20,
    "A familiar, verified utility recipient and ordinary activity should not be treated like suspicious behavior.",
    async () => {
      await page.goto("/assess");
      await fill({
        "Transaction ID": "TOUR-NORMAL",
        "Customer ID": "TOUR-CUSTOMER-NORMAL",
        "Amount (INR)": "2000",
        "Customer average": "2500",
        "Device ID": "TOUR-FAMILIAR",
        Location: "Hyderabad",
        "Payment method": "Card",
        "Transactions / 5 min": "1",
        "Transactions / 15 min": "1",
        "Transactions / hour": "2",
        "Failed attempts / 10 min": "0",
        "Shared device accounts": "0",
        "Historical return rate": "0.02",
      });
      await page
        .getByText("Customer, recipient, and transaction context", {
          exact: true,
        })
        .click();
      await fill({
        "Customer age": "35",
        "Account age (days)": "900",
        "Historical fraud outcomes": "0",
        "Recipient ID": "TOUR-UTILITY",
        "Recipient type": "UTILITY",
        "Recipient risk (0–1)": "0.05",
        "Recipient transaction count": "1",
        "Previous payments to recipient": "8",
        "Same-recipient payments / 15 min": "1",
        "Amount to recipient / hour": "2000",
        "Customers linked to recipient": "1",
        "Devices linked to recipient": "1",
      });
      await page
        .getByRole("combobox", { name: /^Recipient category/ })
        .selectOption("UTILITY");
      await page
        .getByRole("combobox", { name: /^Transaction intent/ })
        .selectOption("UTILITY");
      await page.getByLabel("Verified recipient", { exact: true }).check();
      await page.getByLabel("Recipient used before", { exact: true }).check();
      await page.getByLabel("New device", { exact: true }).uncheck();
      await page.getByLabel("New location", { exact: true }).uncheck();
      await assess("LOW");
    },
  );
  await chapter(
    "06 · Assess elevated risk",
    18,
    "Same pipeline, different evidence: unusually high value, new device/location, failures and an unverified recipient.",
    async () => {
      await fill({
        "Transaction ID": "TOUR-HIGH",
        "Customer ID": "TOUR-CUSTOMER-HIGH",
        "Amount (INR)": "120000",
        "Customer average": "5000",
        "Transactions / 5 min": "8",
        "Transactions / 15 min": "12",
        "Transactions / hour": "24",
        "Failed attempts / 10 min": "4",
        "Shared device accounts": "7",
        "Recipient ID": "TOUR-UNKNOWN",
        "Recipient type": "BUSINESS",
        "Recipient risk (0–1)": "0.93",
        "Previous payments to recipient": "0",
        "Same-recipient payments / 15 min": "8",
        "Amount to recipient / hour": "960000",
        "Customers linked to recipient": "37",
        "Devices linked to recipient": "19",
      });
      await page
        .getByRole("combobox", { name: /^Recipient category/ })
        .selectOption("UNKNOWN");
      await page
        .getByRole("combobox", { name: /^Transaction intent/ })
        .selectOption("UNKNOWN");
      await page.getByLabel("Verified recipient", { exact: true }).uncheck();
      await page.getByLabel("Recipient used before", { exact: true }).uncheck();
      await page.getByLabel("New device", { exact: true }).check();
      await page.getByLabel("New location", { exact: true }).check();
      // Current chargeback API assumes TX- IDs. Other formats are a known limitation,
      // documented in LIVE_TOUR_NARRATION.md; this is not a workaround in app code.
      await fill({ "Transaction ID": "TX-TOUR-HIGH" });
      await assess("HIGH");
    },
  );
  await chapter(
    "07 · Risk fusion and explanation",
    12,
    "Fraud + anomaly + behavior + velocity + graph + rules → fused risk. Unusual is not proof of fraud; contribution bars are not SHAP.",
    async () => {
      await page
        .getByRole("link", { name: "Open decision brief", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("heading", { name: "Evidence review", exact: true }),
      ).toBeVisible();
    },
  );
  await chapter(
    "08 · Sender and receiver evidence",
    18,
    "Who paid whom? Diya Patel → Rapid Digital Exchange. Names, account references, banks and contact details are fictional dataset evidence.",
    async () => {
      await visit("/investigations/FULL-TX-0002", "Evidence review");
      const flow = page.getByLabel("Funds flow from customer");
      await expect(
        flow.getByText("SYNTH-SEND-0002", { exact: true }),
      ).toBeVisible();
      await flow
        .getByText("SYNTH-SEND-0002", { exact: true })
        .scrollIntoViewIfNeeded();
      await pause(5500);
      await flow
        .getByText("SYNTH-RECV-1002", { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        flow.getByText("SYNTH-RECV-1002", { exact: true }),
      ).toBeVisible();
    },
  );
  await chapter(
    "09 · Bounded AI investigation",
    14,
    "The local investigator organizes observed facts, missing evidence and retrieved policy. Deterministic orchestration—not a production LLM service.",
    async () => {
      await page
        .getByText("Financial action executed: no", { exact: true })
        .scrollIntoViewIfNeeded();
      await expect(
        page.getByText("Financial action executed: no", { exact: true }),
      ).toBeVisible();
      await page.getByText(/Agent orchestration trace ·/).click();
    },
  );
  await chapter(
    "10 · Human review",
    18,
    "A reviewer—not the agent—records the decision. Escalate when recipient verification or other required evidence is missing.",
    async () => {
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await login("reviewer");
      await visit("/reviews", "Review queue");
      await pause(1500);
      await visit("/investigations/FULL-TX-0002", "Evidence review");
      await page
        .getByTestId("input-review-note")
        .fill(
          "Synthetic demo: escalate for recipient verification and missing evidence. No financial action authorized.",
        );
      await page.getByTestId("button-decision-escalate").click();
      await expect(page.getByTestId("status-review-feedback")).toContainText(
        /escalat/i,
      );
      await page.getByTestId("status-review-feedback").scrollIntoViewIfNeeded();
    },
  );
  await chapter(
    "11 · Audit trail",
    8,
    "Assessment, investigation and the human decision remain traceable. Escalation changes the case; it does not execute a payment.",
    async () => {
      await page
        .getByRole("link", { name: "Verify audit event", exact: true })
        .click();
      await expect(
        page.getByText("Human Decision Escalated", { exact: true }),
      ).toBeVisible();
    },
  );
  await chapter(
    "12 · Fraud intelligence",
    8,
    "Concentrations and repeated patterns help prioritize investigation. High risk is a review signal, not a guilty verdict.",
    async () => {
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await login("admin");
      await visit("/fraud-intelligence", "Fraud intelligence");
    },
  );
  await chapter(
    "13 · Risk network",
    8,
    "Inspect shared devices and recipient relationships. A connection is context, not proof of collusion.",
    async () => {
      await visit("/network", "Risk network");
    },
  );
  await chapter(
    "14 · Customer 360",
    8,
    "Customer history connects activity, known context and individual transactions for a human investigation.",
    async () => {
      await visit("/entities/customers/CUST-002", "Customer 360");
    },
  );
  await chapter(
    "15 · Return risk",
    8,
    "Return-risk signals remain distinct from payment fraud. Review the observed drivers and customer context.",
    async () => {
      await visit("/returns", "Return risk");
    },
  );
  await chapter(
    "16 · Chargeback evidence",
    14,
    "Draft → human review; no external submission. Known limitation: this action currently requires a TX-prefixed transaction ID.",
    async () => {
      await visit("/chargebacks", "Chargebacks");
      await page
        .getByRole("button", { name: "Generate evidence summary", exact: true })
        .click();
      await expect(
        page.getByText("Evidence summary generated from available sources.", {
          exact: true,
        }),
      ).toBeVisible();
      await pause(2200);
      await page
        .getByRole("button", { name: "Send for review", exact: true })
        .click();
      await expect(
        page.getByText(
          "Draft sent to human review. No external submission occurred.",
          { exact: true },
        ),
      ).toBeVisible();
    },
  );
  await chapter(
    "17 · Merchant analytics",
    6,
    "Portfolio and post-payment views follow the active dataset. Flagged value is not money actually saved.",
    async () => {
      await visit("/analytics", "Merchant analytics");
    },
  );
  await chapter(
    "18 · Model monitoring",
    16,
    "Deployed synthetic fusion: precision 36.23%, recall 52.22%, PR-AUC 41.18%. These are held-out synthetic results—not production accuracy.",
    async () => {
      await visit("/monitoring", "Model monitoring");
      await expect(page.getByText("fusion-v3", { exact: true })).toBeVisible();
      await page
        .getByText("fusion-v3", { exact: true })
        .scrollIntoViewIfNeeded();
    },
  );
  await chapter(
    "19 · Evaluation and business cost",
    16,
    "Separate IEEE-CIS candidate: precision 50.38%, recall 52.22%, PR-AUC 53.62%. Promotion rejected. Threshold choice trades fraud misses against review workload.",
    async () => {
      await visit("/evaluation", "Evaluation");
      await pause(5500);
      await page
        .getByText("Threshold behavior", { exact: true })
        .scrollIntoViewIfNeeded();
    },
  );
  await chapter(
    "20 · Policies and settings",
    10,
    "Admin controls configure merchant thresholds and policy grounding. The agent remains defense-only; no rules or models are changed in this tour.",
    async () => {
      await visit("/settings", "Settings");
      await page.getByText(/Merchant thresholds · v/).scrollIntoViewIfNeeded();
    },
  );
  await chapter(
    "21 · Read-only access",
    8,
    "Viewer access supports observation, without assessment or review actions. Role restrictions are also enforced by the backend.",
    async () => {
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await login("viewer");
      await expect(page.getByTestId("link-nav-assess-transaction")).toHaveCount(
        0,
      );
      await expect(page.getByTestId("link-nav-review-queue")).toHaveCount(0);
    },
  );
  await chapter(
    "22 · Buildathon pitch / what broke",
    26,
    "Track 02 · AI Risk Manager · Public source · Honest evaluation · Human control",
    async () => {
      // Explicit presentation card, not an application screen or fabricated test output.
      await page.setContent(
        `<html><body style="margin:0;background:#101d2c;color:#f7f5ef;font:25px/1.45 system-ui;padding:60px 75px;box-sizing:border-box"><p style="color:#77d3bd;font-size:18px;letter-spacing:3px">BUILDATHON PITCH SUMMARY · PRESENTATION CARD</p><h1 style="font-size:58px;margin:15px 0">RazorShield AI</h1><p>Track 02 — AI Risk Manager<br>Merchant evidence → risk fusion → investigation → human review → audit</p><h2 style="font-size:30px;color:#77d3bd">What broke—and how we got out</h2><p>PostgreSQL created <code>user_role</code> twice: explicitly in the migration,<br>then implicitly through SQLAlchemy's table hook.</p><p>Fix: PostgreSQL ENUM with <code>create_type=False</code>, retaining checked lifecycle calls.<br>Regression coverage: fresh DB, existing state, preserved users, downgrade / re-upgrade.</p><p style="font-size:23px">Local validation: 70 backend/ML tests + 2 earlier browser tests passed.<br>Remote CI still needs a new passing run. No production-readiness claim.</p><p style="font-size:23px;color:#ffd590">Cost example: ₹100 false positive · ₹5,000 missed fraud · ₹50 review.<br>IEEE cost-optimal profile reviews 21.05%—above the 5% capacity limit.</p><p style="font-size:23px;margin-top:26px">Public repository:<br><b>github.com/Dhanush-245/RazorShield-AI-Risk-Manager</b></p></body></html>`,
      );
    },
  );
  await testInfo.attach("feature-tour-chapters", {
    body: JSON.stringify(chapters, null, 2),
    contentType: "application/json",
  });
});
