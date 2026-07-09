/**
 * Beta readiness polish — empty states, error states, offline banner.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

// ─── Empty: Today with no history ─────────────────────────────────────────────

test("Empty Today: shows calm no-data message and upload CTA", async ({ page }) => {
  await installMockBackend(page); // no history pushed → empty state

  await gotoApp(page, "/");

  // Page should still render without crashing
  await expect(page.locator("body")).toBeVisible();

  // The "วันนี้ควรทำอะไร" section should render
  // When no history, either the empty state text or the CTA to upload should be visible
  const hasNoDataMsg = await page.getByText("ยังไม่มีข้อมูลวันนี้").isVisible().catch(() => false);
  const hasUploadCTA = await page.getByRole("link", { name: /บันทึกกิจกรรม|อัปเดตข้อมูล/ }).isVisible().catch(() => false);
  expect(hasNoDataMsg || hasUploadCTA).toBe(true);
});

// ─── Empty: Report with no history ────────────────────────────────────────────

test("Empty Report: shows calm no-records message and upload CTA", async ({ page }) => {
  await installMockBackend(page); // no history

  // Use goto directly — empty state has no interactive elements that gotoApp waits for
  await page.goto("/logs");
  await expect(page.getByText("ยังไม่มีบันทึกในสัปดาห์นี้")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("บันทึกข้อมูลวันนี้")).toBeVisible();
});

// ─── Empty: Race goal not set ──────────────────────────────────────────────────

test("Empty Race: shows no-goal message when no race goal exists", async ({ page }) => {
  await installMockBackend(page);

  await gotoApp(page, "/race-goal");

  // Empty state heading and description
  await expect(page.getByText("ยังไม่มีเป้าหมายแข่ง")).toBeVisible();
  // The form to create a goal should be visible
  await expect(page.locator("body")).toContainText(/10K|21K|42K|วันแข่ง/);
});

// ─── Empty: Coach with no data shows low-data hint ────────────────────────────

test("Empty Coach: shows low-data hint message inside context dashboard", async ({ page }) => {
  await installMockBackend(page); // no history → hasUsefulData = false

  await gotoApp(page, "/coach");

  const dashboard = page.getByTestId("coach-context-dashboard");
  await expect(dashboard).toBeVisible();

  // Either the no-context empty state or the low-data inline hint
  const bodyText = await dashboard.textContent();
  const hasLowDataHint = bodyText?.includes("ยังมีข้อมูลไม่มาก") ||
    bodyText?.includes("โค้ชยังไม่มีบริบท") ||
    bodyText?.includes("อัปโหลด");
  expect(hasLowDataHint).toBe(true);
});

// ─── Error: Report load error shows retry button ───────────────────────────────

test("Report error: shows retry button when load fails", async ({ page }) => {
  await installMockBackend(page);

  // Make history items return an error
  await page.route("**/rest/v1/history_items**", async (route) => {
    await route.fulfill({ status: 500, body: JSON.stringify({ error: "DB error" }) });
  });

  await gotoApp(page, "/logs");

  // Error state should show retry
  const retryBtn = page.getByRole("button", { name: "ลองใหม่" });
  await expect(retryBtn).toBeVisible();
  await expect(page.getByText("โหลด Report ไม่สำเร็จ")).toBeVisible();
});

// ─── Offline banner ────────────────────────────────────────────────────────────

test("Offline banner: shows when navigator.onLine is false", async ({ page }) => {
  await installMockBackend(page);

  // Simulate offline before page load
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
  });

  await gotoApp(page, "/");

  await expect(page.getByTestId("offline-banner")).toBeVisible();
  await expect(page.getByTestId("offline-banner")).toContainText("ออฟไลน์");
});

// ─── Settings: changelog section visible ──────────────────────────────────────

test("Settings: changelog section shows recent updates", async ({ page }) => {
  await installMockBackend(page);

  await gotoApp(page, "/settings");

  // Latest version preview is visible without expanding
  await expect(page.getByTestId("release-notes-preview").getByText("v0.2")).toBeVisible();

  // Expand to see full history including v0.1.0 Beta
  await page.getByTestId("release-notes-toggle").click();
  await expect(page.getByText("v0.1.0 Beta")).toBeVisible();

  // At least one changelog item should be visible
  const text = await page.locator("body").textContent();
  const hasChangelog = text?.includes("insight") || text?.includes("recovery") || text?.includes("Today");
  expect(hasChangelog).toBe(true);
});
