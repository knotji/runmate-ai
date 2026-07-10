/**
 * v0.2.2 UX Simplification — progressive disclosure defaults.
 *
 * Today page:
 *   - Signal bars (4-card grid) collapsed by default; compact summary visible
 *   - Factor bars collapsed inside Recovery <details>
 *   - Reason section collapses under "ดูเหตุผล" (not the old long label)
 *   - Main recommendation section always visible
 *
 * Report page:
 *   - Rolling 7-day insight collapsed by default; "ดู insight เต็ม" expands it
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function pushSleepToday(state: Awaited<ReturnType<typeof installMockBackend>>) {
  const today = bangkokDateKey();
  state.history.push({
    id: "sleep-ux",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T08:00:00.000Z`,
    data: {
      extracted: {
        date: today,
        actualSleepDurationMinutes: 420,
        sleepScore: 78,
      },
      coach: { readinessScore: 72, readinessLabel: "Good" },
    },
  });
}

// ─── Today page ───────────────────────────────────────────────────────────────

test.describe("Today UX simplification", () => {
  test("1. Signal summary compact row is visible; 4-card grid is hidden by default", async ({ page }) => {
    const state = await installMockBackend(page);
    pushSleepToday(state);
    await gotoApp(page, "/");

    // The <details> wrapper for signals should be present
    const signalsDetails = page.locator('[data-testid="signals-details"]');
    await expect(signalsDetails).toBeVisible();

    // Compact summary text anchor "สัญญาณวันนี้" is visible inside the summary
    await expect(signalsDetails.getByText("สัญญาณวันนี้")).toBeVisible();

    // The full 4-card grid must NOT be visible while closed
    const signalBars = page.locator('[data-testid="readiness-signal-bars"]');
    await expect(signalBars).not.toBeVisible();
  });

  test("2. Clicking signal summary expands the 4-card grid", async ({ page }) => {
    const state = await installMockBackend(page);
    pushSleepToday(state);
    await gotoApp(page, "/");

    // Click the <summary> to open
    const signalsDetails = page.locator('[data-testid="signals-details"]');
    await signalsDetails.locator("summary").click();

    // Full grid now visible
    await expect(page.locator('[data-testid="readiness-signal-bars"]')).toBeVisible();
  });

  test("3. Factor bars are inside the collapsed Recovery details (not visible by default)", async ({ page }) => {
    const state = await installMockBackend(page);
    pushSleepToday(state);
    await gotoApp(page, "/");

    // Recovery details wrapper present
    const recoveryDetails = page.locator('[data-testid="recovery-details"]');
    await expect(recoveryDetails).toBeVisible();

    // Factor bars inside it must not be visible while closed
    await expect(page.locator('[data-testid="factor-bars"]')).not.toBeVisible();
  });

  test("4. Clicking 'ดูรายละเอียด Recovery' expands factor bars", async ({ page }) => {
    const state = await installMockBackend(page);
    pushSleepToday(state);
    await gotoApp(page, "/");

    await page.locator('[data-testid="recovery-details"]').locator("summary").first().click();
    await expect(page.locator('[data-testid="factor-bars"]')).toBeVisible();
  });

  test("5. Reason button label is 'ดูเหตุผล', not the old long label", async ({ page }) => {
    const state = await installMockBackend(page);
    pushSleepToday(state);
    await gotoApp(page, "/");

    await expect(page.getByText("ดูเหตุผล").first()).toBeVisible();
    await expect(page.getByText("ทำไมวันนี้แนะนำแบบนี้?")).not.toBeVisible();
  });

  test("6. Main recommendation section is always visible", async ({ page }) => {
    const state = await installMockBackend(page);
    pushSleepToday(state);
    await gotoApp(page, "/");

    // Section label text is always rendered (pre-workout or post-workout variant)
    const recLabel = page.getByText(/วันนี้ทำอะไรดี\?|วันนี้ควรพักและฟื้นตัว|หลังซ้อมวันนี้ควรทำอะไรต่อ|หลังเวทวันนี้ควรทำอะไรต่อ/);
    await expect(recLabel.first()).toBeVisible();
  });
});

// ─── Report page ──────────────────────────────────────────────────────────────

test.describe("Report UX simplification", () => {
  test("7. Rolling insight collapsed by default; expand button shows 'ดู insight เต็ม'", async ({ page }) => {
    const today = bangkokDateKey();
    const state = await installMockBackend(page);

    // Add a few days of data so the insight renders
    for (let d = 0; d < 3; d++) {
      state.history.push({
        id: `sleep-r${d}`,
        user_id: "00000000-0000-4000-8000-000000000001",
        type: "sleep",
        created_at: `${bangkokDateKey(-d)}T08:00:00.000Z`,
        data: {
          extracted: {
            date: bangkokDateKey(-d),
            actualSleepDurationMinutes: 420,
            sleepScore: 75,
          },
        },
      });
      state.history.push({
        id: `run-r${d}`,
        user_id: "00000000-0000-4000-8000-000000000001",
        type: "workout",
        created_at: `${bangkokDateKey(-d)}T07:00:00.000Z`,
        data: {
          extracted: {
            date: bangkokDateKey(-d),
            workoutKind: "outdoor_run",
            distanceKm: 8,
            duration: "50:00",
          },
        },
      });
    }

    await page.goto(`/logs?date=${today}`);
    await page.waitForTimeout(2000);

    const rollingInsight = page.locator('[data-testid="rolling-insight"]').first();
    await expect(rollingInsight).toBeVisible({ timeout: 10000 });

    // Expand button text present
    await expect(rollingInsight.getByText("ดู insight เต็ม")).toBeVisible();
  });
});
