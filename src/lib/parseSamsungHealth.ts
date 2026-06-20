import type { LocalHistoryItem } from "./localHistory";
import type { SleepAnalysis, WorkoutAnalysis, BodyCompositionAnalysis } from "@/types/logs";

const DAYS_TO_IMPORT = 90;
const cutoffMs = Date.now() - DAYS_TO_IMPORT * 24 * 60 * 60 * 1000;

// Samsung exercise_type codes → workoutKind
// Actual codes observed in CSV: 1001=walk, 1002=outdoor_run
// Legacy/other codes also included for completeness
const EXERCISE_KIND: Record<number, string> = {
  // Active CSV codes
  1001: "walk",
  1002: "outdoor_run",
  // Strength / weight training (various codes seen in Samsung Health)
  10007: "strength",  // Functional fitness / weight machines
  15001: "strength",  // Core training
  15002: "strength",  // Weight training
  // Legacy 5-digit codes
  11001: "outdoor_run",
  11002: "treadmill",
  11003: "cycling",
  11004: "cycling",
  11007: "walk",
  11008: "walk",
  11013: "strength",
  30000: "strength",
};

// ─── Main entry ───────────────────────────────────────────────────────────────

export function parseSamsungHealthFiles(
  files: Record<string, Uint8Array>
): LocalHistoryItem[] {
  const decoder = new TextDecoder("utf-8");

  // Match ONLY the main data CSV (prefix + numeric timestamp + .csv)
  // Avoids picking up sub-files like exercise.custom_exercise.csv, exercise.hr_zone.csv etc.
  const getMainCsv = (prefix: string): string | null => {
    const re = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\d+\\.csv$`);
    for (const [name, data] of Object.entries(files)) {
      const short = name.split("/").pop() ?? "";
      if (re.test(short)) return decoder.decode(data);
    }
    return null;
  };

  const items: LocalHistoryItem[] = [];

  const sleepCsv = getMainCsv("com.samsung.shealth.sleep.");
  const exerciseCsv = getMainCsv("com.samsung.shealth.exercise.");
  const weightCsv = getMainCsv("com.samsung.health.weight.");

  if (sleepCsv) items.push(...parseSleep(sleepCsv));
  if (exerciseCsv) items.push(...parseExercise(exerciseCsv));
  if (weightCsv) items.push(...parseWeight(weightCsv));

  // Sort newest-first so the caller's slice keeps the most recent items
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split("\n");
  // Line 0: Samsung metadata, Line 1: column names, Lines 2+: data
  const headers = (lines[1] ?? "").split(",").map((h) => h.trim());
  const rows = lines
    .slice(2)
    .filter((l) => l.trim())
    .map((l) => l.split(","));
  return { headers, rows };
}

function col(headers: string[], row: string[], name: string): string {
  const idx = headers.indexOf(name);
  return idx >= 0 ? (row[idx] ?? "").trim() : "";
}

function num(val: string): number | null {
  const n = parseFloat(val);
  return isNaN(n) || n === 0 ? null : n;
}

// Samsung Health stores timestamps in UTC. time_offset=UTC+0700 tells us the local timezone.
// We convert to Bangkok local time so dates match what the user sees in the Samsung Health app.
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+0700

// Parse UTC Samsung Health timestamp, return Bangkok-local ISO string (null if invalid)
function toLocalISO(utcStr: string): string | null {
  const utcMs = new Date(utcStr.replace(" ", "T") + "Z").getTime();
  if (isNaN(utcMs)) return null;
  return new Date(utcMs + TZ_OFFSET_MS).toISOString();
}

// Parse UTC Samsung Health timestamp, return Date object at UTC time
function toUtcDate(utcStr: string): Date {
  return new Date(utcStr.replace(" ", "T") + "Z");
}

// ─── Sleep ────────────────────────────────────────────────────────────────────

function parseSleep(content: string): LocalHistoryItem[] {
  const { headers, rows } = parseCSV(content);
  const items: LocalHistoryItem[] = [];

  for (const row of rows) {
    const startRaw = col(headers, row, "com.samsung.health.sleep.start_time");
    const endRaw = col(headers, row, "com.samsung.health.sleep.end_time");
    if (!startRaw || !endRaw) continue;

    const startUtcMs = toUtcDate(startRaw).getTime();
    const endUtcMs = toUtcDate(endRaw).getTime();
    if (startUtcMs < cutoffMs) continue;

    // Duration in UTC (same regardless of timezone)
    const durationMs = endUtcMs - startUtcMs;
    // Skip naps / short records (< 2 hours)
    if (durationMs > 0 && durationMs < 2 * 60 * 60 * 1000) continue;

    const sleepScore = num(col(headers, row, "sleep_score"));
    const efficiency = num(col(headers, row, "efficiency"));
    const physicalRecovery = num(col(headers, row, "physical_recovery"));
    const mentalRecovery = num(col(headers, row, "mental_recovery"));
    const totalRemMs = num(col(headers, row, "total_rem_duration"));
    const totalLightMs = num(col(headers, row, "total_light_duration"));

    const durationStr = durationMs > 0 ? formatHourMin(durationMs) : null;

    // Samsung Health labels sleep under the WAKE-UP date (Bangkok local)
    // Use end_time → Bangkok as the record's date
    const wakeUpLocalISO = toLocalISO(endRaw);
    if (!wakeUpLocalISO) continue;
    const wakeUpDateStr = wakeUpLocalISO.slice(0, 10);

    const readinessScore = Math.round(physicalRecovery ?? sleepScore ?? 65);
    const readinessLabel = readinessScore >= 80 ? "Excellent" : readinessScore >= 65 ? "Good" : readinessScore >= 50 ? "Fair" : "Low";

    const data: SleepAnalysis = {
      extracted: {
        date: wakeUpDateStr,
        sleepDuration: durationStr,
        sleepScore,
        energyScore: mentalRecovery ? Math.round(mentalRecovery) : null,
        restingHR: null,
        hrv: null,
        sleepQualityLabel: readinessLabel,
        visibleNotes: [
          sleepScore && `Sleep score ${sleepScore}`,
          durationStr && `นอน ${durationStr}`,
          efficiency && `ประสิทธิภาพ ${Math.round(efficiency)}%`,
          totalRemMs && `REM ${formatHourMin(totalRemMs)}`,
          totalLightMs && `Light ${formatHourMin(totalLightMs)}`,
        ].filter(Boolean).join(", ") || null,
      },
      coach: {
        readinessScore,
        readinessLabel: readinessLabel as SleepAnalysis["coach"]["readinessLabel"],
        aiSummary: sleepSummary(sleepScore, durationStr, physicalRecovery, mentalRecovery),
        todayRecommendation: sleepRecommendation(readinessScore),
        nutritionFocus: "ดื่มน้ำให้เพียงพอ กินโปรตีนหลังซ้อม",
        recoveryFocus: readinessScore < 65 ? "วันนี้เน้นพักมากกว่าซ้อม ลด intensity ลง" : "ฟื้นตัวปกติ ซ้อมได้ตามแผน",
        sleepFocus: "พยายามเข้านอนก่อน 23:00 และลดแสงหน้าจอ",
        warningNotes: "",
      },
    };

    items.push({
      id: `samsung-sleep-${startUtcMs}`,
      type: "sleep",
      createdAt: wakeUpLocalISO,
      data,
    });
  }

  return items;
}

// ─── Exercise ─────────────────────────────────────────────────────────────────

type RawAutoAct = { startMs: number; endMs: number; calorie: number | null; hr: number | null };

function parseExercise(content: string): LocalHistoryItem[] {
  const { headers, rows } = parseCSV(content);
  const items: LocalHistoryItem[] = [];
  // Dedup: Samsung Health records same workout from both phone and watch (within same minute)
  const seen = new Set<string>();
  // Auto-detected short activities (exerciseType 0) collected for merging into gym sessions
  const autoActs: RawAutoAct[] = [];

  for (const row of rows) {
    const startRaw = col(headers, row, "com.samsung.health.exercise.start_time");
    if (!startRaw) continue;

    const startUtcMs = toUtcDate(startRaw).getTime();
    if (isNaN(startUtcMs) || startUtcMs < cutoffMs) continue;

    const durationMs = num(col(headers, row, "com.samsung.health.exercise.duration"));
    if (!durationMs || durationMs < 1000) continue; // skip < 1 second

    const exerciseType = parseInt(col(headers, row, "com.samsung.health.exercise.exercise_type") || "0");
    const workoutKindEarly = EXERCISE_KIND[exerciseType] ?? "other";

    // Skip walk — user tracks runs only
    if (workoutKindEarly === "walk") continue;

    const sourcePkg = col(headers, row, "com.samsung.health.exercise.source_pkg_name").toLowerCase();
    const isStrava = sourcePkg.includes("strava");
    const isGoogleFit = sourcePkg.includes("google.android.apps.fitness") || sourcePkg.includes("com.google.fit");
    const isRunKind = workoutKindEarly === "outdoor_run" || workoutKindEarly === "treadmill";
    if (isStrava) continue;
    if (isRunKind && isGoogleFit) continue;

    // Auto-detected sets (exerciseType 0): collect for session merging instead of direct push
    if (exerciseType === 0) {
      const calorie = num(col(headers, row, "com.samsung.health.exercise.calorie"));
      const meanHR = num(col(headers, row, "com.samsung.health.exercise.mean_heart_rate"));
      // Dedup within same minute
      const autoKey = `auto-${Math.floor(startUtcMs / 60000)}`;
      if (!seen.has(autoKey)) {
        seen.add(autoKey);
        autoActs.push({ startMs: startUtcMs, endMs: startUtcMs + durationMs, calorie: calorie ? Math.round(calorie) : null, hr: meanHR ? Math.round(meanHR) : null });
      }
      continue;
    }

    // Skip known workouts shorter than 5 minutes
    if (durationMs < 5 * 60 * 1000) continue;

    // Dedup: same type within same minute = duplicate recording (phone + watch)
    const dedupeKey = `${exerciseType}-${Math.floor(startUtcMs / 60000)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const distanceM = num(col(headers, row, "com.samsung.health.exercise.distance"));
    const calorie = num(col(headers, row, "com.samsung.health.exercise.calorie"));
    const meanHR = num(col(headers, row, "com.samsung.health.exercise.mean_heart_rate"));
    const maxHR = num(col(headers, row, "com.samsung.health.exercise.max_heart_rate"));
    const meanSpeed = num(col(headers, row, "com.samsung.health.exercise.mean_speed")); // m/s
    const sweatLoss = num(col(headers, row, "com.samsung.health.exercise.sweat_loss"));
    const vo2Max = num(col(headers, row, "com.samsung.health.exercise.vo2_max"));
    const cadence = num(col(headers, row, "com.samsung.health.exercise.mean_cadence"));
    const altGain = num(col(headers, row, "com.samsung.health.exercise.altitude_gain"));

    const workoutKind = workoutKindEarly as WorkoutAnalysis["extracted"]["workoutKind"];
    const distanceKm = distanceM ? Math.round(distanceM / 10) / 100 : null;
    const avgSpeedKmh = meanSpeed ? Math.round(meanSpeed * 36) / 10 : null;
    const avgPace = meanSpeed && meanSpeed > 0 ? speedToPace(meanSpeed) : null;
    const durationStr = formatHMS(durationMs);
    const startLocalISO = toLocalISO(startRaw);
    if (!startLocalISO) continue;
    const startDateStr = startLocalISO.slice(0, 10);

    const data: WorkoutAnalysis = {
      extracted: {
        workoutKind,
        date: startDateStr,
        distanceKm,
        duration: durationStr,
        avgPace,
        avgSpeedKmh,
        avgHR: meanHR ? Math.round(meanHR) : null,
        maxHR: maxHR ? Math.round(maxHR) : null,
        cadence: cadence ? Math.round(cadence) : null,
        calories: calorie ? Math.round(calorie) : null,
        elevationGain: altGain,
        vo2Max,
        sweatLossMl: sweatLoss,
        visibleMetrics: [
          distanceKm && "distance",
          meanHR && "heart_rate",
          calorie && "calories",
          avgPace && "pace",
          sweatLoss && "sweat",
        ].filter(Boolean) as string[],
      },
      coach: {
        workoutSummary: exerciseSummary(workoutKind, distanceKm, durationStr, calorie, meanHR),
        intensityAssessment: hrZoneLabel(meanHR),
        trainingLoadNote: "",
        wasTooHard: !!(meanHR && meanHR > 170),
        recoveryAdvice: "ดื่มน้ำและกินโปรตีนหลังซ้อม ยืดเบาๆ",
        nutritionAfterWorkout: distanceKm && distanceKm > 5 ? "กินคาร์บ + โปรตีนภายใน 30 นาที" : "กินโปรตีนพอ",
        nextWorkoutSuggestion: "",
        coachNote: "",
      },
    };

    items.push({
      id: `samsung-exercise-${startUtcMs}`,
      type: "workout",
      createdAt: startLocalISO,
      data,
    });
  }

  // Merge auto-detected sets into gym sessions (gap ≤ 15 min between end and next start)
  items.push(...mergeAutoSessions(autoActs));

  return items;
}

function mergeAutoSessions(acts: RawAutoAct[]): LocalHistoryItem[] {
  if (acts.length === 0) return [];
  acts.sort((a, b) => a.startMs - b.startMs);

  const sessions: RawAutoAct[][] = [];
  let cur: RawAutoAct[] = [acts[0]];
  for (let i = 1; i < acts.length; i++) {
    const gap = acts[i].startMs - cur[cur.length - 1].endMs;
    if (gap <= 15 * 60 * 1000) {
      cur.push(acts[i]);
    } else {
      sessions.push(cur);
      cur = [acts[i]];
    }
  }
  sessions.push(cur);

  const items: LocalHistoryItem[] = [];
  for (const session of sessions) {
    const firstMs = session[0].startMs;
    const lastEndMs = session[session.length - 1].endMs;
    // Use wall-clock duration (matches what Samsung Health shows in the app)
    const wallClockMs = lastEndMs - firstMs;
    if (wallClockMs < 5 * 60 * 1000) continue; // skip sessions < 5 min total

    const startLocalISO = toLocalISO(new Date(firstMs).toISOString().replace("T", " ").slice(0, 19));
    if (!startLocalISO) continue;

    const totalCalories = session.reduce((s, a) => s + (a.calorie ?? 0), 0);
    const hrValues = session.map((a) => a.hr).filter((h): h is number => h != null);
    const avgHR = hrValues.length ? Math.round(hrValues.reduce((s, h) => s + h, 0) / hrValues.length) : null;
    const durationStr = formatHMS(wallClockMs);
    const workoutKind: WorkoutAnalysis["extracted"]["workoutKind"] = "strength";

    const data: WorkoutAnalysis = {
      extracted: {
        workoutKind,
        date: startLocalISO.slice(0, 10),
        distanceKm: null,
        duration: durationStr,
        avgPace: null,
        avgSpeedKmh: null,
        avgHR,
        maxHR: null,
        cadence: null,
        calories: totalCalories > 0 ? totalCalories : null,
        elevationGain: null,
        vo2Max: null,
        sweatLossMl: null,
        visibleMetrics: [avgHR && "heart_rate", totalCalories > 0 && "calories"].filter(Boolean) as string[],
      },
      coach: {
        workoutSummary: exerciseSummary(workoutKind, null, durationStr, totalCalories > 0 ? totalCalories : null, avgHR),
        intensityAssessment: hrZoneLabel(avgHR),
        trainingLoadNote: "",
        wasTooHard: false,
        recoveryAdvice: "ยืดเบาๆ และกินโปรตีนหลังเวท",
        nutritionAfterWorkout: "กินโปรตีนภายใน 30 นาที",
        nextWorkoutSuggestion: "",
        coachNote: "",
      },
    };

    items.push({
      id: `samsung-auto-${firstMs}`,
      type: "workout",
      createdAt: startLocalISO,
      data,
    });
  }
  return items;
}

// ─── Weight / Body ────────────────────────────────────────────────────────────

function parseWeight(content: string): LocalHistoryItem[] {
  const { headers, rows } = parseCSV(content);
  const items: LocalHistoryItem[] = [];

  for (const row of rows) {
    const startRaw = col(headers, row, "start_time");
    if (!startRaw) continue;

    const startUtcMs = toUtcDate(startRaw).getTime();
    if (startUtcMs < cutoffMs) continue;
    const startLocalISO = toLocalISO(startRaw);
    if (!startLocalISO) continue;

    const weightRaw = num(col(headers, row, "weight"));
    if (!weightRaw) continue;

    const round1 = (n: number | null) => n != null ? Math.round(n * 10) / 10 : null;
    const weight = round1(weightRaw);
    const height = num(col(headers, row, "height"));
    const bodyFat = round1(num(col(headers, row, "body_fat")));
    const skeletalMuscleMass = round1(num(col(headers, row, "skeletal_muscle_mass")));
    const bodyFatMass = round1(num(col(headers, row, "body_fat_mass")));
    const bmr = num(col(headers, row, "basal_metabolic_rate"));
    const totalBodyWater = round1(num(col(headers, row, "total_body_water")));
    const bmi = weight && height ? Math.round((weight / Math.pow(height / 100, 2)) * 10) / 10 : null;

    const data: BodyCompositionAnalysis = {
      extracted: {
        date: startLocalISO.slice(0, 10),
        weightKg: weight,
        skeletalMuscleKg: skeletalMuscleMass,
        bodyFatPercent: bodyFat,
        fatMassKg: bodyFatMass,
        bodyWaterKg: totalBodyWater,
        bmi,
        bmrCalories: bmr ? Math.round(bmr) : null,
        visibleNotes: null,
      },
      coach: {
        bodySummary: [
          `น้ำหนัก ${weight} kg`,
          bodyFat && `ไขมัน ${bodyFat}%`,
          skeletalMuscleMass && `กล้ามเนื้อ ${skeletalMuscleMass} kg`,
          bmi && `BMI ${bmi}`,
        ].filter(Boolean).join(", "),
        runnerInterpretation: "",
        nutritionFocus: "",
        strengthFocus: "",
        cautionNotes: "",
        coachNote: "",
      },
    };

    items.push({
      id: `samsung-weight-${startUtcMs}`,
      type: "body",
      createdAt: startLocalISO,
      data,
    });
  }

  return items;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHourMin(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatHMS(ms: number): string {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function speedToPace(mps: number): string {
  const secPerKm = 1000 / mps;
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function hrZoneLabel(hr: number | null): string {
  if (!hr) return "";
  if (hr < 120) return "Zone 1 — เบามาก / warmup";
  if (hr < 140) return "Zone 2 — Easy aerobic";
  if (hr < 155) return "Zone 3 — Moderate / Aerobic";
  if (hr < 170) return "Zone 4 — Hard / Threshold";
  return "Zone 5 — Max effort";
}

function sleepSummary(score: number | null, duration: string | null, physical: number | null, mental: number | null): string {
  return [
    score && `Sleep score ${score}`,
    duration && `นอน ${duration}`,
    physical && `ฟื้นร่างกาย ${Math.round(physical)}%`,
    mental && `ฟื้นจิตใจ ${Math.round(mental)}%`,
  ].filter(Boolean).join(", ") || "ข้อมูลการนอน";
}

function sleepRecommendation(score: number): string {
  if (score >= 80) return "พร้อมซ้อมหนักได้เลย ร่างกายฟื้นเต็มที่";
  if (score >= 65) return "ซ้อมได้ตามแผน ฟังเสียงร่างกายด้วย";
  if (score >= 50) return "Easy run หรือ recovery วันนี้เหมาะกว่า";
  return "พักวันนี้ดีที่สุดครับ ร่างกายยังฟื้นไม่พอ";
}

function exerciseSummary(kind: string, km: number | null, duration: string, cal: number | null, hr: number | null): string {
  const kindTh = { outdoor_run: "วิ่ง", treadmill: "วิ่งเครื่อง", walk: "เดิน", cycling: "ปั่นจักรยาน", strength: "เวท", other: "ออกกำลังกาย" }[kind] ?? kind;
  const kmStr = km ? (km.toFixed(2).endsWith(".00") ? `${Math.round(km)} km` : `${km.toFixed(2)} km`) : null;
  const calStr = cal ? `${Math.round(cal)} Cal` : null;
  return [kindTh, kmStr, duration, calStr, hr && `Avg HR ${Math.round(hr)}`].filter(Boolean).join(" · ");
}
