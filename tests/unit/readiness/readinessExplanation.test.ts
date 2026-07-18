import { describe, expect, it } from "vitest";
import { buildReadinessExplanation } from "@/lib/readiness/readinessExplanation";
import type { TodaySignal, ReadinessReason } from "@/lib/readiness/readinessTypes";

function makeSig(key: TodaySignal["key"], tone: TodaySignal["tone"]): TodaySignal {
  return { key, tone, label: key, value: "-", icon: "" };
}

function makeReason(key: ReadinessReason["key"]): ReadinessReason {
  return { key, label: key };
}

type Input = Parameters<typeof buildReadinessExplanation>[0];

function makeInput(overrides: Partial<Input>): Input {
  return {
    band: "green",
    loadTarget: "moderate",
    reasons: [],
    signals: [
      makeSig("recovery", "good"),
      makeSig("load", "good"),
      makeSig("energy", "neutral"),
      makeSig("sleep", "good"),
    ],
    hasSleepData: true,
    hasPainWarning: false,
    ...overrides,
  };
}

describe("buildReadinessExplanation", () => {
  it("green + moderate + no issues → null (no explanation needed)", () => {
    expect(buildReadinessExplanation(makeInput({}))).toBeNull();
  });

  it("pain_risk band → null (coaching-interpretation-line handles it)", () => {
    expect(buildReadinessExplanation(makeInput({ band: "pain_risk" }))).toBeNull();
  });

  it("green + easy + high load → explains load is the constraint, not recovery", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "green",
      loadTarget: "easy",
      signals: [
        makeSig("recovery", "good"),
        makeSig("load", "bad"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "good"),
      ],
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("โหลด");
    expect(result).toContain("Readiness");
  });

  it("green + walk + high load → explains load constraint", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "green",
      loadTarget: "walk",
      signals: [
        makeSig("recovery", "good"),
        makeSig("load", "bad"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "good"),
      ],
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("โหลด");
  });

  it("green + easy + low load → null (no surprising constraint)", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "green",
      loadTarget: "easy",
      signals: [
        makeSig("recovery", "good"),
        makeSig("load", "good"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "good"),
      ],
    }));
    expect(result).toBeNull();
  });

  it("pain warning + pain_recent reason + easy → pain recovery explanation", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "yellow",
      loadTarget: "easy",
      reasons: [makeReason("pain_recent")],
      hasPainWarning: true,
      signals: [
        makeSig("recovery", "neutral"),
        makeSig("load", "good"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "warn"),
      ],
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("เจ็บ");
    expect(result).toContain("easy");
  });

  it("pain warning + pain_recent reason + non-easy target → generic pain recovery explanation", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "yellow",
      loadTarget: "moderate",
      reasons: [makeReason("pain_recent")],
      hasPainWarning: true,
      signals: [
        makeSig("recovery", "neutral"),
        makeSig("load", "good"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "warn"),
      ],
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("เจ็บ");
  });

  it("red band + poor recovery → recovery explanation", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "red",
      loadTarget: "walk",
      signals: [
        makeSig("recovery", "bad"),
        makeSig("load", "good"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "good"),
      ],
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("ฟื้นตัว");
  });

  it("red band without poor recovery signal → generic rest explanation", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "red",
      loadTarget: "walk",
      signals: [
        makeSig("recovery", "neutral"),
        makeSig("load", "neutral"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "good"),
      ],
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("พัก");
  });

  it("yellow band + high load → load explanation", () => {
    const result = buildReadinessExplanation(makeInput({
      band: "yellow",
      loadTarget: "easy",
      signals: [
        makeSig("recovery", "neutral"),
        makeSig("load", "bad"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "good"),
      ],
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("โหลด");
  });

  it("yellow band + low load → null", () => {
    expect(buildReadinessExplanation(makeInput({
      band: "yellow",
      loadTarget: "moderate",
      signals: [
        makeSig("recovery", "neutral"),
        makeSig("load", "good"),
        makeSig("energy", "neutral"),
        makeSig("sleep", "good"),
      ],
    }))).toBeNull();
  });
});
