import { describe, it, expect } from "vitest";
import { buildMessage, daysUntil } from "@/app/api/push/send-race-countdown/route";

describe("daysUntil", () => {
  it("returns 0 on race day", () => {
    expect(daysUntil("2026-07-20", "2026-07-20")).toBe(0);
  });

  it("returns a positive count for a future race", () => {
    expect(daysUntil("2026-07-27", "2026-07-20")).toBe(7);
  });

  it("returns a negative count for a race that already passed", () => {
    expect(daysUntil("2026-07-15", "2026-07-20")).toBe(-5);
  });
});

describe("buildMessage", () => {
  it("uses race-day copy at 0 days", () => {
    expect(buildMessage(0, "Bangkok Marathon")).toContain("วันนี้วันแข่ง");
    expect(buildMessage(0, "Bangkok Marathon")).toContain("Bangkok Marathon");
  });

  it("uses tomorrow copy at 1 day", () => {
    expect(buildMessage(1, "Bangkok Marathon")).toContain("พรุ่งนี้วันแข่ง");
  });

  it("uses taper copy at 3 and 7 days", () => {
    expect(buildMessage(3, "Bangkok Marathon")).toContain("3 วัน");
    expect(buildMessage(7, "Bangkok Marathon")).toContain("7");
    expect(buildMessage(7, "Bangkok Marathon")).toContain("taper");
  });
});
