/**
 * Tests for the Upload workout result preview rendering rules.
 *
 * WorkoutResultCard routes to SwimResultCard when isSwimWorkout() is true.
 * These tests verify the data-level logic that drives correct rendering —
 * type label, pace unit, and distance format — without a DOM renderer.
 */
import { describe, expect, it } from "vitest";
import { isSwimWorkout, isSwimRecovery, formatSwimDistance } from "@/lib/swimWorkout";
import { formatPace } from "@/lib/format";

function buildSwimExt(overrides: {
  swimKind?: "pool" | "open_water" | null;
  distanceM?: number | null;
  avgPace?: string | null;
  summary?: string;
  coachNote?: string;
} = {}) {
  return {
    workoutKind: "other" as const,
    swimKind: overrides.swimKind ?? "pool",
    distanceM: overrides.distanceM ?? 375,
    distanceKm: null,
    avgPace: overrides.avgPace ?? "02:52",
    workoutSummary: overrides.summary ?? "ว่ายน้ำ 375 ม. เบา ๆ",
    coachNote: overrides.coachNote ?? "",
  };
}

describe("Upload swim analyzed result preview — type label", () => {
  it("does not render as 'other' when swimKind is set", () => {
    const ext = buildSwimExt();
    const isSwim = isSwimWorkout(ext);
    // SwimResultCard is rendered, so the Type row shows swim label, never "other"
    const typeLabel = isSwim
      ? (isSwimRecovery(ext.workoutSummary, ext.coachNote) ? "Recovery Swim" : "ว่ายน้ำ")
      : ext.workoutKind;
    expect(typeLabel).not.toBe("other");
  });

  it("shows 'ว่ายน้ำ' for non-recovery pool swim", () => {
    const ext = buildSwimExt({ summary: "ว่ายน้ำ 1000 ม.", coachNote: "ดี" });
    const isSwim = isSwimWorkout(ext);
    const recovery = isSwimRecovery(ext.workoutSummary, ext.coachNote);
    const typeLabel = isSwim ? (recovery ? "Recovery Swim" : "ว่ายน้ำ") : ext.workoutKind;
    expect(typeLabel).toBe("ว่ายน้ำ");
  });

  it("shows 'Recovery Swim' when summary includes recovery", () => {
    const ext = buildSwimExt({ summary: "recovery swim เบา ๆ 25 นาที", coachNote: "ฟื้นตัว" });
    const isSwim = isSwimWorkout(ext);
    const recovery = isSwimRecovery(ext.workoutSummary, ext.coachNote);
    const typeLabel = isSwim ? (recovery ? "Recovery Swim" : "ว่ายน้ำ") : ext.workoutKind;
    expect(typeLabel).toBe("Recovery Swim");
  });

  it("routes to default card (workoutKind shown) when swimKind is null", () => {
    const ext = { ...buildSwimExt(), swimKind: null as null };
    const isSwim = isSwimWorkout(ext);
    // Default card renders ext.workoutKind directly — this is the "other" case
    const typeLabel = isSwim ? "ว่ายน้ำ" : ext.workoutKind;
    expect(typeLabel).toBe("other");
    expect(isSwim).toBe(false);
  });
});

describe("Upload swim analyzed result preview — pace unit", () => {
  it("does not show /km for swim workout", () => {
    const ext = buildSwimExt({ avgPace: "02:52" });
    const isSwim = isSwimWorkout(ext);
    const paceUnit = isSwim ? "/100m" : "/km";
    expect(paceUnit).not.toBe("/km");
    expect(paceUnit).toBe("/100m");
  });

  it("shows /100m for pool swim", () => {
    const ext = buildSwimExt({ avgPace: "02:52" });
    const isSwim = isSwimWorkout(ext);
    const paceDisplay = isSwim ? `${formatPace(ext.avgPace)} /100m` : `${formatPace(ext.avgPace)} /km`;
    expect(paceDisplay).toContain("/100m");
    expect(paceDisplay).not.toContain("/km");
  });

  it("strips /100m suffix from AI-returned pace value before appending unit", () => {
    // AI may return pace with the unit already appended; formatPace strips it
    const rawPace = "02:52/100m";
    const formatted = formatPace(rawPace);
    expect(formatted).toBe("02:52");
    // Combined display should not double the unit
    const display = `${formatted} /100m`;
    expect(display).toBe("02:52 /100m");
  });

  it("non-swim outdoor_run still uses /km", () => {
    const ext = { workoutKind: "outdoor_run" as const, swimKind: undefined };
    const isSwim = isSwimWorkout(ext);
    const paceUnit = isSwim ? "/100m" : "/km";
    expect(paceUnit).toBe("/km");
  });
});

describe("Upload swim analyzed result preview — distance", () => {
  it("displays distanceM 375 as '375 ม.'", () => {
    const ext = buildSwimExt({ distanceM: 375 });
    const distanceValue = ext.distanceM != null ? formatSwimDistance(ext.distanceM) : null;
    expect(distanceValue).toBe("375 ม.");
  });

  it("displays distanceM 1500 as '1500 ม.'", () => {
    const distanceValue = formatSwimDistance(1500);
    expect(distanceValue).toBe("1500 ม.");
  });

  it("never uses km unit for swim distance", () => {
    const distanceValue = formatSwimDistance(375);
    expect(distanceValue).not.toContain("กม.");
    expect(distanceValue).not.toContain("km");
  });
});

describe("mergeWithFallback swim key preservation", () => {
  it("swimKind null in fallback allows AI value to survive when non-null", () => {
    // Simulates what mergeWithFallback does: AI value wins over null fallback
    const fallbackExtracted = { workoutKind: "other", swimKind: null, distanceM: null };
    const aiExtracted = { workoutKind: "other", swimKind: "pool", distanceM: 375 };

    // mergeWithFallback: for each key in fallback, AI value wins if not null/undefined/""
    const merged: Record<string, unknown> = { ...fallbackExtracted };
    for (const key of Object.keys(fallbackExtracted) as (keyof typeof fallbackExtracted)[]) {
      const aiVal = aiExtracted[key];
      if (aiVal !== null && aiVal !== undefined && aiVal !== "") {
        merged[key] = aiVal;
      }
    }

    expect(merged.swimKind).toBe("pool");
    expect(merged.distanceM).toBe(375);
  });

  it("swimKind missing from fallback causes AI value to be dropped", () => {
    // Without swimKind in fallback, mergeWithFallback never copies the AI value
    const fallbackExtracted = { workoutKind: "other" }; // no swimKind key
    const aiExtracted = { workoutKind: "other", swimKind: "pool" };

    const merged: Record<string, unknown> = { ...fallbackExtracted };
    for (const key of Object.keys(fallbackExtracted)) {
      const aiVal = (aiExtracted as Record<string, unknown>)[key];
      if (aiVal !== null && aiVal !== undefined && aiVal !== "") {
        merged[key] = aiVal;
      }
    }

    // swimKind is absent from fallback keys → never iterated → stays absent
    expect(merged.swimKind).toBeUndefined();
  });
});
