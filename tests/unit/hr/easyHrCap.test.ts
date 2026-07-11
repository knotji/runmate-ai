import { describe, expect, it } from "vitest";
import { buildEasyHrCap } from "@/lib/hr/easyHrCap";
import { buildHrZones } from "@/lib/hr/hrZones";

const baseHrZones = buildHrZones({ aerobicThresholdHr: 146, anaerobicThresholdHr: 172 });

describe("buildEasyHrCap — readiness adjustment", () => {
  it("normal day keeps the normal cap", () => {
    const guidance = buildEasyHrCap({ hrZones: baseHrZones, loadScore: 30, sleepScore: 80 });
    expect(guidance).not.toBeNull();
    expect(guidance!.adjustedCapBpm).toBe(guidance!.normalCapBpm);
  });

  it("high load reduces the easy cap", () => {
    const normal = buildEasyHrCap({ hrZones: baseHrZones, loadScore: 30, sleepScore: 80 })!;
    const highLoad = buildEasyHrCap({ hrZones: baseHrZones, loadScore: 70, sleepScore: 80 })!;
    expect(highLoad.adjustedCapBpm).toBeLessThan(normal.adjustedCapBpm);
  });

  it("low sleep reduces the easy cap", () => {
    const normal = buildEasyHrCap({ hrZones: baseHrZones, loadScore: 30, sleepScore: 80 })!;
    const lowSleep = buildEasyHrCap({ hrZones: baseHrZones, loadScore: 30, sleepScore: 30 })!;
    expect(lowSleep.adjustedCapBpm).toBeLessThan(normal.adjustedCapBpm);
  });

  it("high load + low sleep reduces the cap the most", () => {
    const loadOnly = buildEasyHrCap({ hrZones: baseHrZones, loadScore: 70, sleepScore: 80 })!;
    const combined = buildEasyHrCap({ hrZones: baseHrZones, loadScore: 70, sleepScore: 30 })!;
    expect(combined.adjustedCapBpm).toBeLessThanOrEqual(loadOnly.adjustedCapBpm);
  });
});

describe("buildEasyHrCap — hard stops", () => {
  it("sick hard-stop disables the training HR cap", () => {
    const guidance = buildEasyHrCap({ hrZones: baseHrZones, sickRiskLevel: "hard_stop", loadScore: 30, sleepScore: 80 });
    expect(guidance).toBeNull();
  });

  it("active pain does not encourage training via cautionTh", () => {
    const guidance = buildEasyHrCap({
      hrZones: baseHrZones,
      painRecoveryStatus: "active_pain",
      loadScore: 30,
      sleepScore: 80,
    });
    expect(guidance).not.toBeNull();
    expect(guidance!.cautionTh).toBeDefined();
  });

  it("no HR zones means no guidance", () => {
    expect(buildEasyHrCap({ hrZones: null })).toBeNull();
  });
});
