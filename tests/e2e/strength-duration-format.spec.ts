/**
 * Strength duration display — seconds stored as durationMin must render as minutes.
 * Bug: durationMin = 2134 was showing "2134 นาที" (should be "36 นาที").
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
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

test("strength duration: 2134 (seconds) renders as 36 นาที, not 2134 นาที", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);

  // Seed a strength item with durationMin that is actually seconds (the bug)
  state.history.push(strengthItem("str-2134", 2134, today));

  await page.goto("/logs");
  await page.getByText("รายการทั้งหมด").click();

  // Correct value visible (multiple elements expected — use first())
  await expect(page.getByText("36 นาที").first()).toBeVisible({ timeout: 10000 });
  // Must NOT show the raw seconds value as minutes
  await expect(page.getByText("2134 นาที")).toHaveCount(0);
});

test("strength duration: 3502 (seconds) renders as 58 นาที", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);

  state.history.push(strengthItem("str-3502", 3502, today));

  await page.goto("/logs");
  await page.getByText("รายการทั้งหมด").click();

  await expect(page.getByText("58 นาที").first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("3502 นาที")).toHaveCount(0);
});

test("strength duration: 30 (normal minutes) stays as 30 นาที", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);

  state.history.push(strengthItem("str-30", 30, today));

  await page.goto("/logs");
  await page.getByText("รายการทั้งหมด").click();

  await expect(page.getByText("30 นาที").first()).toBeVisible({ timeout: 10000 });
});
