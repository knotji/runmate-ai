import { describe, expect, it } from "vitest";
import { buildHrZones } from "@/lib/hr/hrZones";

describe("buildHrZones — HRR method", () => {
  it("MaxHR 188 + RHR 50 returns Zone 2 around 133–147", () => {
    const result = buildHrZones({ maxHr: 188, restingHr: 50 });
    expect(result).not.toBeNull();
    expect(result!.method).toBe("hrr");
    const z2 = result!.zones.find((z) => z.key === "z2")!;
    expect(z2.minBpm).toBeCloseTo(133, 0);
    expect(z2.maxBpm).toBeCloseTo(147, 0);
  });

  it("easy cap from HRR equals upper Zone 2", () => {
    const result = buildHrZones({ maxHr: 188, restingHr: 50 });
    const z2 = result!.zones.find((z) => z.key === "z2")!;
    expect(result!.easyCapBpm).toBe(z2.maxBpm);
  });

  it("missing RHR falls back to another method or returns null", () => {
    const result = buildHrZones({ maxHr: 188 });
    // No restingHr, no AT/AnT → falls back to max_hr method
    expect(result).not.toBeNull();
    expect(result!.method).toBe("max_hr");
  });

  it("no data at all returns null", () => {
    expect(buildHrZones({})).toBeNull();
  });
});

describe("buildHrZones — AT/AnT method", () => {
  it("AT 146 + AnT 172 returns easy cap 145 or 146", () => {
    const result = buildHrZones({ aerobicThresholdHr: 146, anaerobicThresholdHr: 172 });
    expect(result).not.toBeNull();
    expect(result!.method).toBe("at_ant");
    expect([145, 146]).toContain(result!.easyCapBpm);
  });

  it("steady zone starts above AT", () => {
    const result = buildHrZones({ aerobicThresholdHr: 146, anaerobicThresholdHr: 172 });
    const steady = result!.zones.find((z) => z.key === "steady")!;
    expect(steady.minBpm).toBeGreaterThan(146);
  });

  it("hard zone starts above AnT", () => {
    const result = buildHrZones({ aerobicThresholdHr: 146, anaerobicThresholdHr: 172 });
    const hard = result!.zones.find((z) => z.key === "hard")!;
    expect(hard.minBpm).toBeGreaterThan(172);
  });
});

describe("buildHrZones — manual method", () => {
  it("manualEasyCapHr returns exact cap", () => {
    const result = buildHrZones({ method: "manual", manualEasyCapHr: 145 });
    expect(result).not.toBeNull();
    expect(result!.method).toBe("manual");
    expect(result!.easyCapBpm).toBe(145);
  });

  it("manual method without a manual cap falls back or returns null", () => {
    const result = buildHrZones({ method: "manual" });
    expect(result).toBeNull();
  });
});

describe("buildHrZones — Max HR fallback", () => {
  it("Max HR fallback works cautiously with a note", () => {
    const result = buildHrZones({ maxHr: 190 });
    expect(result).not.toBeNull();
    expect(result!.method).toBe("max_hr");
    expect(result!.notesTh.length).toBeGreaterThan(0);
  });

  it("Max HR 215 triggers a high-value warning note", () => {
    const result = buildHrZones({ maxHr: 215 });
    expect(result).not.toBeNull();
    expect(result!.notesTh.some((n) => n.includes("สูงมาก"))).toBe(true);
  });
});

describe("buildHrZones — method priority", () => {
  it("prefers HRR over AT/AnT when both are available", () => {
    const result = buildHrZones({
      maxHr: 188,
      restingHr: 50,
      aerobicThresholdHr: 146,
      anaerobicThresholdHr: 172,
    });
    expect(result!.method).toBe("hrr");
  });

  it("honors an explicit usable method over the default priority", () => {
    const result = buildHrZones({
      method: "at_ant",
      maxHr: 188,
      restingHr: 50,
      aerobicThresholdHr: 146,
      anaerobicThresholdHr: 172,
    });
    expect(result!.method).toBe("at_ant");
  });
});
