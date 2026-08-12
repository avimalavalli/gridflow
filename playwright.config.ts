import { defineConfig, devices } from "@playwright/test";

const e2eRun = process.env.GITHUB_RUN_ID ?? `${Date.now()}`;

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "node apps/api/dist/main.js",
      url: "http://127.0.0.1:3001/api/v1/health/live",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "development",
        PORT: "3001",
        WEB_ORIGIN: "http://localhost:3000",
        DATABASE_URL: `pglite:///tmp/gridflow-browser-${e2eRun}`,
        GRIDFLOW_DEV_BOOTSTRAP: "true",
        AUTH_SIGNUP_MODE: "OPEN",
        AUTH_SECURE_COOKIES: "false",
        AUTH_ENCRYPTION_KEY: "browser-test-auth-encryption-key-1234567890",
        INTEGRATION_ENCRYPTION_KEY: "browser-test-integration-key-1234567890",
        GRIDFLOW_RELEASE: "browser-acceptance",
        GRIDFLOW_COMMIT_SHA: "browser-acceptance",
        COMMERCE_CORE_PRICE_MINOR: "12500",
        COMMERCE_CORE_CURRENCY: "GBP",
        COMMERCE_CORE_PAYMENT_PROVIDER: "browser-payments",
        COMMERCE_CORE_CHECKOUT_URL: "https://pay.gridflow.test/checkout?reference={ORDER_REFERENCE}&email={EMAIL}",
        COMMERCE_ULTRA_PRICE_MINOR: "29000",
        COMMERCE_ULTRA_CURRENCY: "GBP",
        COMMERCE_ULTRA_PAYMENT_PROVIDER: "browser-payments",
        COMMERCE_ULTRA_CHECKOUT_URL: "https://pay.gridflow.test/checkout?reference={ORDER_REFERENCE}&email={EMAIL}",
        COMMERCE_SUPPORT_EMAIL: "support@gridflow.test",
        PAYMENT_CONFIRMATION_SECRET: "browser-payment-confirmation-secret-1234567890",
      },
    },
    {
      command: "npm run dev --workspace @gridflow/web -- --hostname 127.0.0.1",
      url: "http://localhost:3000/login",
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: "development",
        GRIDFLOW_API_URL: "http://127.0.0.1:3001/api/v1",
        GRIDFLOW_API_FALLBACK_URL: "http://127.0.0.1:3001/api/v1",
      },
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "tablet-webkit", use: { ...devices["iPad Pro 11"] } },
  ],
});
