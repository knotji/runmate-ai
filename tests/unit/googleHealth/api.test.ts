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

  it("falls back to slicing the UTC instant when civil time is absent", () => {
    const interval = { startTime: "2026-07-16T23:00:00Z", endTime: "2026-07-17T07:00:00Z" };
    expect(intervalCivilDateKey(interval, "start")).toBe("2026-07-16");
    expect(intervalCivilDateKey(interval, "end")).toBe("2026-07-17");
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
