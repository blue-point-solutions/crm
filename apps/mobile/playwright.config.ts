import { defineConfig, devices } from "@playwright/test";

// Headed by default (per explicit ask: watch the happy path run against the
// real local backend, not a mock) -- override with PW_HEADLESS=1 for CI.
const headless = process.env["PW_HEADLESS"] === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:8082",
    headless,
    screenshot: "on",
    video: "on",
    trace: "on",
    launchOptions: {
      slowMo: headless ? 0 : 250,
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], permissions: [] },
    },
  ],

  webServer: [
    {
      // Backend: expects an already-running uvicorn (see docker-compose.yml
      // for local Postgres + the DATABASE_URL/JWT_SECRET env this needs).
      // Default port is 8001 because 8000 is often taken by the erp dev
      // container on this machine; override with E2E_API_URL.
      command: "true",
      url: `${process.env["E2E_API_URL"] ?? "http://127.0.0.1:8001"}/health`,
      reuseExistingServer: true,
      timeout: 5_000,
    },
    {
      // Frontend: live Metro dev server (expo start --web), not a static
      // export. expo export's static output double-mounts React (SSR
      // snapshot + hydration) which briefly duplicates every input in the
      // DOM and drops keystrokes typed before hydration settles -- a real
      // finding, not a test-harness workaround. The dev server is also more
      // representative of actual local development.
      command: "npx expo start --web --port 8082",
      url: "http://localhost:8082",
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        // Baked into the bundle at Metro start — must point at the same
        // backend the health check above verified.
        EXPO_PUBLIC_API_URL: process.env["E2E_API_URL"] ?? "http://localhost:8001",
      },
    },
  ],
});
