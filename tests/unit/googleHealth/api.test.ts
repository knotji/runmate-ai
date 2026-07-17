import { describe, it, expect } from "vitest";
import { intervalCivilDateKey, civilDateKey } from "@/lib/googleHealth/api";

describe("civilDateKey", () => {
  it("zero-pads month and day", () => {
    expect(civilDateKey({ year: 2026, month: 7, day: 6 })).toBe("2026-07-06");
  });
});

describe("intervalCivilDateKey", () => {
  it("prefers the server-computed civil date when present", () => {
    // A sleep session ending just after UTC midnight, but still "yesterday" in
    // Bangkok (UTC+7) — exactly the case where slicing endTime would be wrong.
    const interval = {
      startTime: "2026-07-15T23:00:00Z",
      endTime: "2026-07-16T00:30:00Z", // UTC date is 07-16, but Bangkok local date is still 07-16 06:30 — use a clearer case below
      civilEndTime: { date: { year: 2026, month: 7, day: 15 } },
    };
    expect(intervalCivilDateKey(interval, "end")).toBe("2026-07-15");
  });

  it("falls back to the Bangkok-converted date (not a naive UTC slice) when civil time is absent", () => {
    // 2026-07-16T23:00:00Z is 2026-07-17 06:00 in Bangkok (UTC+7) — a naive
    // `.slice(0, 10)` on the UTC string would wrongly say 07-16.
    const interval = { startTime: "2026-07-16T23:00:00Z", endTime: "2026-07-17T07:00:00Z" };
    expect(intervalCivilDateKey(interval, "start")).toBe("2026-07-17");
    expect(intervalCivilDateKey(interval, "end")).toBe("2026-07-17");
  });

  it("does not shift an early-morning Bangkok workout to the previous day (the reported bug)", () => {
    // A treadmill run that actually started 06:58 Bangkok time on 07-17 — its raw
    // UTC instant is 23:58 on 07-16, the previous UTC calendar day. Health-Connect
    // synced records (e.g. from Samsung Health) appear not to carry Google's own
    // civilStartTime, so this exercises exactly the fallback path that broke in
    // production: a naive UTC slice reported this run as 07-16 instead of 07-17.
    const interval = { startTime: "2026-07-16T23:58:00Z", endTime: "2026-07-17T00:33:00Z" };
    expect(intervalCivilDateKey(interval, "start")).toBe("2026-07-17");
  });

  it("uses civilStartTime specifically for the start edge", () => {
    const interval = {
      startTime: "2026-07-16T23:00:00Z",
      endTime: "2026-07-17T07:00:00Z",
      civilStartTime: { date: { year: 2026, month: 7, day: 17 } }, // e.g. local time already past midnight
    };
    expect(intervalCivilDateKey(interval, "start")).toBe("2026-07-17");
  });
});
