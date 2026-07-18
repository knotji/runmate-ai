import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// syncGoogleHealthForConnection must skip auto-importing a day that already has a
// manually-logged entry, so a 30-day backfill run over history that predates the
// Google Health connection doesn't create duplicate sleep/workout entries next to
// what the user already uploaded themselves (the reported bug).

type Row = Record<string, unknown>;

// Resolves PostgREST-style JSON path column refs (e.g. "data->>dateKey",
// "data->coach->>aiSummary") against a plain row object.
function resolvePath(row: Row, col: string): unknown {
  if (!col.includes("->")) return row[col];
  const parts = col.split(/->>?/).filter(Boolean);
  let value: unknown = row;
  for (const part of parts) {
    value = (value as Record<string, unknown> | undefined)?.[part];
  }
  return value;
}

function makeFakeSupabase(seed: { history_items?: Row[] } = {}): SupabaseClient {
  const tables: Record<string, Row[]> = {
    history_items: seed.history_items ? [...seed.history_items] : [],
    google_health_connections: [],
  };

  function from(table: string) {
    const rows = tables[table];
    const filters: ((row: Row) => boolean)[] = [];
    let limitCount: number | null = null;

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((row) => resolvePath(row, col) === val);
        return builder;
      },
      like(col: string, pattern: string) {
        const prefix = pattern.replace(/%/g, "");
        filters.push((row) => String(resolvePath(row, col) ?? "").startsWith(prefix));
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        if (op === "like") {
          const pattern = String(val).replace(/%/g, "");
          filters.push((row) => !String(resolvePath(row, col) ?? "").startsWith(pattern));
        }
        return builder;
      },
      limit(n: number) {
        limitCount = n;
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
      // Makes the builder itself awaitable (like the real Supabase client) for
      // callers that don't terminate the chain with .maybeSingle() — e.g.
      // fetching every matching row rather than a single one.
      then(resolve: (result: { data: Row[]; error: null }) => void) {
        const matched = rows.filter((row) => filters.every((f) => f(row)));
        resolve({ data: limitCount != null ? matched.slice(0, limitCount) : matched, error: null });
      },
    };
    return builder;
  }

  return { from, __tables: tables } as unknown as SupabaseClient;
}

const originalFetch = globalThis.fetch;

function installGoogleHealthFetchMock(overrides: { sleepDataPoints?: unknown[]; exerciseDataPoints?: unknown[] } = {}) {
  const defaultSleepPoints = [{
    name: "users/me/dataTypes/sleep/dataPoints/sleep-1",
    sleep: {
      interval: { startTime: "2026-07-16T18:00:00Z", endTime: "2026-07-17T01:00:00Z" },
      summary: { minutesAsleep: "400" },
    },
  }];
  const defaultExercisePoints = [{
    name: "users/me/dataTypes/exercise/dataPoints/exercise-1",
    exercise: {
      interval: { startTime: "2026-07-17T01:23:00Z", endTime: "2026-07-17T02:00:00Z" },
      exerciseType: "TREADMILL_RUN",
      metricsSummary: { distanceMillimeters: 5_110_000, averageHeartRateBeatsPerMinute: "156" },
    },
  }];

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/dataTypes/sleep/dataPoints")) {
      return new Response(JSON.stringify({
        dataPoints: overrides.sleepDataPoints ?? defaultSleepPoints,
      }), { status: 200 });
    }
    if (url.includes("/dataTypes/exercise/dataPoints")) {
      return new Response(JSON.stringify({
        dataPoints: overrides.exerciseDataPoints ?? defaultExercisePoints,
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

  it("stores the real event time as created_at, not the sync job's execution time", async () => {
    // The Report list's time-of-day display keys off created_at (recordedAt is always
    // a synthetic noon placeholder — see logs/page.tsx's formatItemDateTime). Using
    // `new Date()` here would show the sync job's run time instead of when the sleep/
    // workout actually happened, or hide the time entirely for backfilled days.
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    const admin = makeFakeSupabase() as SupabaseClient & { __tables: { history_items: Row[] } };

    await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    const sleepRow = admin.__tables.history_items.find((r) => r.type === "sleep");
    const workoutRow = admin.__tables.history_items.find((r) => r.type === "workout");
    expect(sleepRow?.created_at).toBe("2026-07-17T01:00:00Z");
    expect(workoutRow?.created_at).toBe("2026-07-17T01:23:00Z");
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

  it("skips importing a nap so it can never outrank the real night's sleep as 'latest sleep'", async () => {
    installGoogleHealthFetchMock({
      sleepDataPoints: [
        {
          name: "users/me/dataTypes/sleep/dataPoints/real-sleep",
          sleep: {
            interval: { startTime: "2026-07-16T18:00:00Z", endTime: "2026-07-17T01:00:00Z" },
            summary: { minutesAsleep: "400" },
          },
        },
        {
          name: "users/me/dataTypes/sleep/dataPoints/afternoon-nap",
          sleep: {
            interval: { startTime: "2026-07-17T07:00:00Z", endTime: "2026-07-17T07:30:00Z" },
            summary: { minutesAsleep: "30" },
            metadata: { nap: true },
          },
        },
      ],
    });
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    const admin = makeFakeSupabase() as SupabaseClient & { __tables: { history_items: Row[] } };

    const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    expect(result.sleepImported).toBe(1);
    expect(result.sleepSkippedNap).toBe(1);
    const sleepRows = admin.__tables.history_items.filter((r) => r.type === "sleep");
    expect(sleepRows).toHaveLength(1);
    expect(sleepRows[0].id).toContain("real-sleep");
  });

  // Reported: two runs from the same session at 06:32 both landed in the Report
  // list (one via phone, one via watch, both synced into Health Connect as
  // separate exercise records) — the exact-id dedup above can't catch this
  // since the two records genuinely have different ids.
  it("skips a workout that looks like the same run as one already in history (different device, same session)", async () => {
    installGoogleHealthFetchMock({
      exerciseDataPoints: [{
        name: "users/me/dataTypes/exercise/dataPoints/exercise-from-watch",
        exercise: {
          interval: { startTime: "2026-07-17T01:23:00Z", endTime: "2026-07-17T02:00:00Z" },
          exerciseType: "RUNNING",
          metricsSummary: { distanceMillimeters: 10_160_000 },
        },
      }],
    });
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    const admin = makeFakeSupabase({
      history_items: [{
        id: "ghealth-exercise-from-phone",
        user_id: "user-1",
        type: "workout",
        created_at: "2026-07-17T01:25:00Z",
        data: { dateKey: "2026-07-17", extracted: { distanceKm: 10.38 } },
      }],
    });

    const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    expect(result.workoutsImported).toBe(0);
    expect(result.workoutsSkippedDuplicate).toBe(1);
    expect(result.workoutsSkippedManual).toBe(0);
  });

  // Historical backfill (generateCoach: false) leaves fallback coach commentary
  // on every item forever otherwise, since exact-id dedup means a later sync
  // never revisits an already-imported item — this is the catch-up path.
  describe("backfillMissingCoachCommentary (via a generateCoach: true sync)", () => {
    const FALLBACK_WORKOUT_SUMMARY = "ข้อมูลซ้อมนำเข้าจาก Google Health แล้ว ระบบยังสรุปความเห็นเพิ่มเติมไม่สำเร็จ";
    const FALLBACK_SLEEP_SUMMARY = "ข้อมูลนอนนำเข้าจาก Google Health แล้ว ระบบยังสรุปความเห็นเพิ่มเติมไม่สำเร็จ";

    function staleWorkoutRow(id: string): Row {
      return {
        id,
        user_id: "user-1",
        type: "workout",
        created_at: "2026-06-01T01:00:00Z",
        data: { dateKey: "2026-06-01", extracted: { distanceKm: 5 }, coach: { workoutSummary: FALLBACK_WORKOUT_SUMMARY } },
      };
    }

    it("regenerates coach commentary for a ghealth- item still carrying the fallback text", async () => {
      installGoogleHealthFetchMock({ sleepDataPoints: [], exerciseDataPoints: [] });
      const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
      const admin = makeFakeSupabase({
        history_items: [{
          id: "ghealth-exercise-stale",
          user_id: "user-1",
          type: "sleep",
          created_at: "2026-06-01T22:00:00Z",
          data: { dateKey: "2026-06-01", extracted: { actualSleepDurationMinutes: 400 }, coach: { aiSummary: FALLBACK_SLEEP_SUMMARY } },
        }],
      }) as SupabaseClient & { __tables: { history_items: Row[] } };

      const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: true });

      expect(result.sleepCoachBackfilled).toBe(1);
      // No AI provider configured in this test env, so jsonFromAI falls back to
      // the same fallback object — but the important thing this test verifies
      // is that the item was actually looked at and updated (the count above),
      // not the specific content of a real AI response.
      const updated = admin.__tables.history_items.find((r) => r.id === "ghealth-exercise-stale");
      expect((updated?.data as { coach: { aiSummary: string } }).coach.aiSummary).toBe(FALLBACK_SLEEP_SUMMARY);
    });

    it("does not touch stale items when generateCoach is false (backfill itself)", async () => {
      installGoogleHealthFetchMock({ sleepDataPoints: [], exerciseDataPoints: [] });
      const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
      const admin = makeFakeSupabase({ history_items: [staleWorkoutRow("ghealth-exercise-stale")] });

      const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

      expect(result.workoutCoachBackfilled).toBe(0);
    });

    it("caps how many stale items get backfilled in a single sync call", async () => {
      installGoogleHealthFetchMock({ sleepDataPoints: [], exerciseDataPoints: [] });
      const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
      const staleRows = Array.from({ length: 8 }, (_, i) => staleWorkoutRow(`ghealth-exercise-stale-${i}`));
      const admin = makeFakeSupabase({ history_items: staleRows });

      const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: true });

      expect(result.workoutCoachBackfilled).toBe(5);
    });

    it("does not touch a manually-entered or already-real-analyzed item", async () => {
      installGoogleHealthFetchMock({ sleepDataPoints: [], exerciseDataPoints: [] });
      const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
      const admin = makeFakeSupabase({
        history_items: [{
          id: "ghealth-exercise-already-real",
          user_id: "user-1",
          type: "workout",
          created_at: "2026-06-01T01:00:00Z",
          data: { dateKey: "2026-06-01", extracted: { distanceKm: 5 }, coach: { workoutSummary: "วิ่งดีมาก โหลดพอเหมาะ" } },
        }],
      });

      const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: true });

      expect(result.workoutCoachBackfilled).toBe(0);
    });
  });

  it("imports a distinct second run on the same day that doesn't overlap the first", async () => {
    installGoogleHealthFetchMock({
      exerciseDataPoints: [{
        name: "users/me/dataTypes/exercise/dataPoints/evening-run",
        exercise: {
          interval: { startTime: "2026-07-17T12:00:00Z", endTime: "2026-07-17T12:40:00Z" },
          exerciseType: "RUNNING",
          metricsSummary: { distanceMillimeters: 5_000_000 },
        },
      }],
    });
    const { syncGoogleHealthForConnection } = await import("@/lib/googleHealth/syncUser");
    const admin = makeFakeSupabase({
      history_items: [{
        id: "ghealth-exercise-morning-run",
        user_id: "user-1",
        type: "workout",
        created_at: "2026-07-17T01:25:00Z",
        data: { dateKey: "2026-07-17", extracted: { distanceKm: 10.38 } },
      }],
    });

    const result = await syncGoogleHealthForConnection(admin, connection, "2026-07-01", { generateCoach: false });

    expect(result.workoutsImported).toBe(1);
    expect(result.workoutsSkippedDuplicate).toBe(0);
  });
});
