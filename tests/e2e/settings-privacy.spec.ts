import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test("Settings explains privacy and temporary chat/file behavior", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/settings");
  await page.getByRole("button", { name: "ข้อมูล", exact: true }).click();

  await expect(page.getByText("ข้อมูลและความเป็นส่วนตัว")).toBeVisible();
  await expect(page.getByText(/Report คือข้อมูลหลัก/)).toBeVisible();
  await expect(page.getByText(/แชทกับโค้ชเป็นชั่วคราว/)).toBeVisible();
  await expect(page.getByText(/ไฟล์อัปโหลดไม่ถูกเก็บเป็นต้นฉบับ/)).toBeVisible();
  await expect(page.getByText(/ไม่ใช่คำแนะนำทางการแพทย์/).first()).toBeVisible();
});
