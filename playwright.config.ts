import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true,
    locale: "th-TH",
    timezoneId: "Asia/Bangkok",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: `${baseURL}/e2e-supabase`,
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-anon-key",
          NEXT_PUBLIC_APP_URL: baseURL,
        },
      },
});
