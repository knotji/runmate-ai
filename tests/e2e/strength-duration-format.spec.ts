/**
 * Strength duration display — seconds stored as durationMin must render as minutes.
 * Bug: durationMin = 2134 was showing "2134 นาที" (should be "36 นาที").
 * These tests explicitly check the collapsed compact DaySlot row in the calendar week view.
 */

import { expect, test } from "@playwright/test";
import { installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function strengthItem(id: string, durationMin: number, dateKey: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "strength",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      routineName: "Full Body",
      source: "manual",
      durationMin,
      completedAt: `${dateKey}T08:00:00.000Z`,
      exercises: [],
    },
  };
}

test("compact week row: 2134 (seconds) shows 36 นาที, never 2134 นาที", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);
  state.history.push(strengthItem("str-2134", 2134, today));

  await page.goto("/logs");
  await page.waitForSelector('[data-testid="week-day-list"]');
  const weekList = page.getByTestId("week-day-list");

  // Compact summary span (first match) must show the converted value
  await expect(weekList.getByText(/💪 เวท 36 นาที/).first()).toBeVisible({ timeout: 10000 });
  // Raw seconds must never appear as a minute label
  await expect(weekList.getByText(/2134 นาที/)).toHaveCount(0);
});

test("compact week row: 3502 (seconds) shows 58 นาที, never 3502 นาที", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);
  state.history.push(strengthItem("str-3502", 3502, today));

  await page.goto("/logs");
  await page.waitForSelector('[data-testid="week-day-list"]');
  const weekList = page.getByTestId("week-day-list");

  await expect(weekList.getByText(/💪 เวท 58 นาที/).first()).toBeVisible({ timeout: 10000 });
  await expect(weekList.getByText(/3502 นาที/)).toHaveCount(0);
});

test("compact week row: 30 (normal minutes) stays as 30 นาที", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);
  state.history.push(strengthItem("str-30", 30, today));

  await page.goto("/logs");
  await page.waitForSelector('[data-testid="week-day-list"]');
  const weekList = page.getByTestId("week-day-list");

  await expect(weekList.getByText(/💪 เวท 30 นาที/).first()).toBeVisible({ timeout: 10000 });
});

test("compact week row: 45 (normal minutes) stays as 45 นาที", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);
  state.history.push(strengthItem("str-45", 45, today));

  await page.goto("/logs");
  await page.waitForSelector('[data-testid="week-day-list"]');
  const weekList = page.getByTestId("week-day-list");

  await expect(weekList.getByText(/💪 เวท 45 นาที/).first()).toBeVisible({ timeout: 10000 });
});
