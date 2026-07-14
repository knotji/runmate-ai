import { expect, type Page, type Route } from "@playwright/test";
import { bangkokDateKey, mealAnalysis, sleepAnalysis } from "./testData";

type HistoryRow = {
  id: string;
  user_id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
};

export type MockAppState = {
  history: HistoryRow[];
};

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  aud: "authenticated",
  role: "authenticated",
  email: "runner@example.com",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
};

export async function installMockBackend(
  page: Page,
  options: { suggestedSleepDate?: string } = {},
): Promise<MockAppState> {
  const state: MockAppState = { history: [] };

  await page.addInitScript(({ sessionUser }) => {
    const session = {
      access_token: "e2e-access-token",
      refresh_token: "e2e-refresh-token",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: "bearer",
      user: sessionUser,
    };
    localStorage.setItem("sb-localhost-auth-token", JSON.stringify(session));
    const encoded = btoa(JSON.stringify(session))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    document.cookie = `sb-localhost-auth-token=base64-${encoded}; path=/; SameSite=Lax`;
  }, { sessionUser: user });

  await page.route("**/e2e-supabase/**", async (route) => {
    await handleSupabaseRoute(route, state);
  });

  await page.route("**/api/coach-insight", async (route) => {
    await json(route, {
      ok: true,
      data: {
        todayReadiness: 70,
        readinessLabel: "Good",
        readinessNote: "ข้อมูลทดสอบ",
        workoutRec: "Easy Run",
        workoutTarget: "วิ่งสบาย 30 นาที",
        weekSummary: "ยังไม่มีข้อมูลสัปดาห์นี้",
        keyObservation: "เริ่มเบาก่อน",
        coachMessage: "ฟังร่างกายระหว่างซ้อม",
      },
    });
  });

  await page.route("**/api/analyze-meal", async (route) => {
    const body = route.request().postDataJSON() as { mealType?: string };
    await json(route, mealAnalysis(body.mealType ?? "breakfast"));
  });

  await page.route("**/api/analyze-sleep", async (route) => {
    await json(route, sleepAnalysis(options.suggestedSleepDate ?? bangkokDateKey()));
  });

  await page.route("**/api/coach-chat", async (route) => {
    await json(route, { message: "วันนี้แนะนำ 3 ตัวเลือกที่ทำได้จริงครับ", source: "mock" });
  });

  return state;
}

export async function saveManualBreakfast(page: Page, state: MockAppState): Promise<void> {
  // ?type=meal deep-links straight into focused meal mode — no need to click the type chip.
  await gotoApp(page, "/upload?type=meal");
  await page.getByRole("button", { name: "พิมพ์เอง" }).click();
  await page.getByRole("button", { name: "เช้า", exact: true }).click();
  await page.getByLabel("พิมพ์เมนูของมื้อนี้").fill("ข้าวไข่ต้ม 2 ฟอง นมโปรตีน");
  await page.getByRole("button", { name: "ให้โค้ชประเมิน" }).click();
  await expect(page.getByRole("heading", { name: "ตรวจโภชนาการก่อนบันทึก" })).toBeVisible();
  await expect(page.getByText("กรอกจากข้อความ")).toBeVisible();
  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect.poll(() => state.history.filter((row) => row.type === "meal").length).toBe(1);
  await expect(page.getByRole("heading", { name: "ตรวจโภชนาการก่อนบันทึก" })).toHaveCount(0);
}

export async function gotoApp(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => {
    const interactive = document.querySelector("button, input, textarea");
    if (!interactive) return false;
    return Object.keys(interactive).some((key) => key.startsWith("__reactProps$"));
  });
}

async function handleSupabaseRoute(route: Route, state: MockAppState): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();

  if (method === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders() });
    return;
  }

  if (url.pathname.endsWith("/auth/v1/user")) {
    await json(route, user);
    return;
  }

  if (url.pathname.includes("/auth/v1/token")) {
    await json(route, {
      access_token: "e2e-access-token",
      refresh_token: "e2e-refresh-token",
      expires_in: 3600,
      token_type: "bearer",
      user,
    });
    return;
  }

  const table = url.pathname.split("/rest/v1/")[1]?.split("/")[0];
  if (!table) {
    await json(route, {});
    return;
  }

  if (table === "history_items") {
    if (method === "GET") {
      const typeFilter = url.searchParams.get("type");
      const rows = typeFilter?.startsWith("eq.")
        ? state.history.filter((row) => row.type === typeFilter.slice(3))
        : state.history;
      await json(route, rows);
      return;
    }
    if (method === "POST" || method === "PATCH") {
      const raw = request.postDataJSON() as HistoryRow | HistoryRow[];
      const rows = Array.isArray(raw) ? raw : [raw];
      for (const row of rows) {
        const index = state.history.findIndex((item) => item.id === row.id);
        if (index >= 0) state.history[index] = { ...state.history[index], ...row };
        else state.history.push(row);
      }
      await json(route, rows);
      return;
    }
    if (method === "DELETE") {
      const id = url.searchParams.get("id")?.replace(/^eq\./, "");
      state.history = state.history.filter((row) => row.id !== id);
      await json(route, []);
      return;
    }
  }

  await json(route, []);
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      ...corsHeaders(),
      "content-range": "0-0/0",
    },
    body: JSON.stringify(body),
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info",
    "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  };
}
