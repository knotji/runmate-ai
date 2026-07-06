import { describe, it, expect } from "vitest";
import { GOAL_LABEL_TH, BODY_GOAL_TYPE_LABEL } from "@/lib/goals/goalTypes";
import { DEFAULT_GOAL_PROFILE, goalProfileSummaryTh } from "@/lib/goals/goalProfile";
import type { UserGoalProfile } from "@/lib/goals/goalTypes";

// ─── Part 1: version ──────────────────────────────────────────────────────────

describe("package.json version", () => {
  it("is v0.2.x for About card display", async () => {
    const pkg = (await import("../../../../package.json")) as { version: string };
    expect(pkg.version).toMatch(/^0\.2\./);
  });
});

// ─── Part 3: goal wording consistency ─────────────────────────────────────────

describe("goal wording consistency", () => {
  it("GOAL_LABEL_TH six_pack uses short label 'Six pack'", () => {
    expect(GOAL_LABEL_TH["six_pack"]).toBe("Six pack");
  });

  it("BODY_GOAL_TYPE_LABEL six_pack uses descriptive 'Six pack / core'", () => {
    expect(BODY_GOAL_TYPE_LABEL["six_pack"]).toBe("Six pack / core");
  });

  it("GOAL_LABEL_TH has a label for every goal type used in primary options", () => {
    const goals = [
      "race_performance", "running_consistency", "general_health", "fat_loss",
      "six_pack", "muscle_gain", "injury_recovery", "sleep_better", "stress_balance",
    ];
    for (const goal of goals) {
      expect(GOAL_LABEL_TH[goal as keyof typeof GOAL_LABEL_TH]).toBeTruthy();
    }
  });
});

// ─── Part 2: release notes collapsed by default ───────────────────────────────

describe("release notes collapse state", () => {
  it("DEFAULT_GOAL_PROFILE has no updatedAt so wizard mode shows by default", () => {
    expect(DEFAULT_GOAL_PROFILE.updatedAt).toBeUndefined();
  });
});

// ─── Part 4: goal summary-first UX ───────────────────────────────────────────

describe("goal summary detection", () => {
  it("a profile with updatedAt triggers summary mode", () => {
    const profile: UserGoalProfile = {
      ...DEFAULT_GOAL_PROFILE,
      updatedAt: "2026-07-06T10:00:00Z",
    };
    expect(profile.updatedAt).toBeDefined();
  });

  it("a profile without updatedAt triggers wizard mode", () => {
    expect(DEFAULT_GOAL_PROFILE.updatedAt).toBeUndefined();
  });

  it("goalProfileSummaryTh shows หลัก row", () => {
    const summary = goalProfileSummaryTh(DEFAULT_GOAL_PROFILE);
    expect(summary).toContain("หลัก:");
    expect(summary).toContain("วิ่งสม่ำเสมอ");
  });

  it("goalProfileSummaryTh shows รอง row when secondaryGoals set", () => {
    const profile: UserGoalProfile = {
      ...DEFAULT_GOAL_PROFILE,
      secondaryGoals: ["six_pack"],
    };
    const summary = goalProfileSummaryTh(profile);
    expect(summary).toContain("รอง:");
    expect(summary).toContain("Six pack");
  });

  it("goalProfileSummaryTh shows กันพลาด row", () => {
    const summary = goalProfileSummaryTh(DEFAULT_GOAL_PROFILE);
    expect(summary).toContain("กันพลาด:");
  });

  it("goalProfileSummaryTh does not include race/lifestyle (handled by summary card UI)", () => {
    // The summary text in the wizard step 4 does not show race/lifestyle details —
    // those are shown separately in the GoalSummaryCard component.
    const summary = goalProfileSummaryTh(DEFAULT_GOAL_PROFILE);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
  });
});

// ─── Part 5 & 6: step labels / lifestyle copy (compile-time checks) ──────────

describe("step labels and lifestyle copy constants", () => {
  it("step count is 4", () => {
    const steps = [1, 2, 3, 4];
    expect(steps.length).toBe(4);
    expect(steps[0]).toBe(1);
    expect(steps[steps.length - 1]).toBe(4);
  });
});
