import { expect, test } from "@playwright/test";

const productionBaseURL = process.env.E2E_PRODUCTION_BASE_URL;

test("production blocks debug APIs and omits debug UI", async ({ request }) => {
  test.skip(!productionBaseURL, "Set E2E_PRODUCTION_BASE_URL to a running `next start` server.");
  const baseURL = productionBaseURL!;

  for (const path of ["/api/debug/env", "/api/debug/coach-context"]) {
    const response = await request.get(`${baseURL}${path}`);
    expect([403, 404]).toContain(response.status());
  }

  const settingsResponse = await request.get(`${baseURL}/settings`);
  expect(settingsResponse.ok()).toBeTruthy();
  const settingsHTML = await settingsResponse.text();
  expect(settingsHTML).not.toContain("Coach Context Inspector");
  expect(settingsHTML).not.toContain("Deployment Debug");
});
