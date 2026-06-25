import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test("mobile app loads and primary navigation is visible", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await installMockBackend(page);

  await gotoApp(page, "/");

  await expect(page.getByRole("heading", { name: "โค้ชข้างทาง" })).toBeVisible();
  for (const label of ["Today", "Upload", "Race", "Report", "Coach"]) {
    await expect(page.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "ตั้งค่า" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("Coach renders a mocked response without calling a real provider", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/coach");

  const input = page.getByPlaceholder("ถามโค้ชเรื่องซ้อม กิน นอน หรืออะไรก็ได้...");
  await input.fill("เย็นกินอะไรดี");
  await page.getByRole("button", { name: "ส่ง" }).click();

  await expect(page.getByText("วันนี้แนะนำ 3 ตัวเลือกที่ทำได้จริงครับ")).toBeVisible();
});
