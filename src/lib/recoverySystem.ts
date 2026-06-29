import type { CoachContext } from "./buildCoachContext";

export type RecoveryAxisStatus = "low" | "moderate" | "good" | "high";

export type RecoveryAxis = {
  key: "recovery" | "load" | "sleep" | "fuel";
  score: number; // 0–100
  status: RecoveryAxisStatus;
  label: string;
  summary: string;
  reasons: string[];
  missing?: string[];
};

export type RecoverySystemOverrides = {
  sleepScore?: number | null;
  energyScore?: number | null;
  yesterdayLoad?: "none" | "light" | "heavy";
  muscleSoreness?: "none" | "light" | "sore";
  injuryFlag?: boolean;
};

export type RunMateRecoverySystem = {
  overallScore: number; // 0–100
  overallLabel: "Low" | "Fair" | "Good" | "Excellent";
  coachingState: "push" | "maintain" | "easy" | "recover";
  headline: string;
  axes: {
    recovery: RecoveryAxis;
    load: RecoveryAxis;
    sleep: RecoveryAxis;
    fuel: RecoveryAxis;
  };
  guardrails: string[];
  recommendedIntensity: "rest" | "walk" | "easy" | "moderate" | "hard";
  sourceCoverage: {
    used: string[];
    missing: string[];
  };
};

export function buildRunMateRecoverySystem(
  context: CoachContext | null,
  overrides?: RecoverySystemOverrides
): RunMateRecoverySystem {
  const fallbackAxes = {
    recovery: {
      key: "recovery" as const,
      score: 70,
      status: "good" as const,
      label: "ฟื้นตัวดี",
      summary: "ข้อมูลมีไม่เพียงพอในการประเมินละเอียด ใช้ค่าเฉลี่ยปกติ",
      reasons: ["ยังไม่มีประวัติการฟื้นตัวเพียงพอ"],
      missing: ["HRV", "ชีพจรขณะพัก"],
    },
    load: {
      key: "load" as const,
      score: 0,
      status: "low" as const,
      label: "โหลดต่ำ",
      summary: "ไม่มีประวัติโหลดวิ่งสะสมใน 7 วันล่าสุด",
      reasons: ["ยังไม่มีบันทึกกิจกรรมวิ่ง"],
      missing: ["กิจกรรมวิ่ง"],
    },
    sleep: {
      key: "sleep" as const,
      score: 70,
      status: "good" as const,
      label: "นอนดี",
      summary: "ไม่มีข้อมูลบันทึกการนอน ใช้ค่าเริ่มต้นปกติ",
      reasons: ["ยังไม่มีบันทึกการนอน"],
      missing: ["บันทึกการนอน"],
    },
    fuel: {
      key: "fuel" as const,
      score: 50,
      status: "moderate" as const,
      label: "พลังงานปานกลาง",
      summary: "ไม่มีข้อมูลบันทึกอาหาร ใช้ค่าเริ่มต้นปกติ",
      reasons: ["ยังไม่มีบันทึกอาหารวันนี้"],
      missing: ["บันทึกอาหาร"],
    },
  };

  const fallbackResult: RunMateRecoverySystem = {
    overallScore: 70,
    overallLabel: "Good",
    coachingState: "maintain",
    headline: "รักษาระดับการฟื้นตัวและซ้อมตามความเหมาะสม",
    axes: fallbackAxes,
    guardrails: ["เนื่องจากข้อมูลยังไม่สมบูรณ์ แนะนำให้ซ้อมตามความรู้สึกเป็นหลัก"],
    recommendedIntensity: "easy",
    sourceCoverage: { used: [], missing: ["บันทึกการนอน", "กิจกรรมวิ่ง", "บันทึกอาหาร"] },
  };

  if (!context) {
    return fallbackResult;
  }

  const today = context.todayDate;
  const usedData: string[] = [];
  const missingData: string[] = [];

  // Override mapping
  const manualSleepScore = overrides?.sleepScore !== undefined ? overrides.sleepScore : null;
  const manualEnergyScore = overrides?.energyScore !== undefined ? overrides.energyScore : null;
  const manualYesterdayLoad = overrides?.yesterdayLoad !== undefined ? overrides.yesterdayLoad : null;
  const manualMuscleSoreness = overrides?.muscleSoreness !== undefined ? overrides.muscleSoreness : null;
  const activePain = overrides?.injuryFlag !== undefined ? overrides.injuryFlag : context.activePain;

  // =========================================================================
  // A) RECOVERY AXIS (ร่างกายฟื้นตัวแค่ไหน)
  // =========================================================================
  const recReasons: string[] = [];
  const recMissing: string[] = [];
  let recoveryScore = 75; // Baseline

  // 1. Sleep score baseline if available
  const sleepBase = manualSleepScore ?? context.latestSleepScore;
  if (sleepBase != null) {
    recoveryScore = sleepBase;
    recReasons.push(`อ้างอิงคะแนนการนอนคืนล่าสุด ${sleepBase} คะแนน`);
    usedData.push(`คะแนนการนอน ${sleepBase}`);
  } else {
    recMissing.push("คะแนนการนอนเมื่อคืน");
    missingData.push("บันทึกการนอน");
  }

  // 2. HRV delta
  const latestSleep = context.sleep7d?.[0];
  const hrvs = context.sleep7d.map(s => s.hrv).filter((h): h is number => h != null);
  const avgHRV7d = hrvs.length >= 2 ? hrvs.reduce((a, b) => a + b, 0) / hrvs.length : null;
  const latestHRV = latestSleep?.hrv ?? null;

  if (latestHRV != null && avgHRV7d != null) {
    const delta = latestHRV - avgHRV7d;
    usedData.push(`HRV ${latestHRV} ms`);
    if (delta < -10) {
      recoveryScore -= 15;
      recReasons.push(`HRV ต่ำกว่าค่าเฉลี่ยสะสมมาก (${latestHRV} ms vs เฉลี่ย ${Math.round(avgHRV7d)} ms) ร่างกายอาจเครียดสะสม`);
    } else if (delta < -4) {
      recoveryScore -= 8;
      recReasons.push(`HRV ต่ำกว่าค่าเฉลี่ยเล็กน้อย (${latestHRV} ms) ร่างกายฟื้นตัวได้จำกัด`);
    } else if (delta > 10) {
      recoveryScore += 5;
      recReasons.push(`HRV ดีกว่าปกติสูงขึ้นเด่นชัด (${latestHRV} ms) เป็นสัญญาณการฟื้นตัวที่แข็งแกร่ง`);
    } else {
      recReasons.push(`HRV ทรงตัวอยู่ในเกณฑ์ปกติ (${latestHRV} ms)`);
    }
  } else if (latestHRV != null) {
    usedData.push(`HRV ${latestHRV} ms`);
    recReasons.push(`HRV ล่าสุด ${latestHRV} ms ทรงตัวในเกณฑ์ปกติ`);
  } else {
    recMissing.push("HRV");
    recoveryScore -= 2;
    recReasons.push("ไม่มีข้อมูล HRV สำหรับการฟื้นตัวเชิงลึก");
  }

  // 3. Resting HR delta
  const restingHRs = context.sleep7d.map(s => s.restingHR).filter((h): h is number => h != null);
  const avgRestingHR7d = restingHRs.length >= 2 ? restingHRs.reduce((a, b) => a + b, 0) / restingHRs.length : null;
  const latestRestingHR = latestSleep?.restingHR ?? null;

  if (latestRestingHR != null && avgRestingHR7d != null) {
    const delta = latestRestingHR - avgRestingHR7d;
    usedData.push(`ชีพจรพัก ${latestRestingHR} bpm`);
    if (delta > 10) {
      recoveryScore -= 20;
      recReasons.push(`ชีพจรขณะพักสูงขึ้นกว่าปกติมาก (+${delta.toFixed(0)} bpm) ร่างกายเหนื่อยล้าค่อนข้างหนัก`);
    } else if (delta > 5) {
      recoveryScore -= 12;
      recReasons.push(`ชีพจรขณะพักเช้านี้สูงกว่าเกณฑ์ปกติ (+${delta.toFixed(0)} bpm)`);
    } else if (delta > 2) {
      recoveryScore -= 5;
      recReasons.push(`ชีพจรขณะพักสูงขึ้นเล็กน้อย (+${delta.toFixed(0)} bpm)`);
    } else if (delta < -2) {
      recoveryScore += 3;
      recReasons.push(`ชีพจรขณะพักต่ำลงเล็กน้อย (${latestRestingHR} bpm) การตอบสนองหัวใจฟื้นตัวดี`);
    } else {
      recReasons.push(`ชีพจรขณะพักเช้านี้ปกติ (${latestRestingHR} bpm)`);
    }
  } else if (latestRestingHR != null) {
    usedData.push(`ชีพจรพัก ${latestRestingHR} bpm`);
    recReasons.push(`ชีพจรขณะพักปกติ (${latestRestingHR} bpm)`);
  } else {
    recMissing.push("ชีพจรขณะพัก");
    recReasons.push("ไม่มีข้อมูลชีพจรขณะพักเพื่อวัดความล้าของหัวใจ");
  }

  // 4. Pain penalty
  if (activePain && context.latestPain) {
    const painLevel = context.latestPain.painLevel;
    if (painLevel >= 5) {
      recoveryScore -= 40;
      recReasons.push(`มีอาการเจ็บเสี่ยงสูงที่${context.latestPain.painLocation}ระดับ ${painLevel}/10`);
    } else {
      recoveryScore -= 20;
      recReasons.push(`มีอาการเจ็บ${context.latestPain.painLocation}ระดับ ${painLevel}/10 ควรรอบคอบ`);
    }
  } else if (context.painResolved || context.recentPainHistory) {
    recoveryScore -= 5;
    if (context.latestPain) {
      recReasons.push(`อาการเจ็บ${context.latestPain.painLocation}หายแล้ว แต่ยังอยู่ในช่วงเฝ้าระวัง`);
    } else {
      recReasons.push("อาการเจ็บหายแล้ว แต่ยังต้องควบคุมโหลดซ้อม");
    }
  } else {
    recReasons.push("ไม่มีรายงานอาการเจ็บปวด");
  }

  // 5. Muscle soreness override
  if (manualMuscleSoreness === "sore") {
    recoveryScore -= 15;
    recReasons.push("ระบุกล้ามเนื้อระบม/ล้าสะสมมาก (ปรับลดการฟื้นตัว)");
  } else if (manualMuscleSoreness === "light") {
    recoveryScore -= 5;
    recReasons.push("ระบุกล้ามเนื้อตึงล้าเล็กน้อย");
  }

  // 6. Sleep today missing
  const hasSleepToday = context.sleep7d.some((s) => s.date === today);
  if (!hasSleepToday && context.sleep7d.length > 0 && manualSleepScore == null) {
    recoveryScore -= 3;
    recReasons.push("ยังไม่มีข้อมูลการนอนวันนี้ ใช้ข้อมูลล่าสุดแทน");
  }

  recoveryScore = Math.max(0, Math.min(100, recoveryScore));

  let recoveryStatus: RecoveryAxisStatus = "moderate";
  let recoveryLabel = "ฟื้นตัวปานกลาง";
  let recoverySummary = "ร่างกายฟื้นตัวปานกลาง ควรควบคุมระดับความเหนื่อย";

  if (recoveryScore >= 80) {
    recoveryStatus = "high";
    recoveryLabel = "ฟื้นตัวดีเยี่ยม";
    recoverySummary = "ร่างกายฟื้นตัวได้ดีมาก พร้อมซ้อมตามแผนหลัก";
  } else if (recoveryScore >= 66) {
    recoveryStatus = "good";
    recoveryLabel = "ฟื้นตัวดี";
    recoverySummary = "ร่างกายฟื้นตัวดี ซ้อมตามแผนปกติได้สมดุล";
  } else if (recoveryScore >= 50) {
    recoveryStatus = "moderate";
    recoveryLabel = "ฟื้นตัวปานกลาง";
    recoverySummary = "ร่างกายฟื้นตัวปานกลาง ควรควบคุมความเข้มข้นไม่ให้สูงเกินไป";
  } else {
    recoveryStatus = "low";
    recoveryLabel = "ฟื้นตัวต่ำ";
    recoverySummary = "ฟื้นตัวต่ำมาก แนะนำให้งดซ้อมหรือเดิน/จ็อกเบามาก ๆ";
  }

  const recoveryAxis: RecoveryAxis = {
    key: "recovery",
    score: recoveryScore,
    status: recoveryStatus,
    label: recoveryLabel,
    summary: recoverySummary,
    reasons: recReasons,
    missing: recMissing.length > 0 ? recMissing : undefined,
  };

  // =========================================================================
  // B) LOAD AXIS (ช่วงนี้ใช้ร่างกายหนักแค่ไหน)
  // =========================================================================
  const loadReasons: string[] = [];
  const loadMissing: string[] = [];
  let loadScore = 0; // Starts at 0 (no strain)

  const weeklyKm = context.totalRunKm;
  const sessions = context.runDays7d;
  const longestRun = context.longestRun7dKm;
  const strengthCount = context.workouts7d.reduce((sum, d) => sum + d.other.filter(o => o.label.includes("เวท")).length, 0) +
                        context.workouts7d.reduce((sum, d) => sum + d.other.filter(o => o.label.includes("Strength")).length, 0);

  usedData.push(`วิ่งสะสม ${weeklyKm.toFixed(1)} km / 7 วัน`);

  // Weekly volume
  if (weeklyKm > 50) {
    loadScore += 40;
    loadReasons.push(`ระยะวิ่งสะสมสัปดาห์นี้สูงมาก (${weeklyKm.toFixed(1)} km)`);
  } else if (weeklyKm > 35) {
    loadScore += 30;
    loadReasons.push(`ระยะวิ่งสะสมสัปดาห์นี้ค่อนข้างสูง (${weeklyKm.toFixed(1)} km)`);
  } else if (weeklyKm > 15) {
    loadScore += 20;
    loadReasons.push(`ระยะวิ่งสะสมสัปดาห์นี้ระดับปานกลาง (${weeklyKm.toFixed(1)} km)`);
  } else if (weeklyKm > 0) {
    loadScore += 10;
    loadReasons.push(`ระยะวิ่งสะสมสัปดาห์นี้ต่ำ (${weeklyKm.toFixed(1)} km)`);
  } else {
    loadReasons.push("ไม่มีโหลดระยะทางวิ่งสะสมในรอบ 7 วัน");
  }

  // Workouts count
  if (sessions >= 5) {
    loadScore += 20;
    loadReasons.push(`ซ้อมบ่อยเกือบทุกวัน (${sessions} วัน/สัปดาห์) กล้ามเนื้ออาจล้าสะสม`);
  } else if (sessions >= 3) {
    loadScore += 10;
    loadReasons.push(`ซ้อมสม่ำเสมอดี (${sessions} วัน/สัปดาห์)`);
  } else if (sessions > 0) {
    loadScore += 5;
    loadReasons.push(`ซ้อมบางวัน (${sessions} วัน/สัปดาห์)`);
  }

  // Long run fatigue
  if (longestRun != null) {
    if (longestRun >= 15) {
      loadScore += 20;
      loadReasons.push(`มีวิ่งยาวระยะไกลสะสมความล้าสูง (${longestRun.toFixed(1)} km)`);
    } else if (longestRun >= 8) {
      loadScore += 10;
      loadReasons.push(`มีวิ่งระยะกลางถึงยาว (${longestRun.toFixed(1)} km)`);
    }
  }

  // Strength count
  if (strengthCount > 0) {
    loadScore += 10;
    loadReasons.push(`มีเวทเทรนนิ่งเสริมสร้างความแข็งแกร่ง ${strengthCount} ครั้ง`);
  }

  // Today workout
  if (context.hasWorkoutToday) {
    loadScore += 10;
    loadReasons.push("วันนี้มีบันทึกกิจกรรมการซ้อมแล้ว โหลดประจำวันเกิดขึ้นแล้ว");
  }

  // Manual load overrides
  if (manualYesterdayLoad === "heavy") {
    loadScore += 20;
    loadReasons.push("ระบุความหนักเมื่อวานอยู่ในเกณฑ์หนักสะสมความล้าเพิ่มขึ้น");
  } else if (manualYesterdayLoad === "light") {
    loadScore += 8;
    loadReasons.push("ระบุความหนักเมื่อวานอยู่ในเกณฑ์เบา/ปานกลาง");
  }

  loadScore = Math.max(0, Math.min(100, loadScore));

  let loadStatus: RecoveryAxisStatus = "moderate";
  let loadLabel = "โหลดปานกลาง";
  let loadSummary = "โหลดซ้อมอยู่ในเกณฑ์สมดุล ไม่เหนื่อยล้าสะสมจนเกินไป";

  if (loadScore >= 75) {
    loadStatus = "high";
    loadLabel = "โหลดสูงมาก";
    loadSummary = "สะสมโหลดซ้อมค่อนข้างสูงมากจากความถี่หรือระยะทางสัปดาห์นี้ ควรเน้นพักผ่อน";
  } else if (loadScore >= 55) {
    loadStatus = "high";
    loadLabel = "โหลดสูง";
    loadSummary = "โหลดซ้อมสะสมสูงกว่าปกติ ควร capped โหลดและเน้นความสม่ำเสมอ";
  } else if (loadScore >= 35) {
    loadStatus = "moderate";
    loadLabel = "โหลดปานกลาง";
    loadSummary = "โหลดซ้อมระดับปกติ รักษาสภาพความแข็งแรงได้ดี";
  } else {
    loadStatus = "low";
    loadLabel = "โหลดต่ำ";
    loadSummary = "โหลดซ้อมค่อนข้างต่ำ ร่างกายยังสดชื่น ไม่มีอาการสะสมโหลดเหนื่อยล้า";
  }

  const loadAxis: RecoveryAxis = {
    key: "load",
    score: loadScore,
    status: loadStatus,
    label: loadLabel,
    summary: loadSummary,
    reasons: loadReasons,
    missing: loadMissing.length > 0 ? loadMissing : undefined,
  };

  // =========================================================================
  // C) SLEEP AXIS (นอนพอไหม / มี sleep debt ไหม)
  // =========================================================================
  const sleepReasons: string[] = [];
  const sleepMissing: string[] = [];
  let sleepScoreVal = 70; // Baseline

  const latestSleepDurationMin = latestSleep?.durationMinutes ?? null;
  const avgSleepHoursVal = context.sleepAvg7dHours;

  // 1. Today/Latest sleep duration
  if (manualSleepScore != null) {
    sleepScoreVal = manualSleepScore;
    sleepReasons.push(`ระบุคะแนนการนอนเมื่อคืนเอง ${manualSleepScore} คะแนน`);
    usedData.push(`คะแนนการนอน ${manualSleepScore}`);
  } else if (latestSleepDurationMin != null) {
    const hours = latestSleepDurationMin / 60;
    usedData.push(`นอนเมื่อคืน ${hours.toFixed(1)} ชม.`);
    if (hours >= 8) {
      sleepScoreVal += 15;
      sleepReasons.push(`นอนเมื่อคืนเพียงพอเต็มที่ (${hours.toFixed(1)} ชม.)`);
    } else if (hours >= 7) {
      sleepScoreVal += 10;
      sleepReasons.push(`นอนเมื่อคืนเพียงพอตามมาตรฐาน (${hours.toFixed(1)} ชม.)`);
    } else if (hours >= 6) {
      sleepReasons.push(`นอนเมื่อคืนระดับปานกลาง (${hours.toFixed(1)} ชม.)`);
    } else if (hours >= 5) {
      sleepScoreVal -= 15;
      sleepReasons.push(`นอนเมื่อคืนค่อนข้างน้อย (${hours.toFixed(1)} ชม.) ฟื้นฟูกล้ามเนื้อได้ไม่เต็มที่`);
    } else {
      sleepScoreVal -= 30;
      sleepReasons.push(`นอนเมื่อคืนน้อยมากปานวิกฤต (${hours.toFixed(1)} ชม.) ควรเน้นพักผ่อนสะสมชดเชย`);
    }
  } else {
    sleepMissing.push("ระยะเวลานอนเมื่อคืน");
  }

  // 2. 7-day sleep average
  if (avgSleepHoursVal != null) {
    usedData.push(`นอนเฉลี่ยสะสม ${avgSleepHoursVal.toFixed(1)} ชม.`);
    if (avgSleepHoursVal >= 7.5) {
      sleepScoreVal += 15;
      sleepReasons.push(`การนอนเฉลี่ยสะสม 7 วันเพียงพอดีเยี่ยม (${avgSleepHoursVal.toFixed(1)} ชม.)`);
    } else if (avgSleepHoursVal >= 6.5) {
      sleepScoreVal += 5;
      sleepReasons.push(`การนอนเฉลี่ยสะสม 7 วันอยู่ในเกณฑ์สมดุล (${avgSleepHoursVal.toFixed(1)} ชม.)`);
    } else if (avgSleepHoursVal >= 5.5) {
      sleepScoreVal -= 15;
      sleepReasons.push(`การนอนสะสมเฉลี่ยต่ำเกณฑ์ (${avgSleepHoursVal.toFixed(1)} ชม.) เริ่มมีหนี้การนอนค้าง`);
    } else {
      sleepScoreVal -= 30;
      sleepReasons.push(`หนี้การนอนสะสมสูงมาก เฉลี่ย 7 วันเพียง ${avgSleepHoursVal.toFixed(1)} ชม.`);
    }
  } else {
    sleepMissing.push("ประวัตินอนสะสม 7 วัน");
  }

  // 3. Sleep quality score
  if (context.latestSleepScore != null && manualSleepScore == null) {
    if (context.latestSleepScore >= 85) {
      sleepScoreVal += 5;
      sleepReasons.push(`คุณภาพการหลับลึกอยู่ในเกณฑ์ดีมาก`);
    } else if (context.latestSleepScore < 60) {
      sleepScoreVal -= 10;
      sleepReasons.push(`หลับตื้นหรือหลับ ๆ ตื่น ๆ คุณภาพการนอนต่ำกว่าปกติ`);
    }
  }

  // 4. Energy score override
  if (manualEnergyScore != null) {
    const energyDelta = manualEnergyScore - 70;
    sleepScoreVal += Math.round(energyDelta * 0.25);
    sleepReasons.push(`ปรับความพร้อมตามระดับพลังงานที่ระบุ (${manualEnergyScore})`);
  }

  sleepScoreVal = Math.max(0, Math.min(100, sleepScoreVal));

  let sleepStatus: RecoveryAxisStatus = "moderate";
  let sleepLabel = "นอนปานกลาง";
  let sleepSummary = "เวลานอนปานกลาง อาจต้องการนอนหลับชดเชยสะสมเพิ่มเติม";

  if (sleepScoreVal >= 80) {
    sleepStatus = "high";
    sleepLabel = "นอนดีเยี่ยม";
    sleepSummary = "นอนหลับพักผ่อนได้อย่างเต็มที่และสะสมอย่างเพียงพอ";
  } else if (sleepScoreVal >= 60) {
    sleepStatus = "good";
    sleepLabel = "นอนดี";
    sleepSummary = "นอนหลับอยู่ในเกณฑ์ปกติดี รักษารอบการนอนได้สม่ำเสมอ";
  } else if (sleepScoreVal >= 40) {
    sleepStatus = "moderate";
    sleepLabel = "นอนปานกลาง";
    sleepSummary = "นอนหลับปานกลาง สะสมเวลานอนให้สม่ำเสมอขึ้น";
  } else {
    sleepStatus = "low";
    sleepLabel = "นอนน้อย";
    sleepSummary = "นอนหลับไม่เพียงพอสะสม อาจตึงล้าและสมาธิลดลงขณะวิ่ง";
  }

  const sleepAxis: RecoveryAxis = {
    key: "sleep",
    score: sleepScoreVal,
    status: sleepStatus,
    label: sleepLabel,
    summary: sleepSummary,
    reasons: sleepReasons,
    missing: sleepMissing.length > 0 ? sleepMissing : undefined,
  };

  // =========================================================================
  // D) FUEL AXIS (กินพอรองรับซ้อม/ฟื้นตัวไหม)
  // =========================================================================
  const fuelReasons: string[] = [];
  const fuelMissing: string[] = [];
  let fuelScore = 50; // Baseline at 50

  const mealCount = context.mealsToday?.length ?? 0;
  const carbStatus = context.nutritionBalanceToday?.carbStatus ?? null;
  const proteinStatus = context.nutritionBalanceToday?.proteinStatus ?? null;
  const totalCarbsG = context.nutritionToday?.carbsG ?? 0;

  // 1. Meal count
  if (mealCount === 0) {
    fuelScore = 30;
    fuelReasons.push("วันนี้ยังไม่บันทึกมื้ออาหารหลักในระบบ");
    fuelMissing.push("มื้ออาหารวันนี้");
  } else if (mealCount === 1) {
    fuelScore = 50;
    fuelReasons.push("บันทึกอาหารแล้ว 1 มื้อ แนะนำเติมมื้อรองหรือมื้อหลักเพิ่มก่อนซ้อม");
    usedData.push("บันทึกอาหาร 1 มื้อ");
  } else {
    fuelScore = 70;
    fuelReasons.push(`ทานอาหารแล้ว ${mealCount} มื้อ สนับสนุนพลังงานซ้อมระดับปกติ`);
    usedData.push(`บันทึกอาหาร ${mealCount} มื้อ`);
  }

  // 2. Carbs support
  if (carbStatus === "low" || (totalCarbsG > 0 && totalCarbsG < 60)) {
    fuelScore -= 15;
    fuelReasons.push("คาร์บวันนี้ยังน้อย แนะนำเติมคาร์โบไฮเดรตเพื่อป้องกันชนกำแพง (Bonking)");
  } else if (carbStatus === "ok" || carbStatus === "high" || totalCarbsG >= 60) {
    fuelScore += 15;
    fuelReasons.push("ปริมาณคาร์บสะสมปกติ พร้อมออกกำลังกายแบบใช้แรงยาว");
  }

  // 3. Protein support
  if (proteinStatus === "low") {
    fuelScore -= 10;
    fuelReasons.push("โปรตีนวันนี้ยังต่ำกว่าเป้าหมาย แนะนำเน้นโปรตีนในมื้อถัดไป");
  } else if (proteinStatus === "ok" || proteinStatus === "high") {
    fuelScore += 15;
    fuelReasons.push("โปรตีนอยู่ในเกณฑ์เพียงพอที่จะซ่อมแซมและฟื้นฟูกล้ามเนื้อ");
  }

  // 4. Quality checks
  if (context.nutritionBalanceToday?.friedFatStatus === "high") {
    fuelScore -= 5;
    fuelReasons.push("ทานของมัน/ทอดมาก อาจมีอาการแน่นหรืออึดอัดท้องขณะวิ่ง");
  }
  if (context.nutritionBalanceToday?.sugarStatus === "high") {
    fuelScore -= 5;
    fuelReasons.push("มีปริมาณน้ำตาลค่อนข้างสูง คุมคุณภาพมื้ออาหารดีขึ้น");
  }

  fuelScore = Math.max(0, Math.min(100, fuelScore));

  let fuelStatus: RecoveryAxisStatus = "moderate";
  let fuelLabel = "พลังงานปานกลาง";
  let fuelSummary = "ปริมาณพลังงานและสารอาหารปานกลาง ควรเติมโปรตีนหรือคาร์บเพิ่ม";

  if (fuelScore >= 80) {
    fuelStatus = "high";
    fuelLabel = "พลังงานดีเยี่ยม";
    fuelSummary = "สารอาหารพร้อมสนับสนุนการซ้อมหนักและการฟื้นตัวได้เป็นอย่างดี";
  } else if (fuelScore >= 60) {
    fuelStatus = "good";
    fuelLabel = "พลังงานเพียงพอ";
    fuelSummary = "พลังงานและโปรตีนเพียงพอสนับสนุนแผนกิจกรรมประจำวัน";
  } else if (fuelScore >= 40) {
    fuelStatus = "moderate";
    fuelLabel = "พลังงานปานกลาง";
    fuelSummary = "ระดับสารอาหารปานกลาง ทานโปรตีนและคาร์บคุณภาพเสริม";
  } else {
    fuelStatus = "low";
    fuelLabel = "พลังงานต่ำ";
    fuelSummary = "สารอาหารต่ำกว่าเกณฑ์การซ้อม ควรเติมพลังงานก่อนเริ่มซ้อมหนัก";
  }

  const fuelAxis: RecoveryAxis = {
    key: "fuel",
    score: fuelScore,
    status: fuelStatus,
    label: fuelLabel,
    summary: fuelSummary,
    reasons: fuelReasons,
    missing: fuelMissing.length > 0 ? fuelMissing : undefined,
  };

  // =========================================================================
  // E) OVERALL / COACHING STATE RULES
  // =========================================================================
  // Base overall score on V2 score or custom weighted axes.
  // Dynamic override adjustments also affect overallScore
  let baseV2 = context.readinessV2?.score ?? Math.round((recoveryScore * 0.45) + (sleepScoreVal * 0.25) + (fuelScore * 0.15) + (100 - loadScore) * 0.15);
  if (overrides) {
    // Dynamically re-evaluate baseV2 using weights if overrides are active
    baseV2 = Math.round((recoveryScore * 0.45) + (sleepScoreVal * 0.25) + (fuelScore * 0.15) + (100 - loadScore) * 0.15);
  }
  const overallScore = Math.max(0, Math.min(100, baseV2));

  let overallLabel: "Low" | "Fair" | "Good" | "Excellent" = "Fair";
  if (overallScore >= 80) overallLabel = "Excellent";
  else if (overallScore >= 66) overallLabel = "Good";
  else if (overallScore >= 50) overallLabel = "Fair";
  else overallLabel = "Low";

  let coachingState: "push" | "maintain" | "easy" | "recover" = "maintain";
  let recommendedIntensity: "rest" | "walk" | "easy" | "moderate" | "hard" = "easy";
  let headline = "รักษาระดับการฟื้นตัวและซ้อมตามความเหมาะสม";

  // Pain or low recovery drives "recover"
  if (activePain || recoveryScore < 50) {
    coachingState = "recover";
    recommendedIntensity = context.latestPain && context.latestPain.painLevel >= 5 ? "rest" : "walk";
    headline = "เน้นฟื้นฟูร่างกายและหลีกเลี่ยงแรงกระแทกหนัก";
  }
  // Recovery fair + load high => recover/easy
  else if (recoveryScore < 66 && loadScore >= 75) {
    coachingState = "recover";
    recommendedIntensity = "walk";
    headline = "สะสมความล้าสูงและฟื้นตัวปานกลาง แนะนำเน้นพักผ่อน";
  }
  // Recovery good + load high / sleep low => easy
  else if (recoveryScore >= 66 && (loadScore >= 75 || sleepScoreVal < 50)) {
    coachingState = "easy";
    recommendedIntensity = "easy";
    headline = "วิ่งประคองตัวคุมความเข้มข้น ห้ามกด Pace";
  }
  // Recovery good + load moderate => maintain
  else if (recoveryScore >= 66 && loadScore >= 40) {
    coachingState = "maintain";
    recommendedIntensity = "moderate";
    headline = "ร่างกายอยู่ในเกณฑ์สมดุล ซ้อมตามแผนปกติได้ดี";
  }
  // Recovery excellent + load not high + sleep/fuel okay => push
  else if (recoveryScore >= 80 && loadScore < 75 && sleepScoreVal >= 60 && fuelScore >= 60) {
    coachingState = "push";
    recommendedIntensity = "hard";
    headline = "ร่างกายสดและฟื้นฟูเต็มที่ พร้อมชนแผนหนักวันนี้";
  } else {
    // Fallback general maintain
    coachingState = "maintain";
    recommendedIntensity = "easy";
    headline = "พร้อมทำกิจกรรมตามสมควร คุมความหนักให้สมดุล";
  }

  // =========================================================================
  // F) GUARDRAILS GENERATOR
  // =========================================================================
  const guardrails: string[] = [];

  const isCompleted = context.hasWorkoutToday;

  if (isCompleted) {
    guardrails.push("วันนี้ใช้แรงไปแล้ว ไม่ต้องซ้อมเพิ่ม");

    if (activePain && context.latestPain) {
      guardrails.push(`มีอาการเจ็บ${context.latestPain.painLocation} ระดับ ${context.latestPain.painLevel}/10 เน้นประคบเย็นและพักผ่อนฟื้นฟูอาการเจ็บ`);
    } else if (recoveryScore < 50 || sleepScoreVal < 50 || loadScore >= 75) {
      guardrails.push("ถ้าขาหนักหรือ HR ยังสูง ให้เหลือแค่เดินเบา/ยืดเบา");
    }

    if (sleepScoreVal < 60) {
      guardrails.push("คืนนี้เน้นนอนให้พอ เพื่อให้ร่างกายซ่อมตัว");
    }

    if (fuelScore < 60) {
      guardrails.push("เติมน้ำ + โปรตีน + คาร์บให้พอ");
    }
  } else {
    if (activePain && context.latestPain) {
      guardrails.push(`มีอาการเจ็บ${context.latestPain.painLocation} ระดับ ${context.latestPain.painLevel}/10 แนะนำให้พักจากการวิ่งหรือเลือกจ็อก/เดินเบามาก ๆ เท่านั้น`);
    }

    if (recoveryScore < 50 || sleepScoreVal < 50) {
      guardrails.push("วันนี้ไม่ใช่วันกด pace หรือเร่งความเร็ว เน้นวิ่งเก็บโซนแอโรบิกเบาเป็นหลัก");
    }

    if (loadScore >= 75) {
      guardrails.push("ช่วงนี้สะสมโหลดซ้อมสะสมสัปดาห์นี้สูง คุม Easy ให้ Easy จริง ๆ เพื่อป้องกันอาการบาดเจ็บคืบคลาน");
    }

    if (sleepScoreVal < 60 && avgSleepHoursVal != null && avgSleepHoursVal < 6) {
      guardrails.push("Sleep เฉลี่ยสะสมต่ำเกณฑ์ หากชีพจรลอยขณะวิ่งให้ตัดระยะลง 10-20% ทันที");
    }

    if (fuelScore < 60) {
      guardrails.push("พลังงานสะสมอาหารวันนี้ยังน้อย แนะนำทานคาร์บย่อยง่าย เช่น กล้วยน้ำว้า 1 ลูก ก่อนวิ่ง 30 นาที");
    }
  }

  if (guardrails.length === 0) {
    guardrails.push("สภาพร่างกายพร้อมดีเยี่ยม รักษารูปแบบและวินัยซ้อมตามแผนปกติครับ");
  }

  return {
    overallScore,
    overallLabel,
    coachingState,
    headline,
    axes: {
      recovery: recoveryAxis,
      load: loadAxis,
      sleep: sleepAxis,
      fuel: fuelAxis,
    },
    guardrails,
    recommendedIntensity,
    sourceCoverage: {
      used: usedData,
      missing: missingData,
    },
  };
}
