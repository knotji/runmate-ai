import { describe, it, expect } from "vitest";
import { isStale } from "@/app/api/google-health/sync-if-stale/route";

const NOW = Date.parse("2026-07-18T10:00:00.000Z");

describe("isStale", () => {
  it("is stale when never synced (null)", () => {
    expect(isStale(null, NOW)).toBe(true);
  });

  it("is not stale when synced under 5 minutes ago", () => {
    const fourMinAgo = new Date(NOW - 4 * 60 * 1000).toISOString();
    expect(isStale(fourMinAgo, NOW)).toBe(false);
  });

  it("is stale when synced exactly 5 minutes ago", () => {
    const fiveMinAgo = new Date(NOW - 5 * 60 * 1000).toISOString();
    expect(isStale(fiveMinAgo, NOW)).toBe(true);
  });

  it("is stale when synced well over 5 minutes ago", () => {
    const anHourAgo = new Date(NOW - 60 * 60 * 1000).toISOString();
    expect(isStale(anHourAgo, NOW)).toBe(true);
  });
});
