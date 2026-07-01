import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test.describe("Upload Dashboard v2", () => {
  test("shows category summary, compact date row, disabled CTA, and collapsed help", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=sleep");

    await expect(page.getByTestId("upload-dashboard")).toBeVisible();
    await expect(page.getByTestId("upload-type-selector")).toBeVisible();
    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกการนอน");
    await expect(page.getByTestId("upload-type-summary")).toContainText("ใช้ประเมินความพร้อม");
    await expect(page.getByTestId("upload-date-selector")).toContainText("วันนี้");
    await expect(page.getByRole("button", { name: "เลือกรูปก่อนวิเคราะห์" })).toBeDisabled();

    const help = page.getByTestId("upload-help");
    await expect(help.getByText("อ่านอะไรได้บ้าง?")).toBeVisible();
    await expect(help.getByText("ไฟล์ต้นฉบับใช้เพื่อวิเคราะห์ครั้งนี้เท่านั้น")).toBeHidden();
    await help.getByText("อ่านอะไรได้บ้าง?").click();
    await expect(help.getByText("รูปการนอน")).toBeVisible();
    await expect(help.getByText("ไฟล์ต้นฉบับใช้เพื่อวิเคราะห์ครั้งนี้เท่านั้น")).toBeVisible();
  });

  test("switching food, training, and health modes updates contextual UI", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload");

    await page.getByRole("button", { name: /อาหาร/ }).click();
    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกอาหาร");
    await expect(page.getByRole("button", { name: "อัปโหลดรูป" })).toBeVisible();
    await expect(page.getByRole("button", { name: "พิมพ์เอง" })).toBeVisible();
    await expect(page.getByRole("button", { name: "เช้า" })).toBeVisible();

    await page.getByRole("button", { name: /ซ้อม/ }).click();
    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกการซ้อม");
    await expect(page.getByRole("button", { name: "วิ่ง" })).toBeVisible();
    await page.getByRole("button", { name: "เวท" }).click();
    await expect(page.getByText("Today/Report รู้โหลด strength")).toBeVisible();
    await expect(page.getByRole("button", { name: /อัปโหลดรูป/ })).toBeVisible();

    await page.getByRole("button", { name: /สุขภาพ/ }).click();
    await expect(page.getByTestId("upload-type-summary")).toContainText("Health Check PDF");
    await expect(page.getByTestId("upload-type-summary")).toContainText("ไม่ใช่การวินิจฉัยทางการแพทย์");
    await expect(page.getByRole("button", { name: "เลือก PDF ก่อนวิเคราะห์" })).toBeDisabled();
    await expect(page.locator('input[type="file"]')).toBeHidden();
  });
});
