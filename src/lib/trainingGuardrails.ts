// Shared training guardrail helper.
// Single source of truth for Today, Coach, Race, and Coach-insight route.
// Does NOT change any scoring logic — pure display/coaching layer.

import type { RunMateRecoverySystem } from "./recoverySystem";

export type TrainingGuardrailTone = "neutral" | "success" | "caution" | "warning" | "danger";
export type TrainingIntensity = "rest" | "walk" | "mobility" | "recovery" | "easy" | "normal" | "quality";

export type TrainingGuardrail = {
  tone: TrainingGuardrailTone;
  canRun: boolean;
  avoidRun: boolean;
  canDoHardWorkout: boolean;
  recommendedIntensity: TrainingIntensity;
  allowedActivities: string[];
  blockedActivities: string[];
  reason: string;
  shortThaiCopy: string;
  detailThaiCopy: string;
  shortEnglishCopy: string;
  adjustedWorkoutLabel?: string;
  shouldAdjustPlannedWorkout: boolean;
};

const HARD_BLOCKED = [
  "Tempo",
  "Intervals",
  "Race pace",
  "Progression run",
  "Speed work",
  "Fartlek",
  "วิ่งยาวหนัก",
  "เวทหนัก",
];

const RECOVERY_ALLOWED = [
  "พัก",
  "เดินเบา ๆ",
  "Mobility / Yoga",
  "Easy jog 15–25 นาที",
  "Recovery Run",
  "เวทเบา",
];

const PAIN_BLOCKED = [
  "วิ่ง",
  "Easy run",
  "Long run",
  ...HARD_BLOCKED,
];

const PAIN_ALLOWED = [
  "พัก",
  "เช็กอาการ",
  "นวด / ประคบ",
  "Mobility เบา (ถ้าไม่เจ็บ)",
  "เดิน (ถ้าไม่รู้สึกเจ็บ)",
];

export function getTodayTrainingGuardrail(
  recSys: RunMateRecoverySystem | null,
  hasActivePain: boolean,
): TrainingGuardrail {
  // No data → neutral fallback
  if (!recSys) {
    return {
      tone: "neutral",
      canRun: true,
      avoidRun: false,
      canDoHardWorkout: true,
      recommendedIntensity: "normal",
      allowedActivities: [],
      blockedActivities: [],
      reason: "ยังไม่มีข้อมูลเพียงพอ",
      shortThaiCopy: "ซ้อมตามความรู้สึกเป็นหลัก",
      detailThaiCopy: "ยังไม่มีข้อมูล recovery, sleep หรือ load สะสม ฟังร่างกายเป็นหลัก",
      shortEnglishCopy: "Train by feel",
      shouldAdjustPlannedWorkout: false,
    };
  }

  const recoveryScore = recSys.axes.recovery.score;
  const sleepScore = recSys.axes.sleep.score;
  const loadScore = recSys.axes.load.score;

  // ── 1. Active pain ─────────────────────────────────────────────────────────
  if (hasActivePain) {
    return {
      tone: "danger",
      canRun: false,
      avoidRun: true,
      canDoHardWorkout: false,
      recommendedIntensity: "rest",
      allowedActivities: PAIN_ALLOWED,
      blockedActivities: PAIN_BLOCKED,
      reason: "มีอาการเจ็บ",
      shortThaiCopy: "มีอาการเจ็บวันนี้ — ควรเลี่ยงการวิ่งและเช็กอาการก่อน",
      detailThaiCopy:
        "ร่างกายส่งสัญญาณเจ็บ การวิ่งหรือออกกำลังหนักอาจทำให้อาการแย่ลง เลือกพัก นวด หรือ mobility เบา ๆ แทน",
      shortEnglishCopy: "Rest & symptom check",
      adjustedWorkoutLabel: "งดวิ่ง / Recovery Day",
      shouldAdjustPlannedWorkout: true,
    };
  }

  // ── 2. Critical combined risk ──────────────────────────────────────────────
  // Danger only when all three axes are in bad shape simultaneously.
  const isCriticalCombined = recoveryScore < 30 && sleepScore < 25 && loadScore > 75;
  if (isCriticalCombined) {
    return {
      tone: "danger",
      canRun: false,
      avoidRun: true,
      canDoHardWorkout: false,
      recommendedIntensity: "rest",
      allowedActivities: ["พัก", "นอนพักฟื้น", "เดินเบา ๆ (ถ้าไหว)"],
      blockedActivities: HARD_BLOCKED,
      reason: "ฟื้นตัวต่ำ + นอนน้อยมาก + load สูงสะสม",
      shortThaiCopy: "ฟื้นตัว นอน และ load สะสมรวมกันต่ำมาก — วันนี้เหมาะกับพักเต็มวันหรือเดินเบา ๆ",
      detailThaiCopy:
        "Recovery, Sleep และ Load รวมกันอยู่ในระดับวิกฤต ร่างกายต้องการพักฟื้นเต็มวัน ไม่ใช่วันออกกำลังกาย",
      shortEnglishCopy: "Full rest — critical fatigue",
      adjustedWorkoutLabel: "พักเต็มวัน",
      shouldAdjustPlannedWorkout: true,
    };
  }

  // ── 3. Low recovery AND low sleep ─────────────────────────────────────────
  const isLowRecovery = recoveryScore < 45;
  const isLowSleep = sleepScore < 40;
  const isVeryLowSleep = sleepScore < 25;

  if (isLowRecovery && isLowSleep) {
    return {
      tone: "warning",
      canRun: true,
      avoidRun: false,
      canDoHardWorkout: false,
      recommendedIntensity: "recovery",
      allowedActivities: RECOVERY_ALLOWED,
      blockedActivities: HARD_BLOCKED,
      reason: "ฟื้นตัวต่ำและนอนน้อย",
      shortThaiCopy: "วันนี้เหมาะกับวันเบา — นอนน้อยและฟื้นตัวยังไม่เต็ม",
      detailThaiCopy:
        "ฟื้นตัวต่ำและนอนน้อยพร้อมกัน — ไม่ใช่วันกด pace เลือกได้: พัก, เดินเบา ๆ 20–40 นาที, mobility หรือ easy สั้น ๆ ถ้าจะวิ่งให้เป็น easy 15–25 นาที คุยได้ ไม่ดู pace",
      shortEnglishCopy: "Light recovery day",
      adjustedWorkoutLabel: "Recovery / Easy 15–25 นาที",
      shouldAdjustPlannedWorkout: true,
    };
  }

  // ── 4. Very low sleep alone ────────────────────────────────────────────────
  if (isVeryLowSleep) {
    return {
      tone: "warning",
      canRun: true,
      avoidRun: false,
      canDoHardWorkout: false,
      recommendedIntensity: "easy",
      allowedActivities: RECOVERY_ALLOWED,
      blockedActivities: HARD_BLOCKED,
      reason: "นอนน้อยมาก",
      shortThaiCopy: "นอนน้อยมาก — ลดความหนักและฟังร่างกายเป็นหลัก",
      detailThaiCopy:
        "Sleep score ต่ำมาก ร่างกายฟื้นตัวไม่เต็มที่ ถ้าจะวิ่งให้เป็น easy เท่านั้น ถ้า HR ลอยให้หยุด",
      shortEnglishCopy: "Easy only — very low sleep",
      adjustedWorkoutLabel: "Easy Run / Recovery",
      shouldAdjustPlannedWorkout: true,
    };
  }

  // ── 5. Low sleep alone ────────────────────────────────────────────────────
  if (isLowSleep) {
    return {
      tone: "caution",
      canRun: true,
      avoidRun: false,
      canDoHardWorkout: false,
      recommendedIntensity: "easy",
      allowedActivities: RECOVERY_ALLOWED,
      blockedActivities: HARD_BLOCKED,
      reason: "นอนน้อย",
      shortThaiCopy: "นอนน้อย — ให้ลดความหนักและฟังร่างกายเป็นหลัก",
      detailThaiCopy:
        "นอนน้อยกว่าเกณฑ์ ถ้าจะวิ่งให้เป็น easy ฟังร่างกาย ถ้า HR ลอยให้หยุดหรือลดลงเป็นเดิน",
      shortEnglishCopy: "Keep it easy — sleep was short",
      adjustedWorkoutLabel: "Easy Run",
      shouldAdjustPlannedWorkout: true,
    };
  }

  // ── 6. Low recovery alone ─────────────────────────────────────────────────
  if (isLowRecovery) {
    return {
      tone: "caution",
      canRun: true,
      avoidRun: false,
      canDoHardWorkout: false,
      recommendedIntensity: "easy",
      allowedActivities: RECOVERY_ALLOWED,
      blockedActivities: HARD_BLOCKED,
      reason: "ฟื้นตัวต่ำ",
      shortThaiCopy: "ฟื้นตัวต่ำ — วันนี้เน้น easy หรือ mobility แทนวิ่งหนัก",
      detailThaiCopy:
        "Recovery score ต่ำกว่าเกณฑ์ เลือก easy jog เดินเบา ๆ หรือ mobility แทนซ้อมหนัก เก็บพลังไว้ซ้อมวันถัดไปดีกว่า",
      shortEnglishCopy: "Easy run or mobility",
      adjustedWorkoutLabel: "Easy Run / Mobility",
      shouldAdjustPlannedWorkout: true,
    };
  }

  // ── 7. coachingState = "easy" (high load or moderate sleep) ──────────────
  if (recSys.coachingState === "easy") {
    const reason = loadScore >= 75 ? "โหลดซ้อมสูง" : "ฟื้นตัวปานกลาง";
    return {
      tone: "caution",
      canRun: true,
      avoidRun: false,
      canDoHardWorkout: false,
      recommendedIntensity: "easy",
      allowedActivities: [...RECOVERY_ALLOWED, "วิ่งตามแผน (easy pace)"],
      blockedActivities: HARD_BLOCKED,
      reason,
      shortThaiCopy: "วันนี้ให้คุมเบาไว้ก่อน — ไม่กด pace",
      detailThaiCopy:
        "วันนี้ควรคุมระดับความเหนื่อย ไม่เร่ง pace เน้น easy zone ฟังร่างกายเป็นหลัก",
      shortEnglishCopy: "Easy pace only",
      shouldAdjustPlannedWorkout: false,
    };
  }

  // ── 8. coachingState = "recover" (non-pain path, already handled above) ──
  if (recSys.coachingState === "recover") {
    return {
      tone: "warning",
      canRun: false,
      avoidRun: true,
      canDoHardWorkout: false,
      recommendedIntensity: "recovery",
      allowedActivities: RECOVERY_ALLOWED,
      blockedActivities: HARD_BLOCKED,
      reason: "ฟื้นตัวต่ำสะสม",
      shortThaiCopy: "วันนี้เน้น recovery ก่อน — เบามากหรือพักเลย",
      detailThaiCopy:
        "ร่างกายต้องการพักฟื้น ถ้าอยากขยับตัวให้เลือกเดินเบา ๆ หรือ mobility เท่านั้น",
      shortEnglishCopy: "Recovery day",
      adjustedWorkoutLabel: "Recovery / Walk / Mobility",
      shouldAdjustPlannedWorkout: true,
    };
  }

  // ── 9. coachingState = "maintain" ─────────────────────────────────────────
  if (recSys.coachingState === "maintain") {
    return {
      tone: "neutral",
      canRun: true,
      avoidRun: false,
      canDoHardWorkout: true,
      recommendedIntensity: "normal",
      allowedActivities: [],
      blockedActivities: [],
      reason: "สมดุลดี",
      shortThaiCopy: "วันนี้ร่างกายสมดุล — ซ้อมตามแผนได้",
      detailThaiCopy:
        "Recovery, Sleep และ Load อยู่ในเกณฑ์ปกติ ซ้อมตามแผนได้อย่างสมดุล",
      shortEnglishCopy: "Follow the plan",
      shouldAdjustPlannedWorkout: false,
    };
  }

  // ── 10. coachingState = "push" ────────────────────────────────────────────
  return {
    tone: "success",
    canRun: true,
    avoidRun: false,
    canDoHardWorkout: true,
    recommendedIntensity: "quality",
    allowedActivities: [],
    blockedActivities: [],
    reason: "พร้อมเต็มที่",
    shortThaiCopy: "วันนี้ร่างกายพร้อม — ทำได้เต็มแผน",
    detailThaiCopy:
      "Recovery, Sleep และ Load อยู่ในเกณฑ์ดีมาก สามารถซ้อมตามแผนหลักได้",
    shortEnglishCopy: "Ready to push",
    shouldAdjustPlannedWorkout: false,
  };
}

// ── Suggested question chips by guardrail state ────────────────────────────────

export type SuggestedChip = { label: string; emoji?: string };

export function getGuardrailSuggestedChips(guardrail: TrainingGuardrail): SuggestedChip[] {
  if (guardrail.avoidRun && guardrail.tone === "danger" && guardrail.reason.includes("เจ็บ")) {
    return [
      { label: "วันนี้ควรหยุดวิ่งไหม" },
      { label: "เจ็บแบบนี้ควรทำอะไร" },
      { label: "ทำ mobility ได้ไหม" },
      { label: "ควรกลับมาวิ่งเมื่อไร" },
    ];
  }
  if (!guardrail.canDoHardWorkout && guardrail.tone === "warning") {
    return [
      { label: "วันนี้ควรพักไหม" },
      { label: "ถ้าจะวิ่งเบาแค่ไหน" },
      { label: "นอนน้อยควรซ้อมยังไง" },
      { label: "กินอะไรช่วยฟื้นตัว" },
    ];
  }
  if (!guardrail.canDoHardWorkout && guardrail.tone === "caution") {
    return [
      { label: "วันนี้วิ่ง easy ได้ไหม" },
      { label: "easy pace ควรอยู่ที่เท่าไร" },
      { label: "mobility อะไรดีสำหรับวันนี้" },
      { label: "นอนน้อยกระทบ recovery ยังไง" },
    ];
  }
  if (guardrail.canDoHardWorkout && guardrail.tone === "success") {
    return [
      { label: "วันนี้กด pace ได้ไหม" },
      { label: "ทำ tempo ได้ไหม" },
      { label: "ซ้อมยังไงให้เข้าเป้า" },
      { label: "ควรกินอะไรก่อนซ้อม" },
    ];
  }
  // neutral / maintain
  return [
    { label: "วันนี้ซ้อมได้ไหม" },
    { label: "easy vs tempo วันนี้" },
    { label: "ควรกินอะไรก่อนวิ่ง" },
    { label: "ฟื้นตัวเร็วขึ้นได้ยังไง" },
  ];
}

// ── Weekly coaching trend insight ─────────────────────────────────────────────

export type WeeklyCoachInsightInput = {
  avgRecoveryScore: number | null;
  avgSleepScore: number | null;
  avgSleepHours: number | null;
  avgLoadScore: number | null;
  loadLevel: "ต่ำ" | "ปานกลาง" | "สูง" | "สูงมาก";
  sleepDebtLevel: "ไม่มี" | "ปานกลาง" | "สูง";
  activePainDays: number;
  runningKmTotal: number;
  runCount: number;
  sleepNights: number;
};

export function buildWeeklyCoachTrendInsight(input: WeeklyCoachInsightInput): string | null {
  const {
    avgRecoveryScore,
    avgSleepHours,
    avgLoadScore,
    loadLevel,
    sleepDebtLevel,
    activePainDays,
    runningKmTotal,
    runCount,
    sleepNights,
  } = input;

  // Not enough data
  if (sleepNights === 0 && runCount === 0) {
    return "ข้อมูลยังน้อย ลองบันทึกการนอน อาหาร และซ้อมเพิ่มอีก 2–3 วัน เพื่อให้ insight แม่นขึ้น";
  }

  // Active pain → top priority
  if (activePainDays > 0) {
    return `มีอาการเจ็บ ${activePainDays} วันในสัปดาห์นี้ — ควรให้เวลาฟื้นตัวก่อนเพิ่มโหลด`;
  }

  // High load + low recovery
  if ((loadLevel === "สูง" || loadLevel === "สูงมาก") && avgRecoveryScore != null && avgRecoveryScore < 55) {
    return "สัปดาห์นี้ load ค่อนข้างสูง และ recovery เริ่มตก ควรมี easy/recovery อย่างน้อย 2 วัน เพื่อป้องกันการสะสมความล้า";
  }

  // High load + low sleep
  if ((loadLevel === "สูง" || loadLevel === "สูงมาก") && sleepDebtLevel === "สูง") {
    return "โหลดสะสมสูงแต่นอนน้อย ความเสี่ยงบาดเจ็บแอบสะสมได้ ควรเพิ่มวัน recovery และพยายามนอนให้เกิน 6.5 ชม.";
  }

  // Load high alone
  if (loadLevel === "สูงมาก") {
    return "สัปดาห์นี้ load สูงมาก ถ้าวิ่งต่อเนื่องให้ระวังอาการล้าสะสม Easy run วันถัดไปสำคัญมาก";
  }

  // Low sleep
  if (sleepDebtLevel === "สูง" || (avgSleepHours != null && avgSleepHours < 5.5)) {
    return `นอนเฉลี่ยยังต่ำ${avgSleepHours != null ? ` (${avgSleepHours.toFixed(1)} ชม.)` : ""} — อาจทำให้ pace แกว่งและฟื้นตัวช้าลง ลองดันการนอนให้เกิน 6.5 ชม. ก่อนเพิ่มความหนัก`;
  }

  if (sleepDebtLevel === "ปานกลาง" && avgRecoveryScore != null && avgRecoveryScore < 60) {
    return `sleep เฉลี่ยยังต่ำกว่าเกณฑ์เล็กน้อย — ถ้าจะเพิ่ม pace ควรดันการนอนให้เกิน 6.5 ชม. ก่อน`;
  }

  // Low recovery (even with decent sleep)
  if (avgRecoveryScore != null && avgRecoveryScore < 50) {
    return "ฟื้นตัวเฉลี่ยยังต่ำ ตรวจสอบว่า easy run เบาพอจริง ๆ ไหม หรือมีปัจจัยอื่นที่กดฟื้นตัว เช่น sleep หรือ stress";
  }

  // Good load + consistent training
  if (runCount >= 3 && (loadLevel === "ปานกลาง" || loadLevel === "ต่ำ") && (avgRecoveryScore == null || avgRecoveryScore >= 60)) {
    return "ซ้อมต่อเนื่องดีแล้ว รอบถัดไปให้คุมวันเบาให้เบาจริง เพื่อให้ร่างกายปรับตัวและพัฒนาได้";
  }

  // Decent sleep + low run volume
  if (runningKmTotal === 0 && runCount === 0 && avgLoadScore != null && avgLoadScore < 20) {
    return "สัปดาห์นี้ load น้อยมาก ถ้าร่างกายพร้อมและไม่มีเจ็บ สามารถเริ่ม easy run หรือเดินได้เลย";
  }

  // Generally good
  return "สัปดาห์นี้สมดุลดี รักษาระดับ load และวินัยการนอนให้ต่อเนื่องในสัปดาห์ถัดไป";
}
