import { describe, it, expect } from "vitest";
import {
  containsMedicationDoseRequest,
  containsAntibioticRequest,
  getMedicationSafetyGuidance,
  getMedicationRedFlags,
} from "@/lib/coach/medicationSafety";

// ── containsMedicationDoseRequest ─────────────────────────────────────────────

describe("containsMedicationDoseRequest", () => {
  it("detects paracetamol dosing request in Thai", () => {
    expect(containsMedicationDoseRequest("กิน paracetamol กี่มิลลิกรัม")).toBe(true);
  });

  it("detects mg dose request", () => {
    expect(containsMedicationDoseRequest("mg เท่าไร")).toBe(true);
  });

  it("detects tablet count request", () => {
    expect(containsMedicationDoseRequest("กินกี่เม็ด")).toBe(true);
  });

  it("detects how-often request", () => {
    expect(containsMedicationDoseRequest("กินทุกกี่ชั่วโมง")).toBe(true);
  });

  it("returns false for non-dosing question", () => {
    expect(containsMedicationDoseRequest("วันนี้ควรพักไหม")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsMedicationDoseRequest("")).toBe(false);
  });
});

// ── containsAntibioticRequest ─────────────────────────────────────────────────

describe("containsAntibioticRequest", () => {
  it("detects antibiotic keyword in Thai", () => {
    expect(containsAntibioticRequest("ควรกินยาปฏิชีวนะไหม")).toBe(true);
  });

  it("detects amoxicillin by name", () => {
    expect(containsAntibioticRequest("ต้องกิน amoxicillin ไหม")).toBe(true);
  });

  it("detects antibiotic English keyword", () => {
    expect(containsAntibioticRequest("should I take antibiotic")).toBe(true);
  });

  it("returns false for non-antibiotic question", () => {
    expect(containsAntibioticRequest("ควรกินยาลดไข้ไหม")).toBe(false);
  });
});

// ── getMedicationSafetyGuidance ───────────────────────────────────────────────

describe("getMedicationSafetyGuidance", () => {
  it("returns guidance text for fever", () => {
    const text = getMedicationSafetyGuidance(["fever"]);
    expect(text).toBeTruthy();
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(10);
  });

  it("returns guidance text for sore_throat", () => {
    const text = getMedicationSafetyGuidance(["sore_throat"]);
    expect(text).toBeTruthy();
  });

  it("returns a non-empty string for empty symptoms", () => {
    const text = getMedicationSafetyGuidance([]);
    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(0);
  });

  it("does not include exact dosage numbers", () => {
    const text = getMedicationSafetyGuidance(["fever", "body_ache"]);
    // Should not say "500mg" or "2 เม็ด" as a prescription
    expect(text).not.toMatch(/\d+\s*mg/i);
    expect(text).not.toMatch(/\d+\s*เม็ด/);
  });
});

// ── getMedicationRedFlags ─────────────────────────────────────────────────────

describe("getMedicationRedFlags", () => {
  it("returns red flag for fever", () => {
    const flags = getMedicationRedFlags(["fever"]);
    expect(Array.isArray(flags)).toBe(true);
    expect(flags.length).toBeGreaterThan(0);
  });

  it("returns red flag for chest_tightness", () => {
    const flags = getMedicationRedFlags(["chest_tightness"]);
    expect(flags.length).toBeGreaterThan(0);
  });

  it("returns empty or minimal flags for runny_nose only", () => {
    const flags = getMedicationRedFlags(["runny_nose"]);
    expect(Array.isArray(flags)).toBe(true);
  });
});
