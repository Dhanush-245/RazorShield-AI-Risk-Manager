import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

// The same test is a fast regression by default and a five-minute, caption-free recording when opted in.
test("risk operations story: evidence, simulation, human judgment and monitoring", async ({
  page,
}, testInfo) => {
  const recording = process.env.RAZORSHIELD_RECORD_OPERATIONS_DEMO === "1";
  test.setTimeout(recording ? 420_000 : 120_000);
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const durations = [20, 25, 30, 27, 23, 28, 25, 28, 19, 25, 25, 25];
  const chapters: { start: number; end: number; title: string }[] = [];
  const started = Date.now();
  async function pause(ms: number) {
    if (recording) await page.waitForTimeout(ms);
  }
  async function chapter(
    index: number,
    title: string,
    action: () => Promise<void>,
  ) {
    const start = (Date.now() - started) / 1000;
    await action();
    await expect(page.getByTestId("status-query-error")).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${String(index + 1).padStart(2, "0")}.png`),
    });
    const remaining =
      durations[index] * 1000 - (Date.now() - started - start * 1000);
    if (recording && remaining > 0) await page.waitForTimeout(remaining);
    chapters.push({ start, end: (Date.now() - started) / 1000, title });
  }
  async function visit(route: string, heading: string) {
    await page.goto(route);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
  }
  async function login() {
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
  }
  await page.goto("/");
  await chapter(0, "Merchant access and the operating problem", async () => {
    await expect(
      page.getByRole("heading", { name: "Merchant access", exact: true }),
    ).toBeVisible();
    await pause(8500);
    await login();
  });
  await chapter(
    1,
    "Fictional dataset ingestion and live overview",
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
      await pause(6500);
      await visit("/", "Risk overview");
    },
  );
  await chapter(2, "Live suspicious transaction", async () => {
    await page.goto("/assess");
    for (const [label, value] of Object.entries({
      "Transaction ID": "TX-OPS-LIVE",
      "Customer ID": "OPS-LIVE-CUSTOMER",
      "Amount (INR)": "120000",
      "Customer average": "5000",
      "Device ID": "OPS-NEW-DEVICE",
      Location: "Delhi",
      "Transactions / 5 min": "8",
      "Transactions / 15 min": "12",
      "Transactions / hour": "24",
      "Failed attempts / 10 min": "4",
      "Shared device accounts": "7",
    }))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel("New device", { exact: true }).check();
    await page.getByLabel("New location", { exact: true }).check();
    const pending = page.waitForResponse(
      (r) =>
        r.url().endsWith("/risk/assess") && r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Submit transaction", exact: true })
      .click();
    const response = await pending;
    expect(response.status()).toBe(201);
    expect((await response.json()).risk_level).toBe("HIGH");
    await page
      .getByRole("heading", { name: "MANUAL REVIEW", exact: true })
      .scrollIntoViewIfNeeded();
  });
  await chapter(
    3,
    "Recorded parties, evidence and investigation timeline",
    async () => {
      await visit("/investigations/FULL-TX-0002", "Evidence review");
      const flow = page.getByLabel("Funds flow from customer");
      await expect(
        flow.getByText("SYNTH-SEND-0002", { exact: true }),
      ).toBeVisible();
      await expect(
        flow.getByText("SYNTH-RECV-1002", { exact: true }),
      ).toBeVisible();
      await pause(5000);
      await page.getByTestId("decision-workbench").scrollIntoViewIfNeeded();
      await expect(
        page.getByText("Recorded decision trail", { exact: true }),
      ).toBeVisible();
    },
  );
  await chapter(4, "Bounded AI investigator", async () => {
    await page
      .getByText("Financial action executed: no", { exact: true })
      .scrollIntoViewIfNeeded();
    await expect(
      page.getByText("Financial action executed: no", { exact: true }),
    ).toBeVisible();
    await page.getByText(/Agent orchestration trace ·/).click();
  });
  await chapter(5, "Counterfactual sensitivity analysis", async () => {
    await page.getByTestId("decision-workbench").scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: "What would change?", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Run counterfactual analysis", exact: true })
      .click();
    await expect(page.getByText("Stored score:")).toBeVisible();
    await page
      .getByText("All four assumptions", { exact: true })
      .scrollIntoViewIfNeeded();
  });
  await chapter(6, "Context changes the decision", async () => {
    await visit("/simulator", "Risk simulator");
    await page
      .getByRole("button", { name: "Education payment", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Simulate risk", exact: true })
      .click();
    await expect(page.getByText("LOW RISK", { exact: true })).toBeVisible();
    await page
      .getByText("Protective evidence — why not automatically fraud?")
      .click();
  });
  await chapter(
    7,
    "Human review with reason and explicit outcome",
    async () => {
      await visit("/investigations/FULL-TX-0002", "Evidence review");
      await page.getByTestId("decision-workbench").scrollIntoViewIfNeeded();
      await page
        .getByRole("button", { name: "Human vs model", exact: true })
        .click();
      const reason = page.getByLabel("Evidence-based reviewer reason", {
        exact: true,
      });
      if (await reason.count()) {
        await reason.fill(
          "Recipient relationship and delivery evidence require another reviewer.",
        );
        await page
          .getByRole("button", { name: "Escalate case", exact: true })
          .click();
        await expect(
          page.getByText("Case: ESCALATED", { exact: true }),
        ).toBeVisible();
      }
    },
  );
  await chapter(8, "Audit and decision replay", async () => {
    await visit("/audit", "Audit trail");
    await expect(
      page.getByText(/human.decision|case.escalated/i).first(),
    ).toBeVisible();
    await pause(4000);
    await visit("/investigations/FULL-TX-0002", "Evidence review");
    await page.getByTestId("decision-workbench").scrollIntoViewIfNeeded();
    await page
      .getByRole("button", { name: "Data → decision", exact: true })
      .click();
    await expect(page.getByText("SHA-256:")).toBeVisible();
  });
  await chapter(9, "Measured model health and drift", async () => {
    await visit("/operations", "Risk operations");
    await expect(
      page.getByText("Deployed fusion — held-out evaluation", { exact: true }),
    ).toBeVisible();
    await pause(5000);
    await page
      .getByText("Observed data drift", { exact: true })
      .scrollIntoViewIfNeeded();
  });
  await chapter(10, "Threshold capacity and business cost", async () => {
    await page
      .getByRole("button", { name: "Business impact", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Evaluate policy", exact: true })
      .click();
    await expect(
      page.getByText("Operating-point comparison", { exact: true }),
    ).toBeVisible();
    await page
      .getByText("Hypothetical daily business impact", { exact: true })
      .scrollIntoViewIfNeeded();
  });
  await chapter(11, "What broke and responsible boundaries", async () => {
    await page
      .getByRole("button", { name: "Engineering decisions", exact: true })
      .click();
    await expect(
      page.getByText("PostgreSQL enum ownership", { exact: true }),
    ).toBeVisible();
    await page
      .getByText("Grounding and human authority", { exact: true })
      .scrollIntoViewIfNeeded();
  });
  if (!recording) {
    await page
      .getByRole("button", { name: "Connected patterns", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Analyze connected patterns", exact: true })
      .click();
    await expect(
      page.getByText(/Shared-recipient patterns from observed edges only/),
    ).toBeVisible();
    await page.getByRole("button", { name: "Stress lab", exact: true }).click();
    await page
      .getByRole("button", { name: "Run model stress test", exact: true })
      .click();
    await expect(page.locator("pre")).toContainText('"passed": 8');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/simulator");
    await expect(
      page.getByRole("heading", { name: "Change the evidence", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("mobile-simulator.png"),
      fullPage: true,
    });
  }
  if (recording) {
    const elapsed = Date.now() - started;
    if (elapsed < 300_000) await page.waitForTimeout(300_000 - elapsed);
  }
  testInfo.attach("chapters", {
    body: Buffer.from(JSON.stringify(chapters, null, 2)),
    contentType: "application/json",
  });
});
