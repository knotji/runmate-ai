import type { LoadTarget, ReadinessBand } from "@/lib/readiness/readinessTypes";
import { BODY_GOALS, RACE_GOALS } from "./goalTypes";
import type { GoalType, UserGoalProfile } from "./goalTypes";

export type RecommendedStimulus = "run" | "strength" | "walk" | "rest" | "yoga" | "cross_train";
export type IntensityHint = "easy" | "moderate" | "hard" | "rest";
export type BlockReason = "pain" | "recovery" | "guardrail" | null;

export type GoalAwareRecommendation = {
  recommendedStimulus: RecommendedStimulus;
  intensityHint: IntensityHint;
  secondaryNotes: string[];
  guardrailNotes: string[];
  summaryTh: string;
  blockedBy: BlockReason;
};

type RecInput = {
  goalProfile: UserGoalProfile;
  band: ReadinessBand;
  loadTarget: LoadTarget;
  hasPain: boolean;
};

const PRIMARY_STIMULUS: Record<GoalType, RecommendedStimulus> = {
  race_performance: "run",
  running_consistency: "run",
  general_health: "walk",
  fat_loss: "run",
  six_pack: "strength",
  muscle_gain: "strength",
  injury_prevention: "walk",
  injury_recovery: "walk",
  sleep_better: "yoga",
  stress_balance: "yoga",
};

const PRIMARY_INTENSITY: Record<GoalType, IntensityHint> = {
  race_performance: "hard",
  running_consistency: "moderate",
  general_health: "easy",
  fat_loss: "moderate",
  six_pack: "moderate",
  muscle_gain: "moderate",
  injury_prevention: "easy",
  injury_recovery: "easy",
  sleep_better: "easy",
  stress_balance: "easy",
};

const SECONDARY_NOTES: Partial<Record<GoalType, string>> = {
  race_performance: "ทำตาม race plan — อย่าเพิ่ม km เอง",
  running_consistency: "ซ้อมสม่ำเสมอ อย่าข้ามวัน — ดีกว่าซ้อมหนักแล้วพัก",
  general_health: "รวม strength เบา ๆ 1–2 ครั้ง/สัปดาห์ เพื่อสุขภาพโดยรวม",
  fat_loss: "ถ้า readiness ดี ลอง เพิ่ม strength หรือ HIIT สั้น ๆ หลังวิ่ง เพื่อเพิ่มการเผาผลาญ",
  six_pack: "วันที่ไม่วิ่งหนัก เพิ่ม core เบา ๆ เช่น plank / dead bug 10–15 นาที",
  muscle_gain: "เพิ่มวัน strength 2–3 ครั้ง/สัปดาห์ ห่างจากวัน long run",
  injury_prevention: "วอร์มอัพ 10 นาที stretch หลังซ้อม — ห้ามข้าม",
  injury_recovery: "ฟังร่างกาย หยุดทันทีถ้ารู้สึกปวด",
  sleep_better: "หลีกเลี่ยงซ้อมหนักหลัง 20:00 น. เพื่อให้หลับได้เร็วขึ้น",
  stress_balance: "วันไหนเครียดให้เปลี่ยนเป็น easy run หรือเดิน ไม่ฝืนทำตามแผนหนัก",
};

const GUARDRAIL_BLOCK_INTENSITY: Partial<Record<GoalType, IntensityHint>> = {
  injury_prevention: "easy",
  injury_recovery: "easy",
  stress_balance: "easy",
};

function applyLoadTargetToIntensity(base: IntensityHint, loadTarget: LoadTarget): IntensityHint {
  if (loadTarget === "rest") return "rest";
  if (loadTarget === "walk" || loadTarget === "easy") {
    if (base === "hard" || base === "moderate") return "easy";
  }
  return base;
}

function applyLoadTargetToStimulus(
  base: RecommendedStimulus,
  loadTarget: LoadTarget,
): RecommendedStimulus {
  if (loadTarget === "rest") return "rest";
  if (loadTarget === "walk" || loadTarget === "easy") {
    if (base === "run") return "walk";
    if (base === "strength") return "yoga";
  }
  return base;
}

export function buildGoalAwareRecommendation(input: RecInput): GoalAwareRecommendation {
  const { goalProfile, band, loadTarget, hasPain } = input;

  // Pain always wins
  if (hasPain || band === "pain_risk") {
    return {
      recommendedStimulus: "rest",
      intensityHint: "rest",
      secondaryNotes: [],
      guardrailNotes: ["มีอาการเจ็บ — หยุดพักก่อน ร่างกายสำคัญกว่าแผน"],
      summaryTh: "พักสนิท — อาการเจ็บต้องได้รับการดูแลก่อนซ้อม",
      blockedBy: "pain",
    };
  }

  // Red band → rest/walk regardless of goals
  if (band === "red") {
    return {
      recommendedStimulus: "walk",
      intensityHint: "easy",
      secondaryNotes: [],
      guardrailNotes: ["Recovery ต่ำมาก — วันนี้ให้ฟื้นตัว ไม่ซ้อมหนัก"],
      summaryTh: "Recovery ต่ำมาก: เดิน เบา ๆ หรือพัก — ไม่มีซ้อมหนักวันนี้",
      blockedBy: "recovery",
    };
  }

  let stimulus = PRIMARY_STIMULUS[goalProfile.primaryGoal];
  let intensity = PRIMARY_INTENSITY[goalProfile.primaryGoal];

  // Apply load target constraints
  stimulus = applyLoadTargetToStimulus(stimulus, loadTarget);
  intensity = applyLoadTargetToIntensity(intensity, loadTarget);

  // Apply guardrail caps
  const guardrailNotes: string[] = [];
  let blockedBy: BlockReason = null;

  for (const guardrail of goalProfile.guardrailGoals) {
    const maxIntensity = GUARDRAIL_BLOCK_INTENSITY[guardrail];
    if (maxIntensity && intensity === "hard") {
      intensity = maxIntensity;
      blockedBy = "guardrail";
      if (guardrail === "injury_prevention") {
        guardrailNotes.push("ระวังบาดเจ็บ: ลดความหนักลง เน้น easy หรือ moderate");
      } else if (guardrail === "injury_recovery") {
        guardrailNotes.push("กำลังฟื้นจากบาดเจ็บ: ห้ามซ้อมหนักจนกว่าจะหาย");
      } else if (guardrail === "stress_balance") {
        guardrailNotes.push("stress สูง: วันนี้ easy run หรือ yoga ดีกว่า hard session");
      }
    }
  }

  // Collect secondary goal notes (one-main-stimulus: only note, don't add a second workout)
  const secondaryNotes: string[] = [];
  for (const secondary of goalProfile.secondaryGoals) {
    const note = SECONDARY_NOTES[secondary];
    if (note) secondaryNotes.push(note);
  }

  // Build Thai summary
  const stimulusLabelTh: Record<RecommendedStimulus, string> = {
    run: "วิ่ง",
    strength: "Strength",
    walk: "เดิน / เคลื่อนไหวเบา ๆ",
    rest: "พัก",
    yoga: "Yoga / ยืดเหยียด",
    cross_train: "Cross training",
  };
  const intensityLabelTh: Record<IntensityHint, string> = {
    easy: "easy",
    moderate: "moderate",
    hard: "hard",
    rest: "พักสนิท",
  };

  const summaryTh = intensity === "rest"
    ? "พักสนิทวันนี้"
    : `${stimulusLabelTh[stimulus]} ระดับ ${intensityLabelTh[intensity]}`;

  return { recommendedStimulus: stimulus, intensityHint: intensity, secondaryNotes, guardrailNotes, summaryTh, blockedBy };
}

// Helper: derive whether secondary goals include a body-focus component
export function hasBodySecondary(goalProfile: UserGoalProfile): boolean {
  return goalProfile.secondaryGoals.some((g) => BODY_GOALS.includes(g));
}

// Helper: derive whether this is a race-focused profile
export function isRaceFocused(goalProfile: UserGoalProfile): boolean {
  return RACE_GOALS.includes(goalProfile.primaryGoal) || goalProfile.raceGoal?.enabled === true;
}
