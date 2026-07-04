import { expect, test, type Page } from "@playwright/test";
import { isSafeRedirect } from "../../src/app/auth/callback/route";

type OAuthArgs = {
  provider: string;
  options?: {
    redirectTo?: string;
  };
};

type AuthMockMode = "pending" | "success" | "error" | "throw";

async function installSupabaseAuthMock(page: Page, mode: AuthMockMode) {
  await page.addInitScript((mockMode) => {
    type TestWindow = Window & {
      __RUNMATE_AUTH_TEST_STATE__: {
        calls: OAuthArgs[];
        mode: AuthMockMode;
      };
      __RUNMATE_SUPABASE_AUTH_MOCK__: {
        auth: {
          signInWithOAuth: (args: OAuthArgs) => Promise<{ error: { message: string } | null }>;
          getUser: () => Promise<{ data: { user: null }; error: null }>;
          getSession: () => Promise<{ data: { session: null }; error: null }>;
          onAuthStateChange: () => {
            data: {
              subscription: {
                unsubscribe: () => void;
              };
            };
          };
        };
      };
    };

    const testWindow = window as TestWindow;
    testWindow.__RUNMATE_AUTH_TEST_STATE__ = {
      calls: [],
      mode: mockMode as AuthMockMode,
    };
    testWindow.__RUNMATE_SUPABASE_AUTH_MOCK__ = {
      auth: {
        async getUser() {
          return { data: { user: null }, error: null };
        },
        async getSession() {
          return { data: { session: null }, error: null };
        },
        onAuthStateChange() {
          return {
            data: {
              subscription: {
                unsubscribe() {},
              },
            },
          };
        },
        async signInWithOAuth(args: OAuthArgs) {
          testWindow.__RUNMATE_AUTH_TEST_STATE__.calls.push(args);

          if (testWindow.__RUNMATE_AUTH_TEST_STATE__.mode === "pending") {
            return new Promise(() => undefined);
          }

          if (testWindow.__RUNMATE_AUTH_TEST_STATE__.mode === "throw") {
            throw new Error("OAuth exploded");
          }

          if (testWindow.__RUNMATE_AUTH_TEST_STATE__.mode === "error") {
            return { error: { message: "OAuth failed" } };
          }

          return { error: null };
        },
      },
    };
  }, mode);
}

async function getOAuthCalls(page: Page): Promise<OAuthArgs[]> {
  return page.evaluate(() => {
    const testWindow = window as Window & {
      __RUNMATE_AUTH_TEST_STATE__?: {
        calls: OAuthArgs[];
      };
    };

    return testWindow.__RUNMATE_AUTH_TEST_STATE__?.calls ?? [];
  });
}

test.describe("isSafeRedirect helper", () => {
  test("allows safe relative paths", () => {
    expect(isSafeRedirect("/")).toBe(true);
    expect(isSafeRedirect("/logs")).toBe(true);
    expect(isSafeRedirect("/race-goal?tab=plan")).toBe(true);
  });

  test("rejects unsafe redirect values", () => {
    expect(isSafeRedirect("https://evil.com")).toBe(false);
    expect(isSafeRedirect("http://evil.com")).toBe(false);
    expect(isSafeRedirect("//evil.com")).toBe(false);
    expect(isSafeRedirect("//evil.com/steal")).toBe(false);
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false);
    expect(isSafeRedirect("evil")).toBe(false);
    expect(isSafeRedirect("")).toBe(false);
  });
});

test.describe("Google Sign-In button", () => {
  test("renders Google login and existing email/password form", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByTestId("google-signin-btn")).toContainText("เข้าสู่ระบบด้วย Google");
    await expect(page.getByText("หรือใช้อีเมล")).toBeVisible();
    await expect(page.getByPlaceholder("อีเมล")).toBeVisible();
    await expect(page.getByPlaceholder("รหัสผ่าน")).toBeVisible();
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true })).toBeVisible();
  });

  test("calls signInWithOAuth with Google provider and callback redirect", async ({ page }) => {
    await installSupabaseAuthMock(page, "pending");
    await page.goto("/login");

    await page.getByTestId("google-signin-btn").click();
    await expect.poll(() => getOAuthCalls(page)).toHaveLength(1);

    const [call] = await getOAuthCalls(page);
    const origin = new URL(page.url()).origin;
    expect(call.provider).toBe("google");
    expect(call.options?.redirectTo).toBe(`${origin}/auth/callback`);
  });

  test("shows loading text and disables the Google button while OAuth is pending", async ({ page }) => {
    await installSupabaseAuthMock(page, "pending");
    await page.goto("/login");

    const button = page.getByTestId("google-signin-btn");
    await button.click();

    await expect(button).toContainText("กำลังไปที่ Google...");
    await expect(button).toBeDisabled();
  });

  test("shows Thai error and resets loading when OAuth returns an error", async ({ page }) => {
    await installSupabaseAuthMock(page, "error");
    await page.goto("/login");

    const button = page.getByTestId("google-signin-btn");
    await button.click();

    await expect(page.getByTestId("google-signin-error")).toHaveText("เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง");
    await expect(button).toContainText("เข้าสู่ระบบด้วย Google");
    await expect(button).toBeEnabled();
  });

  test("shows Thai error and resets loading when OAuth throws", async ({ page }) => {
    await installSupabaseAuthMock(page, "throw");
    await page.goto("/login");

    const button = page.getByTestId("google-signin-btn");
    await button.click();

    await expect(page.getByTestId("google-signin-error")).toHaveText("เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง");
    await expect(button).toContainText("เข้าสู่ระบบด้วย Google");
    await expect(button).toBeEnabled();
  });
});

test.describe("OAuth callback route", () => {
  test("/auth/callback without code redirects to /login?error=oauth", async ({ page }) => {
    const response = await page.goto("/auth/callback");

    await expect(page).toHaveURL(/\/login\?error=oauth/);
    expect(response?.status()).toBeLessThan(500);
  });

  test("/auth/callback with unsafe next param still lands on /login?error=oauth when code is missing", async ({ page }) => {
    await page.goto("/auth/callback?next=//evil.com");

    await expect(page).toHaveURL(/\/login\?error=oauth/);
  });

  test("/auth/callback with safe next param still redirects to login when code is missing", async ({ page }) => {
    await page.goto("/auth/callback?next=/logs");

    await expect(page).toHaveURL(/\/login\?error=oauth/);
  });
});
