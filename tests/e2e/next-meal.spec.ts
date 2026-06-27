import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

const MOCK_RECOMMENDATION = {
  mealSlot: "lunch",
  mealSlotLabel: "มื้อกลางวัน",
  summary: "แนะนำตามภาระซ้อมวันนี้",
  options: [
    {
      title: "ข้าวไก่ย่าง",
      description: "ข้าวสวย ไก่ย่างอก",
      why: "โปรตีนสูง คาร์บพอดี",
      tags: ["โปรตีน"],
      convenience: "ตามสั่ง",
    },
    {
      title: "ก๋วยเตี๋ยวน้ำไก่",
      description: "เส้นน้ำใส",
      why: "ย่อยง่าย ไม่มันจัด",
      tags: ["ย่อยง่าย"],
      convenience: "ตามสั่ง",
    },
    {
      title: "โยเกิร์ต + กล้วย",
      description: "โยเกิร์ตกรีก + กล้วยหอม",
      why: "โปรตีนเสริม หาได้ง่าย",
      tags: ["โปรตีน", "7-11"],
      convenience: "7-11",
    },
  ],
  nutritionFocus: ["protein", "carbs"],
  caution: null,
  basedOn: ["ข้อมูลจาก Report"],
};

test("next meal card shows request button before fetch", async ({ page }) => {
  await installMockBackend(page);

  // delay the mock so we can see the initial state
  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, recommendation: MOCK_RECOMMENDATION }),
    });
  });

  await gotoApp(page, "/");

  await expect(page.getByRole("button", { name: "แนะนำมื้อต่อไป" })).toBeVisible();
});

test("next meal card displays primary option and expand button after request", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, recommendation: MOCK_RECOMMENDATION }),
    });
  });

  await gotoApp(page, "/");
  await page.getByRole("button", { name: "แนะนำมื้อต่อไป" }).click();

  // Primary option is always visible
  await expect(page.getByText("ข้าวไก่ย่าง")).toBeVisible();

  // Secondary options start hidden — expand button appears
  await expect(page.getByRole("button", { name: /ดูตัวเลือกเพิ่ม/ })).toBeVisible();

  // After expanding, secondary options appear
  await page.getByRole("button", { name: /ดูตัวเลือกเพิ่ม/ }).click();
  await expect(page.getByText("ก๋วยเตี๋ยวน้ำไก่")).toBeVisible();
  await expect(page.getByText("โยเกิร์ต + กล้วย")).toBeVisible();
});

test("next meal card shows meal slot label after response", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, recommendation: MOCK_RECOMMENDATION }),
    });
  });

  await gotoApp(page, "/");
  await page.getByRole("button", { name: "แนะนำมื้อต่อไป" }).click();

  await expect(page.getByText("มื้อกลางวัน")).toBeVisible();
});

test("next meal does not auto-save to Report", async ({ page }) => {
  const state = await installMockBackend(page);

  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, recommendation: MOCK_RECOMMENDATION }),
    });
  });

  await gotoApp(page, "/");
  await page.getByRole("button", { name: "แนะนำมื้อต่อไป" }).click();
  await expect(page.getByText("ข้าวไก่ย่าง")).toBeVisible();

  // No meal item should have been saved to history
  const mealItems = state.history.filter((row) => row.type === "meal");
  expect(mealItems).toHaveLength(0);
});

test("บันทึกมื้ออาหาร link navigates to /upload", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, recommendation: MOCK_RECOMMENDATION }),
    });
  });

  await gotoApp(page, "/");
  await page.getByRole("button", { name: "แนะนำมื้อต่อไป" }).click();
  await expect(page.getByText("ข้าวไก่ย่าง")).toBeVisible();

  const uploadLink = page.getByRole("link", { name: "บันทึกมื้ออาหาร" });
  await expect(uploadLink).toBeVisible();
  await expect(uploadLink).toHaveAttribute("href", "/upload?type=meal");
});

test("ถามโค้ชต่อ link navigates to /coach", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/next-meal", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, recommendation: MOCK_RECOMMENDATION }),
    });
  });

  await gotoApp(page, "/");
  await page.getByRole("button", { name: "แนะนำมื้อต่อไป" }).click();
  await expect(page.getByText("ข้าวไก่ย่าง")).toBeVisible();

  const coachLink = page.getByRole("link", { name: "ถามโค้ชต่อ" });
  await expect(coachLink).toBeVisible();
  await expect(coachLink).toHaveAttribute("href", "/coach");
});
