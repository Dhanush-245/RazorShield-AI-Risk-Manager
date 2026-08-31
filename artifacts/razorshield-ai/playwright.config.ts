import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
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
        "RAZORSHIELD_DATABASE_URL=sqlite:////tmp/razorshield-browser-e2e.db " +
        "RAZORSHIELD_AUTO_SEED_DEMO=true " +
        "../../backend/.venv/bin/python -m uvicorn app.main:app --app-dir ../../backend --host 127.0.0.1 --port 5001",
      url: "http://127.0.0.1:5001/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "VITE_DEV_API_TARGET=http://127.0.0.1:5001 pnpm dev",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
