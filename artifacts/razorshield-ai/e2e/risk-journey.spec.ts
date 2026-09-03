import { expect, test } from "@playwright/test";

test("merchant can traverse dashboard, transaction, investigation, audit and monitoring", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Merchant access" }),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Email or phone number", exact: true })
    .fill(process.env.RAZORSHIELD_E2E_EMAIL ?? "analyst@razorshield.demo");
  await page
    .getByRole("textbox", { name: "Password Show password", exact: true })
    .fill(process.env.RAZORSHIELD_E2E_PASSWORD ?? "Analyst-RazorShield-2026!");
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Risk overview", { exact: true })).toBeVisible();
  await expect(page.getByTestId("status-query-error")).toHaveCount(0);

  // Simulate an expired/corrupt short-lived access token. The HttpOnly refresh
  // cookie must rotate the session without exposing the refresh secret to JS.
  await page.evaluate(() =>
    sessionStorage.setItem("razorshield_access_token", "expired-access-token"),
  );

  await page.getByTestId("link-nav-transactions").click();
  await expect(page).toHaveURL(/\/transactions$/);
  await expect(
    page.getByRole("heading", { name: "Transactions", exact: true }),
  ).toBeVisible();

  const firstTransaction = page
    .getByRole("button", { name: "Inspect" })
    .first();
  await expect(firstTransaction).toBeVisible();
  await firstTransaction.click();
  await expect(page).toHaveURL(/\/investigations\//);
  await expect(page.getByText("Funds flow", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Audit trail", exact: true }).click();
  await expect(page).toHaveURL(/\/audit$/);
  await expect(
    page.getByRole("heading", { name: "Audit trail" }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "Model monitoring", exact: true })
    .click();
  await expect(page).toHaveURL(/\/monitoring$/);
  await expect(
    page.getByRole("heading", { name: "Model monitoring" }),
  ).toBeVisible();
  await expect(page.getByTestId("status-query-error")).toHaveCount(0);
});
