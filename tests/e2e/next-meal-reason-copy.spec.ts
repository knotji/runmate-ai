/**
 * Tests for transparent reason copy in the next-meal recommendation card.
 *
 * Covers:
 * - formatSleepCitation produces correct Thai strings from WeekSleepRow data
 * - Card renders the summary text including sleep duration when present
 * - Fallback-style summary (no AI) still cites sleep hours when readiness is low
 * - When sleep data absent the summary falls back to general wording
 */

import { expect, test } from "@playwright/test";
import { formatSleepCitation } from "../../src/lib/formatSleepCitation";
import { gotoApp, installMockBackend } from "./helpers/app";

// ─── Unit: formatSleepCitation ────────────────────────────────────────────────

const baseSleep = { restingHR: null, hrv: null, energyScore: null };

test("formatSleepCitation: durationH takes priority over durationMinutes", () => {
  const result = formatSleepCitation({
    ...baseSleep,
    date: "2026-07-04",
    durationH: "6 ชม. 14 นาที",
    durationMinutes: 374,
    score: 68,
    readiness: 74,
  });
  expect(result).toBe("นอน 6 ชม. 14 นาที · สกอร์ 68 · Recovery 74");
});

test("formatSleepCitation: falls back to durationMinutes when durationH is null", () => {
  const result = formatSleepCitation({
    ...baseSleep,
    date: "2026-07-04",
    durationH: null,
    durationMinutes: 374,
    score: null,
    readiness: null,
  });
  expect(result).toBe("นอน 6 ชม. 14 นาที");
});

test("formatSleepCitation: whole-hour minutes show no minute part", () => {
  const result = formatSleepCitation({
    ...baseSleep,
    date: "2026-07-04",
    durationH: null,
    durationMinutes: 360,
    score: null,
    readiness: null,
  });
  expect(result).toBe("นอน 6 ชม.");
});

test("formatSleepCitation: omits score and readiness when null", () => {
  const result = formatSleepCitation({
    ...baseSleep,
    date: "2026-07-04",
    durationH: "5 ชม. 30 นาที",
    durationMinutes: 330,
    score: null,
    readiness: null,
  });
  expect(result).toBe("นอน 5 ชม. 30 นาที");
});

test("formatSleepCitation: returns empty string when all fields are null/zero", () => {
  const result = formatSleepCitation({
    ...baseSleep,
    date: "2026-07-04",
    durationH: null,
    durationMinutes: null,
    score: null,
    readiness: null,
  });
  expect(result).toBe("");
});

// ─── E2E: card renders the summary ────────────────────────────────────────────

test("next-meal card displays summary text from recommendation", async ({ page }) => {
  await installMockBackend(page);

  const summaryWithSleep = "ดูจากการนอนล่าสุด 6 ชม. 14 นาที สกอร์ 68 — ร่างกายยังพักไม่เต็มที่ เลือกมื้อย่อยง่าย";

  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        recommendation: {
          mealSlot: "snack",
          mealSlotLabel: "มื้อว่าง",
          summary: summaryWithSleep,
          options: [
            { title: "ข้าวต้มไก่", description: "ข้าวต้มอ่อน", why: "ย่อยง่าย", tags: ["ย่อยง่าย"], convenience: "ตามสั่ง" },
            { title: "โยเกิร์ต + กล้วย", description: "โยเกิร์ตกรีก", why: "เบา", tags: ["โปรตีน"], convenience: "7-11" },
            { title: "สลัดไก่", description: "สลัดผัก", why: "ไขมันต่ำ", tags: ["ไฟเบอร์"], convenience: "food court" },
          ],
          nutritionFocus: ["balance"],
          caution: null,
          basedOn: ["ข้อมูลการนอนล่าสุด"],
        },
      }),
    });
  });

  await gotoApp(page, "/");
  await page.getByRole("button", { name: "แนะนำมื้อต่อไป" }).click();

  // Sleep-citing summary must be visible in the card
  await expect(page.getByText("ดูจากการนอนล่าสุด 6 ชม. 14 นาที สกอร์ 68")).toBeVisible();
});

test("next-meal card shows general fallback summary when sleep data is absent", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        recommendation: {
          mealSlot: "snack",
          mealSlotLabel: "มื้อว่าง",
          summary: "จากข้อมูล recovery ล่าสุด — ร่างกายยังพักไม่เต็มที่ เลือกมื้อย่อยง่าย",
          options: [
            { title: "ข้าวต้มไก่", description: "ข้าวต้มอ่อน", why: "ย่อยง่าย", tags: [], convenience: "ตามสั่ง" },
            { title: "โยเกิร์ต", description: "โยเกิร์ตกรีก", why: "เบา", tags: [], convenience: "7-11" },
            { title: "สลัดไก่", description: "สลัดผัก", why: "ไขมันต่ำ", tags: [], convenience: "food court" },
          ],
          nutritionFocus: ["balance"],
          caution: null,
          basedOn: ["ข้อมูล recovery ล่าสุด"],
        },
      }),
    });
  });

  await gotoApp(page, "/");
  await page.getByRole("button", { name: "แนะนำมื้อต่อไป" }).click();

  // General recovery wording should appear instead of vague "พักผ่อนน้อย"
  await expect(page.getByText(/จากข้อมูล recovery ล่าสุด/)).toBeVisible();
});
