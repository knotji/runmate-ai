import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSleepTargetLabel } from "@/lib/push/personalizedReminder";

type Row = Record<string, unknown>;

function makeFakeSupabase(rows: Row[]): SupabaseClient {
  return {
    from() {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        in() {
          return builder;
        },
        async gte() {
          return { data: rows, error: null };
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

function sleepRow(id: string, daysAgo: number, minutes: number): Row {
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return {
    id,
    type: "sleep",
    created_at: createdAt,
    data: { extracted: { actualSleepDurationMinutes: minutes, sleepScore: 70, restingHR: 50, hrv: 55 } },
  };
}

describe("buildSleepTargetLabel", () => {
  it("returns null when there is no recent history", async () => {
    const admin = makeFakeSupabase([]);
    const label = await buildSleepTargetLabel(admin, "user-1");
    expect(label).toBeNull();
  });

  it("returns a Thai sleep-target label when there is enough recent sleep history", async () => {
    const admin = makeFakeSupabase([
      sleepRow("sleep-1", 1, 420),
      sleepRow("sleep-2", 2, 400),
      sleepRow("sleep-3", 3, 380),
    ]);
    const label = await buildSleepTargetLabel(admin, "user-1");
    expect(label).toBeTruthy();
    expect(label).toMatch(/นอน/);
  });

  it("returns null instead of throwing when the query errors", async () => {
    const admin = {
      from() {
        const builder = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          in() {
            return builder;
          },
          async gte() {
            return { data: null, error: new Error("db error") };
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    const label = await buildSleepTargetLabel(admin, "user-1");
    expect(label).toBeNull();
  });
});
