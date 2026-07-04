/**
 * Pain page — recovery status selector
 * Tests the new "สถานะอาการตอนนี้" UI and its effect on the form / submit.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test.describe("Pain page — status selector UI", () => {
  test("shows สถานะอาการตอนนี้ section with 4 options", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/pain");

    const selector = page.getByTestId("pain-status-selector");
    await expect(selector).toBeVisible({ timeout: 10000 });
    await expect(selector).toContainText("สถานะอาการตอนนี้");
    await expect(page.getByRole("button", { name: /ยังเจ็บอยู่/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /ดีขึ้น แต่ยังระวัง/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /กลับมาเบา ๆ ได้/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /กลับมาปกติแล้ว/ })).toBeVisible();
  });

  test("default status is ยังเจ็บอยู่ — full form visible", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/pain");

    // Full form fields should be visible by default
    await expect(page.locator('input[type="range"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("ตำแหน่งที่เจ็บ")).toBeVisible();
    await expect(page.getByRole("button", { name: "บันทึกและปรับคำแนะนำวันนี้" })).toBeVisible();
  });

  test("selecting กลับมาปกติแล้ว hides pain detail fields and shows calm card", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/pain");

    await page.getByRole("button", { name: /กลับมาปกติแล้ว/ }).click();

    // Pain detail fields hidden
    await expect(page.locator('input[type="range"]')).not.toBeVisible();
    await expect(page.getByText("ตำแหน่งที่เจ็บ")).not.toBeVisible();

    // Calm confirmation card visible
    await expect(page.getByTestId("cleared-normal-info")).toBeVisible();
    await expect(page.getByTestId("cleared-normal-info")).toContainText("RunMate จะไม่ใช้ pain เป็นตัวบล็อกซ้อมหนัก");

    // Submit button says right text
    await expect(page.getByRole("button", { name: "บันทึกว่ากลับมาปกติแล้ว" })).toBeVisible();
  });

  test("selecting กลับมาเบา ๆ ได้ shows simplified form and correct button text", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/pain");

    await page.getByRole("button", { name: /กลับมาเบา ๆ ได้/ }).click();

    await expect(page.locator('input[type="range"]')).not.toBeVisible();
    await expect(page.getByRole("button", { name: "บันทึกว่ากลับมาเบา ๆ ได้" })).toBeVisible();
  });

  test("selecting ดีขึ้น แต่ยังระวัง keeps full form and standard button text", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/pain");

    await page.getByRole("button", { name: /ดีขึ้น แต่ยังระวัง/ }).click();

    await expect(page.locator('input[type="range"]')).toBeVisible();
    await expect(page.getByText("ตำแหน่งที่เจ็บ")).toBeVisible();
    await expect(page.getByRole("button", { name: "บันทึกและปรับคำแนะนำวันนี้" })).toBeVisible();
  });

  test("saving cleared_normal writes recoveryStatus=cleared_normal and resolved=true to history", async ({ page }) => {
    const state = await installMockBackend(page);
    await gotoApp(page, "/pain");

    await page.getByRole("button", { name: /กลับมาปกติแล้ว/ }).click();
    await page.getByRole("button", { name: "บันทึกว่ากลับมาปกติแล้ว" }).click();

    await expect(page.getByTestId("cleared-normal-success")).toBeVisible({ timeout: 10000 });

    const painItems = state.history.filter((i: { type: string }) => i.type === "pain");
    expect(painItems.length).toBe(1);
    const log = painItems[0].data as Record<string, unknown>;
    expect(log.recoveryStatus).toBe("cleared_normal");
    expect(log.resolved).toBe(true);
    expect(log.painLevel).toBe(0);
  });

  test("saving cleared_normal then visiting home shows no pain guardrail", async ({ page }) => {
    const state = await installMockBackend(page);

    // Add an existing active pain item so there's history
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().slice(0, 10);
    state.history.push({
      id: `pain-prev-${Date.now()}`,
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "pain" as const,
      created_at: `${yKey}T08:00:00.000Z`,
      data: {
        painLocation: "เข่า", painSide: "left", painLevel: 4,
        startedWhen: "during_run", painType: ["dull"], painfulWhen: ["running"],
        swellingOrRedness: "no", canBearWeight: "yes", notes: "",
        riskLevel: "medium", trainingImpact: "rest", coachAdvice: "พักก่อน",
        redFlags: [], createdAt: `${yKey}T08:00:00.000Z`,
        resolved: false, status: "active",
        recoveryStatus: "cleared_normal", // explicitly cleared
      },
    });

    await gotoApp(page, "/");

    // No active pain guardrail should appear
    await page.waitForTimeout(1500);
    await expect(page.getByText("ยังมีอาการเจ็บวันนี้")).toHaveCount(0);
    await expect(page.getByTestId("readiness-signal-bars")).toBeVisible({ timeout: 10000 });
  });
});
