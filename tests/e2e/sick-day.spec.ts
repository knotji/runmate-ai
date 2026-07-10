import { test, expect } from "@playwright/test";

test.describe("Sick Day logging page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/sick");
  });

  test("renders status picker with three options", async ({ page }) => {
    await expect(page.getByText("ปกติ")).toBeVisible();
    await expect(page.getByText("เพลีย")).toBeVisible();
    await expect(page.getByText("ไม่สบาย / ป่วย")).toBeVisible();
  });

  test("symptom section hidden when status is normal", async ({ page }) => {
    await expect(page.getByText("อาการอยู่ตรงไหนบ้าง")).not.toBeVisible();
  });

  test("symptom section appears after selecting sick status", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await expect(page.getByText("อาการอยู่ตรงไหนบ้าง")).toBeVisible();
    await expect(page.getByText("เลือกกลุ่มอาการก่อน แล้วเลือกอาการที่ตรงที่สุด")).toBeVisible();
  });

  test("all six symptom groups are shown when sick", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await expect(page.getByRole("button", { name: "คอ / จมูก" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ไอ / หน้าอก" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ไข้ / ปวดเมื่อย" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ท้อง / คลื่นไส้" })).toBeVisible();
    await expect(page.getByRole("button", { name: "เวียนหัว / เพลียมาก" })).toBeVisible();
    await expect(page.getByRole("button", { name: "อื่น ๆ" })).toBeVisible();
  });

  test("selecting a group reveals its symptom chips", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await expect(page.getByRole("button", { name: "เจ็บคอ" })).not.toBeVisible();
    await page.getByRole("button", { name: "คอ / จมูก" }).click();
    await expect(page.getByRole("button", { name: "เจ็บคอ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "น้ำมูก" })).toBeVisible();
    await expect(page.getByRole("button", { name: "คัดจมูก" })).toBeVisible();
  });

  test("deselecting a group hides its chips and clears its selected symptoms", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "คอ / จมูก" }).click();
    await page.getByRole("button", { name: "เจ็บคอ" }).click();
    // Deselect group
    await page.getByRole("button", { name: "คอ / จมูก" }).click();
    await expect(page.getByRole("button", { name: "เจ็บคอ" })).not.toBeVisible();
  });

  test("selecting fever chip shows hard_stop guardrail banner", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "ไข้ / ปวดเมื่อย" }).click();
    await page.getByRole("button", { name: "มีไข้" }).click();
    await expect(page.getByText("วันนี้ควรพัก")).toBeVisible();
  });

  test("selecting only above-neck symptoms shows mild guardrail banner", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "คอ / จมูก" }).click();
    await page.getByRole("button", { name: "เจ็บคอ" }).click();
    await expect(page.getByText("ลดความหนักไว้ก่อน")).toBeVisible();
  });

  test("new symptom: หนาวสั่น appears in ไข้ / ปวดเมื่อย group", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "ไข้ / ปวดเมื่อย" }).click();
    await expect(page.getByRole("button", { name: "หนาวสั่น" })).toBeVisible();
  });

  test("new symptom: หายใจไม่โล่ง appears in ไอ / หน้าอก group", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "ไอ / หน้าอก" }).click();
    await expect(page.getByRole("button", { name: "หายใจไม่โล่ง" })).toBeVisible();
  });

  test("new symptom: อาเจียน appears in ท้อง / คลื่นไส้ group", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "ท้อง / คลื่นไส้" }).click();
    await expect(page.getByRole("button", { name: "อาเจียน" })).toBeVisible();
  });

  test("หนาวสั่น triggers hard_stop guardrail", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "ไข้ / ปวดเมื่อย" }).click();
    await page.getByRole("button", { name: "หนาวสั่น" }).click();
    await expect(page.getByText("วันนี้ควรพัก")).toBeVisible();
  });

  test("หายใจไม่โล่ง triggers hard_stop guardrail", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "ไอ / หน้าอก" }).click();
    await page.getByRole("button", { name: "หายใจไม่โล่ง" }).click();
    await expect(page.getByText("วันนี้ควรพัก")).toBeVisible();
  });

  test("อาเจียน triggers hard_stop guardrail", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "ท้อง / คลื่นไส้" }).click();
    await page.getByRole("button", { name: "อาเจียน" }).click();
    await expect(page.getByText("วันนี้ควรพัก")).toBeVisible();
  });

  test("save button disabled when sick with no symptoms and no note", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    const saveBtn = page.getByRole("button", { name: "บันทึกอาการวันนี้" });
    await expect(saveBtn).toBeDisabled();
  });

  test("save button enabled after adding a note when sick", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByPlaceholder(/เช่น เริ่มเจ็บคอ/).fill("เริ่มปวดหัวตั้งแต่เช้า");
    const saveBtn = page.getByRole("button", { name: "บันทึกอาการวันนี้" });
    await expect(saveBtn).toBeEnabled();
  });

  test("safety disclaimer is always visible", async ({ page }) => {
    await expect(page.getByText("RunMate ไม่ได้วินิจฉัยโรค")).toBeVisible();
  });

  test("multiple groups can be selected simultaneously", async ({ page }) => {
    await page.getByText("ไม่สบาย / ป่วย").click();
    await page.getByRole("button", { name: "คอ / จมูก" }).click();
    await page.getByRole("button", { name: "ไอ / หน้าอก" }).click();
    await expect(page.getByRole("button", { name: "เจ็บคอ" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ไอ" })).toBeVisible();
  });
});
