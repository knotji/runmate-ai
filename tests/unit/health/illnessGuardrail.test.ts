import { describe, it, expect } from "vitest";
import {
  hasHardStopSymptoms,
  isMildAboveNeckOnly,
  getIllnessRiskLevel,
  getIllnessTrainingDecision,
  buildSickLog,
} from "@/lib/health/illnessGuardrail";
import type { SickSymptom } from "@/types/sick";

// ── hasHardStopSymptoms ───────────────────────────────────────────────────────

describe("hasHardStopSymptoms", () => {
  it("returns true for fever alone", () => {
    expect(hasHardStopSymptoms(["fever"])).toBe(true);
  });

  it("returns true for chest_tightness", () => {
    expect(hasHardStopSymptoms(["chest_tightness"])).toBe(true);
  });

  it("returns true for gi_nausea", () => {
    expect(hasHardStopSymptoms(["gi_nausea"])).toBe(true);
  });

  it("returns true for gi_diarrhea", () => {
    expect(hasHardStopSymptoms(["gi_diarrhea"])).toBe(true);
  });

  it("returns true for dizziness", () => {
    expect(hasHardStopSymptoms(["dizziness"])).toBe(true);
  });

  it("returns true for heavy_fatigue", () => {
    expect(hasHardStopSymptoms(["heavy_fatigue"])).toBe(true);
  });

  it("returns true for severe severity regardless of symptoms", () => {
    expect(hasHardStopSymptoms(["sore_throat"], "severe")).toBe(true);
  });

  it("returns true for moderate cough", () => {
    expect(hasHardStopSymptoms(["cough"], "moderate")).toBe(true);
  });

  it("returns false for mild cough", () => {
    expect(hasHardStopSymptoms(["cough"], "mild")).toBe(false);
  });

  it("returns false for above-neck symptoms only, mild", () => {
    expect(hasHardStopSymptoms(["sore_throat", "runny_nose"], "mild")).toBe(false);
  });

  it("returns false for empty symptoms list", () => {
    expect(hasHardStopSymptoms([])).toBe(false);
  });
});

// ── isMildAboveNeckOnly ───────────────────────────────────────────────────────

describe("isMildAboveNeckOnly", () => {
  it("returns true for sore throat and runny nose, mild severity", () => {
    expect(isMildAboveNeckOnly(["sore_throat", "runny_nose"], "mild")).toBe(true);
  });

  it("returns true for headache and nasal congestion with no severity", () => {
    expect(isMildAboveNeckOnly(["headache", "nasal_congestion"])).toBe(true);
  });

  it("returns false when fever is included", () => {
    expect(isMildAboveNeckOnly(["sore_throat", "fever"], "mild")).toBe(false);
  });

  it("returns false when severity is moderate", () => {
    expect(isMildAboveNeckOnly(["sore_throat"], "moderate")).toBe(false);
  });

  it("returns false when below-neck symptom included (body_ache)", () => {
    expect(isMildAboveNeckOnly(["sore_throat", "body_ache"], "mild")).toBe(false);
  });

  it("returns false for empty symptoms", () => {
    expect(isMildAboveNeckOnly([])).toBe(false);
  });
});

// ── getIllnessRiskLevel ───────────────────────────────────────────────────────

describe("getIllnessRiskLevel", () => {
  it("returns 'none' for healthStatus=normal", () => {
    expect(getIllnessRiskLevel({ healthStatus: "normal", symptoms: [] })).toBe("none");
  });

  it("returns 'caution' for healthStatus=fatigue with no symptoms", () => {
    expect(getIllnessRiskLevel({ healthStatus: "fatigue", symptoms: [] })).toBe("caution");
  });

  it("returns 'caution' for healthStatus=sick with no symptoms (conservative)", () => {
    expect(getIllnessRiskLevel({ healthStatus: "sick", symptoms: [] })).toBe("caution");
  });

  it("returns 'hard_stop' for fever", () => {
    expect(getIllnessRiskLevel({ healthStatus: "sick", symptoms: ["fever"] })).toBe("hard_stop");
  });

  it("returns 'hard_stop' for severe severity", () => {
    expect(getIllnessRiskLevel({ healthStatus: "sick", symptoms: ["sore_throat"], severity: "severe" })).toBe("hard_stop");
  });

  it("returns 'mild' for above-neck only, mild severity", () => {
    expect(getIllnessRiskLevel({ healthStatus: "sick", symptoms: ["sore_throat", "runny_nose"], severity: "mild" })).toBe("mild");
  });

  it("returns 'caution' for body_ache without fever (not above-neck only, not hard stop)", () => {
    expect(getIllnessRiskLevel({ healthStatus: "sick", symptoms: ["body_ache"], severity: "mild" })).toBe("caution");
  });
});

// ── getIllnessTrainingDecision ────────────────────────────────────────────────

describe("getIllnessTrainingDecision", () => {
  it("hard_stop → rest_only", () => {
    expect(getIllnessTrainingDecision("hard_stop")).toBe("rest_only");
  });

  it("mild → light_movement_only", () => {
    expect(getIllnessTrainingDecision("mild")).toBe("light_movement_only");
  });

  it("caution → light_movement_only", () => {
    expect(getIllnessTrainingDecision("caution")).toBe("light_movement_only");
  });

  it("none → normal_training_allowed", () => {
    expect(getIllnessTrainingDecision("none")).toBe("normal_training_allowed");
  });
});

// ── buildSickLog ──────────────────────────────────────────────────────────────

describe("buildSickLog", () => {
  const base = { date: "2026-07-10", createdAt: "2026-07-10T10:00:00.000Z" };

  it("derives fever flag from symptoms", () => {
    const log = buildSickLog({ ...base, healthStatus: "sick", symptoms: ["fever"] });
    expect(log.fever).toBe(true);
    expect(log.riskLevel).toBe("hard_stop");
    expect(log.trainingDecision).toBe("rest_only");
    expect(log.source).toBe("manual");
  });

  it("derives aboveNeckOnly flag correctly", () => {
    const log = buildSickLog({ ...base, healthStatus: "sick", symptoms: ["sore_throat", "runny_nose"], severity: "mild" });
    expect(log.aboveNeckOnly).toBe(true);
    expect(log.riskLevel).toBe("mild");
  });

  it("sets riskLevel=none for healthStatus=normal", () => {
    const log = buildSickLog({ ...base, healthStatus: "normal", symptoms: [] });
    expect(log.riskLevel).toBe("none");
    expect(log.trainingDecision).toBe("normal_training_allowed");
  });

  it("derives chestSymptoms from moderate cough", () => {
    const log = buildSickLog({ ...base, healthStatus: "sick", symptoms: ["cough"], severity: "moderate" });
    expect(log.chestSymptoms).toBe(true);
    expect(log.riskLevel).toBe("hard_stop");
  });

  it("derives giSymptoms flag", () => {
    const symptoms: SickSymptom[] = ["gi_nausea"];
    const log = buildSickLog({ ...base, healthStatus: "sick", symptoms });
    expect(log.giSymptoms).toBe(true);
  });
});
