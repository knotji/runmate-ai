import { test, expect } from "@playwright/test";
import { saveCoachMessage, fetchRecentCoachMessages, clearCoachMessages } from "@/lib/coachMessages";
import { buildLatestReportContextOverride } from "@/app/api/coach-chat/route";
import { installMockBackend, gotoApp } from "./helpers/app";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock Supabase client for unit testing the TS helpers
type MockRowInput = { user_id: string; role: string; content: string; metadata?: Record<string, unknown> };
type MockMessage = { id: string; user_id: string; role: string; content: string; created_at: string; metadata: Record<string, unknown> };

const createMockSupabase = (dbState: { messages: MockMessage[] }): SupabaseClient => {
  return {
    from: (table: string) => {
      if (table !== "coach_messages") throw new Error("Unsupported mock table: " + table);
      return {
        insert: (row: MockRowInput) => {
          return {
            select: () => {
              return {
                single: () => {
                  const newRow: MockMessage = {
                    id: "msg-mock-" + Math.random(),
                    user_id: row.user_id,
                    role: row.role,
                    content: row.content,
                    created_at: new Date().toISOString(),
                    metadata: row.metadata || {},
                  };
                  dbState.messages.push(newRow);
                  return { data: newRow, error: null };
                }
              };
            }
          };
        },
        select: (_fields: string) => {
          return {
            eq: (_field: string, val: string) => {
              return {
                order: (_ordField: string, _options: { ascending: boolean }) => {
                  return {
                    limit: (lim: number) => {
                      const filtered = dbState.messages.filter((m) => m.user_id === val);
                      // Sort by created_at desc
                      const sorted = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
                      const sliced = sorted.slice(0, lim);
                      return { data: sliced, error: null };
                    }
                  };
                }
              };
            }
          };
        },
        delete: () => {
          return {
            eq: (_field: string, val: string) => {
              dbState.messages = dbState.messages.filter((m) => m.user_id !== val);
              return { error: null };
            }
          };
        }
      };
    }
  } as unknown as SupabaseClient;
};

// ── TS Storage Helpers Unit Tests ───────────────────────────────────────────

test.describe("Coach messages database query helpers", () => {
  test("1) saveCoachMessage writes content and trims if too long", async () => {
    const dbState = { messages: [] };
    const client = createMockSupabase(dbState);

    const longText = "a".repeat(6000);
    const saved = await saveCoachMessage(client, {
      userId: "user-123",
      role: "user",
      content: longText,
      metadata: { app: "runmate" },
    });

    expect(saved).not.toBeNull();
    expect(saved!.content.length).toBe(5000); // verify content trimmed to 5000
    expect(dbState.messages.length).toBe(1);
    expect(dbState.messages[0].metadata).toEqual({ app: "runmate" });
  });

  test("2) fetchRecentCoachMessages returns latest N in chronological order", async () => {
    const dbState = {
      messages: [
        { id: "1", user_id: "u-1", role: "user", content: "first", created_at: "2026-07-03T10:00:00Z" },
        { id: "2", user_id: "u-1", role: "assistant", content: "second", created_at: "2026-07-03T10:01:00Z" },
        { id: "3", user_id: "u-1", role: "user", content: "third", created_at: "2026-07-03T10:02:00Z" },
      ]
    };
    const client = createMockSupabase(dbState);

    // Fetch latest 2. Latest should be 'second' and 'third', and reversed to chronological order ('second', 'third')
    const history = await fetchRecentCoachMessages(client, { userId: "u-1", limit: 2 });
    expect(history.length).toBe(2);
    expect(history[0].content).toBe("second");
    expect(history[1].content).toBe("third");
  });

  test("3) clearCoachMessages deletes all rows for user", async () => {
    const dbState = {
      messages: [
        { id: "1", user_id: "u-1", role: "user", content: "first", created_at: "2026-07-03T10:00:00Z" },
        { id: "2", user_id: "u-2", role: "user", content: "second", created_at: "2026-07-03T10:01:00Z" },
      ]
    };
    const client = createMockSupabase(dbState);

    const success = await clearCoachMessages(client, { userId: "u-1" });
    expect(success).toBe(true);
    expect(dbState.messages.length).toBe(1);
    expect(dbState.messages[0].user_id).toBe("u-2");
  });
});

// ── Guardrail Priority Prompt Logic Unit Tests ──────────────────────────────

test.describe("Guardrail priority prompt helper", () => {
  test("1) buildLatestReportContextOverride contains safety rules overriding chat history", () => {
    const context = {
      sleepAvg7dText: "7 ชั่วโมง 15 นาที",
      sleepNightCount7d: 5,
      latestSleepDurationText: "8 ชั่วโมง",
      latestSleepDateKey: "2026-07-03",
    };

    const prompt = buildLatestReportContextOverride(context);
    expect(prompt).toContain("LATEST REPORT CONTEXT OVERRIDES CHAT HISTORY:");
    expect(prompt).toContain("Recent chat history is lower priority than today's safety and recovery context.");
    expect(prompt).toContain("If recent chat says user wanted tempo but current painRecoveryStatus is active_pain/recent_pain/cleared_light, Coach must not recommend tempo.");
    expect(prompt).toContain("Current sleepAvg7dText: 7 ชั่วโมง 15 นาที from 5 deduped sleep night(s)");
  });
});

// ── E2E Chat Interface Integration Tests ────────────────────────────────────

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

test.describe("E2E Coach Chat and Memory Interface", () => {
  let mockDB: MockMessage[] = [];

  test.beforeEach(() => {
    mockDB = [];
  });

  const setupMockDBSupabaseRoute = async (page: import("@playwright/test").Page) => {
    await page.route("**/e2e-supabase/rest/v1/coach_messages**", async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: CORS_HEADERS,
          body: JSON.stringify(mockDB),
        });
        return;
      }
      if (method === "POST") {
        const body = route.request().postDataJSON();
        const newMsg = {
          id: "msg-" + Math.random(),
          user_id: body.user_id || "test-user",
          role: body.role,
          content: body.content,
          created_at: new Date().toISOString(),
          metadata: body.metadata || {},
        };
        mockDB.push(newMsg);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: CORS_HEADERS,
          body: JSON.stringify(newMsg),
        });
        return;
      }
      if (method === "DELETE") {
        mockDB = [];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: CORS_HEADERS,
          body: JSON.stringify([]),
        });
        return;
      }
    });
  };

  test("1) Coach empty chat state appears when there are no messages", async ({ page }) => {
    await installMockBackend(page);
    await setupMockDBSupabaseRoute(page);

    await gotoApp(page, "/coach");

    // Verify empty state is displayed
    const emptyState = page.getByTestId("chat-empty-state");
    await expect(emptyState).toBeVisible();
    await expect(emptyState.getByText("ยังไม่มีบทสนทนากับโค้ชวันนี้")).toBeVisible();
    await expect(emptyState.getByText("ลองถามว่า วันนี้ควรซ้อมยังไงดี")).toBeVisible();

    // Verify header and privacy text are visible
    await expect(page.getByRole("heading", { name: "บทสนทนาล่าสุด" })).toBeVisible();
    await expect(page.getByText("Coach จะจำเฉพาะบทสนทนาล่าสุด")).toBeVisible();
  });

  test("2) Sending a message appends user bubble and assistant bubble", async ({ page }) => {
    await installMockBackend(page);
    await setupMockDBSupabaseRoute(page);

    await gotoApp(page, "/coach");

    // Fill message input and send
    const input = page.getByLabel("ถามโค้ชเรื่องซ้อม กิน นอน recovery หรืออาการเจ็บ");
    await input.fill("พรุ่งนี้ซ้อมอะไรดี");
    await page.getByRole("button", { name: "ส่ง" }).click();

    // Verify user bubble appears
    const userMsg = page.getByTestId("chat-message-user");
    await expect(userMsg).toBeVisible();
    await expect(userMsg.getByText("คุณ")).toBeVisible();
    await expect(userMsg.getByText("พรุ่งนี้ซ้อมอะไรดี")).toBeVisible();

    // Verify assistant bubble appears (API mock returns mock response)
    const coachMsg = page.getByTestId("chat-message-assistant");
    await expect(coachMsg).toBeVisible();
    expect(await coachMsg.count()).toBeGreaterThanOrEqual(1);
    await expect(coachMsg.getByText("Coach")).toBeVisible();
    await expect(coachMsg.getByText("วันนี้แนะนำ 3 ตัวเลือกที่ทำได้จริงครับ")).toBeVisible();
  });

  test("3) Recent messages render in scrollable chat area on mount", async ({ page }) => {
    await installMockBackend(page);
    mockDB = [
      { id: "1", user_id: "test-user", role: "user", content: "สวัสดีครับโค้ช", created_at: "2026-07-03T10:00:00Z", metadata: {} },
      { id: "2", user_id: "test-user", role: "assistant", content: "สวัสดีครับ สบายดีไหมครับ", created_at: "2026-07-03T10:01:00Z", metadata: {} },
    ];
    await setupMockDBSupabaseRoute(page);

    await gotoApp(page, "/coach");

    // Empty state should NOT be visible
    await expect(page.getByTestId("chat-empty-state")).not.toBeVisible();

    // History bubbles should be loaded and visible
    const userMsg = page.getByTestId("chat-message-user");
    await expect(userMsg).toBeVisible();
    await expect(userMsg.getByText("สวัสดีครับโค้ช")).toBeVisible();

    const coachMsg = page.getByTestId("chat-message-assistant");
    await expect(coachMsg).toBeVisible();
    await expect(coachMsg.getByText("สวัสดีครับ สบายดีไหมครับ")).toBeVisible();
  });

  test("4) Clear chat removes visible messages and shows toast alert", async ({ page }) => {
    await installMockBackend(page);
    mockDB = [
      { id: "1", user_id: "test-user", role: "user", content: "สวัสดี", created_at: "2026-07-03T10:00:00Z", metadata: {} },
    ];
    await setupMockDBSupabaseRoute(page);

    await gotoApp(page, "/coach");

    // Verify history loaded
    await expect(page.getByTestId("chat-message-user")).toBeVisible();

    // Intercept window.confirm dialog to return true automatically
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("ล้างบทสนทนากับโค้ชทั้งหมดไหม?");
      await dialog.accept();
    });

    // Click "ล้างแชท" button
    await page.getByRole("button", { name: "ล้างแชท" }).click();

    // Verify empty state is restored
    await expect(page.getByTestId("chat-empty-state")).toBeVisible();

    // Verify toast notification is displayed
    const toast = page.locator("#clear-chat-toast-container");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("ล้างแชทโค้ชแล้ว");
  });
});
