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
    await expect(help.getByText("รูปหน้าสรุปการนอน")).toBeVisible();
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
    await expect(page.getByTestId("upload-type-summary")).toContainText("ผลตรวจสุขภาพ (PDF)");
    await expect(page.getByTestId("upload-type-summary")).toContainText("ไม่ใช่การวินิจฉัยทางการแพทย์");
    await expect(page.getByRole("button", { name: "เลือก PDF ก่อนวิเคราะห์" })).toBeDisabled();
    await expect(page.locator('input[type="file"]')).toBeHidden();
  });

  test("workout subtype 'other' shows OtherWorkoutForm near the subtype selector without large gap", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload");

    // Select workout type
    await page.getByRole("button", { name: /ซ้อม/ }).click();
    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกการซ้อม");

    // Select "อื่น ๆ" subtype
    await page.getByRole("button", { name: "อื่น ๆ" }).click();

    // The form should be visible
    const form = page.getByTestId("other-workout-form");
    await expect(form).toBeVisible();

    // The form wrapper and the upload-input-panel should both be inside upload-dashboard
    const section = page.getByTestId("upload-dashboard");
    const otherSection = page.getByTestId("other-workout-section");
    await expect(otherSection).toBeVisible();

    // Verify no large blank space: the vertical distance between the
    // subtype-chip area (upload-input-panel) and the form should be small.
    const panelBox = await page.getByTestId("upload-input-panel").boundingBox();
    const formBox = await form.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(formBox).not.toBeNull();
    if (panelBox && formBox) {
      const gap = formBox.y - (panelBox.y + panelBox.height);
      // Gap should be less than 60px (normal card spacing, not a nav-pad gap of 96px+)
      expect(gap).toBeLessThan(60);
    }

    // Both elements should be inside the upload-dashboard section
    await expect(section.getByTestId("upload-input-panel")).toBeVisible();
    await expect(section.getByTestId("other-workout-section")).toBeVisible();
  });

  test("type selector shows ป่วย chip that links to /sick", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload");
    const selector = page.getByTestId("upload-type-selector");
    // chip now labelled อาการป่วย but still links to /sick
    const sickChip = selector.getByRole("link", { name: "อาการป่วย" });
    await expect(sickChip).toBeVisible();
    await sickChip.click();
    await expect(page).toHaveURL(/\/sick/);
  });

  test("สุขภาพ category button shows สุขภาพ PDF label", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload");
    // The UPLOAD_LABELS.health_check is "สุขภาพ PDF" — visible in the type selector
    await expect(page.getByTestId("upload-type-selector")).toContainText("สุขภาพ PDF");
  });
});
