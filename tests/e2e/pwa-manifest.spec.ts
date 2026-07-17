import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test("manifest.webmanifest returns valid JSON configuration and icons respond 200", async ({ page }) => {
  // 1. Fetch manifest.webmanifest and verify JSON contents
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.status()).toBe(200);
  const manifest = await manifestResponse.json();

  expect(manifest.name).toBe("RunMate AI");
  expect(manifest.short_name).toBe("RunMate");
  expect(manifest.start_url).toBe("/");
  expect(manifest.display).toBe("standalone");
  expect(manifest.background_color).toBe("#F7F8FA");
  expect(manifest.theme_color).toBe("#3B6EF6");

  // Verify icons structure
  expect(manifest.icons).toBeDefined();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  const icon192 = manifest.icons.find((i: { sizes: string; src: string }) => i.sizes === "192x192");
  const icon512 = manifest.icons.find((i: { sizes: string; src: string }) => i.sizes === "512x512");
  expect(icon192).toBeDefined();
  expect(icon512).toBeDefined();

  // 2. Fetch the icon files directly to verify they are served correctly
  const icon192Response = await page.request.get(icon192.src);
  expect(icon192Response.status()).toBe(200);
  expect(icon192Response.headers()["content-type"]).toContain("image/png");

  const icon512Response = await page.request.get(icon512.src);
  expect(icon512Response.status()).toBe(200);
  expect(icon512Response.headers()["content-type"]).toContain("image/png");
});

test("Settings displays the PWA install hint card", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/settings");
  
  // Go to Data tab
  await page.getByRole("button", { name: "ข้อมูล", exact: true }).click();

  // Expect install hint title to be visible
  await expect(page.getByText("เพิ่ม RunMate ไว้หน้า Home")).toBeVisible();
  await expect(page.getByText("เปิดจากมือถือเพื่อใช้เหมือนแอป")).toBeVisible();
});
