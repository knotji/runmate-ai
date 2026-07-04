import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function makeMealRow(
  id: string,
  dateKey: string,
  createdAtUtc: string,
): ReturnType<typeof Object.assign> {
  return {
    id,
    user_id: USER_ID,
    type: "meal",
    created_at: createdAtUtc,
    data: {
      dateKey,
      recordedAt: `${dateKey}T12:00:00+07:00`,
      mealType: "lunch",
      nutrition: { caloriesKcal: 400, proteinG: 20, carbsG: 50, fatG: 10, fiberG: 2 },
    },
  };
}

async function openFullHistory(page: Parameters<typeof gotoApp>[0]) {
  await gotoApp(page, "/logs");
  await page.getByTestId("full-history-details").evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
}

test.describe("Report history timestamps", () => {
  test("a) backdated food log does not display synthetic noon time", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    const yesterdayKey = bangkokDateKey(-1);

    // Upload time is today (UTC 11:00 = BKK 18:00), but the item belongs to yesterday
    state.history.push(makeMealRow("meal-backdated", yesterdayKey, `${todayKey}T11:00:00.000Z`));

    await openFullHistory(page);
    const row = page.locator(`[data-testid="report-compact-item"][data-date-key="${yesterdayKey}"]`).first();
    await expect(row).toBeVisible();

    // Should NOT show any time at all — not "12:00 น." and not the upload time
    const rowText = await row.locator(".text-\\[11px\\]").first().textContent();
    expect(rowText).not.toMatch(/\d{2}:\d{2}\s*น\./);
  });

  test("b) backdated date-only log shows date label but no time", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    const threeDaysAgoKey = bangkokDateKey(-3);

    state.history.push(makeMealRow("meal-old-backdate", threeDaysAgoKey, `${todayKey}T06:00:00.000Z`));

    await openFullHistory(page);
    const row = page.locator(`[data-testid="report-compact-item"][data-date-key="${threeDaysAgoKey}"]`).first();
    await expect(row).toBeVisible();
    const rowText = await row.locator(".text-\\[11px\\]").first().textContent();
    expect(rowText).not.toMatch(/\d{2}:\d{2}\s*น\./);
    // But date label should be present (non-empty)
    expect(rowText?.trim()).toBeTruthy();
  });

  test("c) non-backdated workout log shows actual createdAt time", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    // 11:00 UTC = 18:00 Bangkok
    state.history.push({
      id: "workout-today",
      user_id: USER_ID,
      type: "workout",
      created_at: `${todayKey}T11:00:00.000Z`,
      data: {
        dateKey: todayKey,
        recordedAt: `${todayKey}T12:00:00+07:00`,
        extracted: { workoutKind: "outdoor_run", distanceKm: 10, duration: "60:00" },
      },
    });

    await openFullHistory(page);
    const row = page.locator(`[data-testid="report-compact-item"][data-date-key="${todayKey}"]`).first();
    await expect(row).toBeVisible();
    const rowText = await row.locator(".text-\\[11px\\]").first().textContent();
    // Should show "18:00 น." — the actual createdAt time in Bangkok, not the synthetic noon
    expect(rowText).toMatch(/18:00\s*น\./);
    expect(rowText).not.toMatch(/12:00\s*น\./);
  });

  test("d) no item ever shows synthetic noon '12:00 น.' in the timestamp column", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    const yesterdayKey = bangkokDateKey(-1);

    // Mix of same-day and backdated items
    state.history.push(makeMealRow("meal-today-1", todayKey, `${todayKey}T11:00:00.000Z`));
    state.history.push(makeMealRow("meal-today-2", todayKey, `${todayKey}T04:00:00.000Z`)); // 11:00 BKK
    state.history.push(makeMealRow("meal-backdated-1", yesterdayKey, `${todayKey}T10:00:00.000Z`));

    await openFullHistory(page);
    // Wait for rows to appear
    await expect(page.locator('[data-testid="report-compact-item"]').first()).toBeVisible();

    // Collect all timestamp labels visible in the list
    const timestampTexts = await page.locator('[data-testid="report-compact-item"] .text-\\[11px\\]').allTextContents();
    for (const text of timestampTexts) {
      expect(text).not.toMatch(/12:00\s*น\./);
    }
  });

  test("e) sorting respects backdated date key order", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    const yesterdayKey = bangkokDateKey(-1);

    // Backdated item uploaded today (so createdAt is today) but logically yesterday
    state.history.push(makeMealRow("meal-yesterday", yesterdayKey, `${todayKey}T10:00:00.000Z`));
    state.history.push(makeMealRow("meal-today", todayKey, `${todayKey}T11:00:00.000Z`));

    await openFullHistory(page);
    await expect(page.locator(`[data-testid="report-compact-item"][data-date-key="${todayKey}"]`).first()).toBeVisible();
    await expect(page.locator(`[data-testid="report-compact-item"][data-date-key="${yesterdayKey}"]`).first()).toBeVisible();

    const items = page.locator('[data-testid="report-compact-item"]');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // First item should be today's (most recent first)
    const firstDateKey = await items.nth(0).getAttribute("data-date-key");
    const secondDateKey = await items.nth(1).getAttribute("data-date-key");
    expect(firstDateKey).toBe(todayKey);
    expect(secondDateKey).toBe(yesterdayKey);
  });

  test("f) รายการทั้งหมด compact rows still render correctly after timestamp fix", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();

    state.history.push(makeMealRow("meal-smoke", todayKey, `${todayKey}T11:00:00.000Z`));

    await openFullHistory(page);
    const row = page.locator(`[data-testid="report-compact-item"][data-date-key="${todayKey}"]`).first();
    await expect(row).toBeVisible();
    // Type badge
    await expect(row.locator(".text-orange-700")).toBeVisible(); // food badge
    // Expand
    await row.getByRole("button", { name: "รายละเอียด" }).click();
    await expect(row.getByTestId("compact-item-details")).toBeVisible();
  });
});

test.describe("Report รายการทั้งหมด UI polish", () => {
  test("expanded section shows ซ่อนรายการ and no permanent black outline", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    state.history.push(makeMealRow("meal-polish", todayKey, `${todayKey}T11:00:00.000Z`));

    await openFullHistory(page);

    // Header shows ซ่อนรายการ when open
    const details = page.getByTestId("full-history-details");
    await expect(details.getByText("ซ่อนรายการ")).toBeVisible();

    // summary element must not have outline style (browser default black outline removed)
    const summary = details.locator("summary");
    const outlineStyle = await summary.evaluate((el) => getComputedStyle(el).outlineStyle);
    // With focus:outline-none the outline is "none" when not focused via keyboard
    expect(outlineStyle).toBe("none");
  });

  test("filter pills row is horizontally scrollable and last chip not clipped", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    state.history.push(makeMealRow("meal-pills", todayKey, `${todayKey}T11:00:00.000Z`));

    await openFullHistory(page);

    const pillsRow = page.getByTestId("filter-pills-row");
    await expect(pillsRow).toBeVisible();

    // Scrollable container — overflow-x should be auto or scroll
    const overflowX = await pillsRow.evaluate((el) => getComputedStyle(el).overflowX);
    expect(["auto", "scroll"]).toContain(overflowX);

    // All filter buttons are visible (not clipped off-screen at initial width)
    await expect(pillsRow.getByRole("button", { name: "ทั้งหมด" })).toBeVisible();
    await expect(pillsRow.getByRole("button", { name: "สุขภาพ" })).toBeVisible(); // last chip
  });

  test("active filter chip uses soft sage tone not solid primary fill", async ({ page }) => {
    const state = await installMockBackend(page);
    const todayKey = bangkokDateKey();
    state.history.push(makeMealRow("meal-chip", todayKey, `${todayKey}T11:00:00.000Z`));

    await openFullHistory(page);

    // Default active chip is "ทั้งหมด" — should NOT have white text (solid fill)
    const activeChip = page.getByTestId("filter-pills-row").getByRole("button", { name: "ทั้งหมด" });
    const color = await activeChip.evaluate((el) => getComputedStyle(el).color);
    // text-white is rgb(255,255,255); soft sage is not pure white
    expect(color).not.toBe("rgb(255, 255, 255)");
  });
});
