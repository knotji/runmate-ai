import { describe, expect, it } from "vitest";
import { isSwimWorkout, isSwimRecovery, formatSwimDistance } from "@/lib/swimWorkout";

describe("isSwimWorkout", () => {
  it("returns true when workoutKind=other and swimKind=pool", () => {
    expect(isSwimWorkout({ workoutKind: "other", swimKind: "pool" })).toBe(true);
  });

  it("returns true when workoutKind=other and swimKind=open_water", () => {
    expect(isSwimWorkout({ workoutKind: "other", swimKind: "open_water" })).toBe(true);
  });

  it("returns false when workoutKind=other and swimKind=null", () => {
    expect(isSwimWorkout({ workoutKind: "other", swimKind: null })).toBe(false);
  });

  it("returns false when workoutKind=other and swimKind=undefined", () => {
    expect(isSwimWorkout({ workoutKind: "other", swimKind: undefined })).toBe(false);
  });

  it("returns false when workoutKind=outdoor_run even if swimKind is set", () => {
    expect(isSwimWorkout({ workoutKind: "outdoor_run", swimKind: "pool" })).toBe(false);
  });

  it("returns false for strength workouts", () => {
    expect(isSwimWorkout({ workoutKind: "strength", swimKind: undefined })).toBe(false);
  });
});

describe("isSwimRecovery", () => {
  it('detects "recovery" in summary', () => {
    expect(isSwimRecovery("recovery swim 25 min", "")).toBe(true);
  });

  it('detects "Recovery" case-insensitively', () => {
    expect(isSwimRecovery("Recovery Swim", "เบา ๆ")).toBe(true);
  });

  it('detects "ฟื้นตัว" in coachNote', () => {
    expect(isSwimRecovery("ว่ายน้ำ 25 นาที", "ฟื้นตัวดี ไม่เจ็บ")).toBe(true);
  });

  it("returns false for normal swim without recovery language", () => {
    expect(isSwimRecovery("ว่ายน้ำ 1500 ม.", "ความหนักปานกลาง")).toBe(false);
  });

  it("handles undefined arguments gracefully", () => {
    expect(isSwimRecovery(undefined, undefined)).toBe(false);
  });

  it("handles empty strings", () => {
    expect(isSwimRecovery("", "")).toBe(false);
  });
});

describe("formatSwimDistance", () => {
  it("formats 375 metres as '375 ม.'", () => {
    expect(formatSwimDistance(375)).toBe("375 ม.");
  });

  it("formats 1500 metres as '1500 ม.'", () => {
    expect(formatSwimDistance(1500)).toBe("1500 ม.");
  });

  it("rounds fractional metres", () => {
    expect(formatSwimDistance(374.7)).toBe("375 ม.");
    expect(formatSwimDistance(374.3)).toBe("374 ม.");
  });

  it("formats 0 metres as '0 ม.'", () => {
    expect(formatSwimDistance(0)).toBe("0 ม.");
  });
});

describe("Report swim workout display rules", () => {
  it("swim pace label should use /100m not /km", () => {
    const isSwim = isSwimWorkout({ workoutKind: "other", swimKind: "pool" });
    const paceSub = isSwim ? "/100m" : "/km";
    expect(paceSub).toBe("/100m");
  });

  it("non-swim workout pace label uses /km", () => {
    const isSwim = isSwimWorkout({ workoutKind: "outdoor_run", swimKind: undefined });
    const paceSub = isSwim ? "/100m" : "/km";
    expect(paceSub).toBe("/km");
  });

  it("swim title is 'ว่ายน้ำ' for non-recovery swim", () => {
    const isSwim = isSwimWorkout({ workoutKind: "other", swimKind: "pool" });
    const isRecovery = isSwimRecovery("ว่ายน้ำ 1000 ม.", "");
    const title = isSwim ? (isRecovery ? "Recovery Swim" : "ว่ายน้ำ") : "ออกกำลังกาย";
    expect(title).toBe("ว่ายน้ำ");
  });

  it("swim title is 'Recovery Swim' when summary includes recovery", () => {
    const isSwim = isSwimWorkout({ workoutKind: "other", swimKind: "pool" });
    const isRecovery = isSwimRecovery("recovery swim เบา ๆ 25 นาที", "HR ประมาณ 120");
    const title = isSwim ? (isRecovery ? "Recovery Swim" : "ว่ายน้ำ") : "ออกกำลังกาย";
    expect(title).toBe("Recovery Swim");
  });

  it("non-swim other workout still shows 'ออกกำลังกาย'", () => {
    const isSwim = isSwimWorkout({ workoutKind: "other", swimKind: null });
    const title = isSwim ? "ว่ายน้ำ" : "ออกกำลังกาย";
    expect(title).toBe("ออกกำลังกาย");
  });
});
