import { describe, it, expect } from "vitest";
import { daysAgoBangkokDateKey, todayBangkokDateKey, yesterdayBangkokDateKey } from "@/lib/date";

describe("daysAgoBangkokDateKey", () => {
  it("returns today's dateKey for 0 days ago", () => {
    expect(daysAgoBangkokDateKey(0)).toBe(todayBangkokDateKey());
  });

  it("returns yesterday's dateKey for 1 day ago", () => {
    expect(daysAgoBangkokDateKey(1)).toBe(yesterdayBangkokDateKey());
  });

  it("returns a dateKey 30 days before today", () => {
    const todayMs = Date.parse(`${todayBangkokDateKey()}T12:00:00+07:00`);
    const resultMs = Date.parse(`${daysAgoBangkokDateKey(30)}T12:00:00+07:00`);
    const diffDays = Math.round((todayMs - resultMs) / 86_400_000);
    expect(diffDays).toBe(30);
  });
});
