import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// syncGoogleHealthForConnection must skip auto-importing a day that already has a
// manually-logged entry, so a 30-day backfill run over history that predates the
// Google Health connection doesn't create duplicate sleep/workout entries next to
// what the user already uploaded themselves (the reported bug).

type Row = Record<string, unknown>;

function resolvePath(row: Row, col: string): unknown {
  if (col === "data->>dateKey") {
    const data = row.data as Record<string, unknown> | undefined;
    return data?.dateKey;
  }
  return row[col];
}

function makeFakeSupabase(seed: { history_items?: Row[] } = {}): SupabaseClient {
  const tables: Record<string, Row[]> = {
    history_items: seed.history_items ? [...seed.history_items] : [],
    google_health_connections: [],
  };

  function from(table: string) {
    const rows = tables[table];
    const filters: ((row: Row) => boolean)[] = [];

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => resolvePath(row, col) === val);
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        if (op === "like") {
          const pattern = String(val).replace(/%/g, "");
          filters.push((row) => !String(resolvePath(row, col) ?? "").startsWith(pattern));
        }
        return builder;
      },
      limit() {
        return builder;
      },
      async maybeSingle() {
        const match = rows.filter((row) => filters.every((f) => f(row)))[0] ?? null;
        return { data: match, error: null };
      },
      async insert(row: Row) {
        rows.push(row);
        return { data: row, error: null };
      },
      update(patch: Row) {
        return {
          async eq(col: string, val: unknown) {
            rows.forEach((row) => {
              if (resolvePath(row, col) === val) Object.assign(row, patch);
            });
            return { data: null, error: null };
          },
        };
      },
    };
    return builder;
  }

  return { from, __tables: tables } as unknown as SupabaseClient;
}

const originalFetch = globalThis.fetch;

function installGoogleHealthFetchMock() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/dataTypes/sleep/dataPoints")) {
      return new Response(JSON.stringify({
        dataPoints: [{
          name: "users/me/dataTypes/sleep/dataPoints/sleep-1",
          sleep: {
            interval: { startTime: "2026-07-16T18:00:00Z", endTime: "2026-07-17T01:00:00Z" },
            summary: { minutesAsleep: "400" },
          },
        }],
      }), { status: 200 });
    }
    if (url.includes("/dataTypes/exercise/dataPoints")) {
      return new Response(JSON.stringify({
        dataPoints: [{
          name: "users/me/dataTypes/exercise/dataPoints/exercise-1",
          exercise: {
            interval: { startTime: "2026-07-17T01:23:00Z", endTime: "2026-07-17T02:00:00Z" },
            exerciseType: "TREADMILL_RUN",
            metricsSummary: { distanceMillimeters: 5_110_000, averageHeartRateBeatsPerMinute: "156" },
          },
        }],
      }), { status: 200 });
    }
    if (url.includes("/dataTypes/daily-resting-heart-rate/dataPoints") || url.includes("/dataTypes/daily-heart-rate-variability/dataPoints")) {
      return new Response(JSON.stringify({ dataPoints: [] }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  installGoogleHealthFetchMock();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.resetModules();
});

const connection = {
  user_id: "user-1",
  access_token: "token",
  refresh_token: "refresh",
  expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
};

describe("syncGoogleHealthForConnection", () => {
  it("imports sleep and workout when no manual entry exists for that day", async () => {
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    const admin = makeFakeSupabase();

    const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    expect(result.ok).toBe(true);
    expect(result.sleepImported).toBe(1);
    expect(result.workoutsImported).toBe(1);
    expect(result.sleepSkippedManual).toBe(0);
    expect(result.workoutsSkippedManual).toBe(0);
  });

  it("skips importing a workout for a day that already has a manually-logged workout", async () => {
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    const admin = makeFakeSupabase({
      history_items: [
        { id: "workout-2026-07-17-12345", user_id: "user-1", type: "workout", data: { dateKey: "2026-07-17" } },
      ],
    });

    const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    expect(result.workoutsImported).toBe(0);
    expect(result.workoutsSkippedManual).toBe(1);
    // The manual guard is scoped by type, so a manual *workout* entry doesn't block
    // importing sleep even on the same calendar date.
    expect(result.sleepImported).toBe(1);
  });

  it("skips importing sleep for a day that already has a manually-logged sleep entry", async () => {
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    // The fixture sleep interval ends 2026-07-17T01:00:00Z, which is 08:00 Bangkok on
    // 2026-07-17 (no civilEndTime present, so it resolves via getBangkokDateKey).
    const admin = makeFakeSupabase({
      history_items: [
        { id: "sleep-2026-07-17-99999", user_id: "user-1", type: "sleep", data: { dateKey: "2026-07-17" } },
      ],
    });

    const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    expect(result.sleepImported).toBe(0);
    expect(result.sleepSkippedManual).toBe(1);
  });

  it("does not skip on an existing ghealth-prefixed entry (that's the exact-id dedup's job, not the manual guard)", async () => {
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    const admin = makeFakeSupabase({
      history_items: [
        { id: "ghealth-workout-existing", user_id: "user-1", type: "workout", data: { dateKey: "2026-07-17" } },
      ],
    });

    const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    // A ghealth-prefixed row for the same date doesn't count as "manual" — the new
    // data point still isn't imported here only because its own exact id differs and
    // no manual guard applies, so it should import normally.
    expect(result.workoutsImported).toBe(1);
    expect(result.workoutsSkippedManual).toBe(0);
  });
});
