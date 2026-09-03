import { defineConfig, devices } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const uiPort = Number(process.env.RAZORSHIELD_E2E_UI_PORT ?? 5173);
const apiPort = Number(process.env.RAZORSHIELD_E2E_API_PORT ?? 5001);
for (const port of [uiPort, apiPort]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid E2E port");
}
const database = path.join(tmpdir(), `razorshield-e2e-${randomUUID()}.db`);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Every browser test in a run intentionally shares the single disposable
  // database started below. Parallel files can otherwise race on seeded cases
  // and automatic investigation requests, producing recording-only flakes.
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${uiPort}`,
    video:
      process.env.RAZORSHIELD_E2E_RECORD === "1"
        ? { mode: "on", size: { width: 1440, height: 1000 } }
        : "off",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command:
        "RAZORSHIELD_ENVIRONMENT=development " +
        `RAZORSHIELD_DATABASE_URL='sqlite:///${database}' ` +
        "RAZORSHIELD_AUTO_SEED_DEMO=true " +
        `../../backend/.venv/bin/python -m uvicorn app.main:app --app-dir ../../backend --host 127.0.0.1 --port ${apiPort}`,
      url: `http://127.0.0.1:${apiPort}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `PORT=${uiPort} VITE_DEV_API_TARGET=http://127.0.0.1:${apiPort} pnpm dev`,
      url: `http://127.0.0.1:${uiPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
