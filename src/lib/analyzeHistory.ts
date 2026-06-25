import type { LocalHistoryItem } from "./localHistory";
import type { BodyCompositionAnalysis, SleepAnalysis, WorkoutAnalysis } from "@/types/logs";
import { getBangkokDateKey, getHistoryItemDateKey } from "@/lib/date";

const DAY_NAMES_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์"];

export type RunnerHistoryStats = {
  totalRuns: number;
  dateFrom: string | null;
  dateTo: string | null;
  longestRunKm: number | null;
  averageDistanceKm: number | null;
  typicalEasyPaceRange: string | null;
  typicalEasyHRRange: string | null;
  maxObservedHR: number | null;
  latestVo2max: number | null;
  averageCadence: number | null;
  weeklyMileageEstimate: number | null;
  runningDaysPerWeekEstimate: number | null;
  commonTrainingDays: string[];
  commonLongRunDay: string | null;
  recentRunKms: number[];
  totalSleepLogs: number;
  averageSleepHours: number | null;
  averageSleepScore: number | null;
  averageEnergyScore: number | null;
  averageRestingHR: number | null;
  averageHRV: number | null;
  latestWeightKg: number | null;
  latestBodyFatPercent: number | null;
};

export type ProfileAnalysisSuggestions = {
  currentLevel: string | null;
  currentLongestRunKm: number | null;
  weeklyMileageKm: number | null;
  runningDaysPerWeek: number | null;
  easyPace: string | null;
  easyHrCap: string | null;
  maxHr: number | null;
  vo2max: number | null;
  averageCadence: number | null;
  preferredTrainingDays: string[] | null;
  preferredLongRunDay: string | null;
  injuryHistory: string | null;
  riskNotes: string | null;
  averageSleepHours: number | null;
  normalSleepScore: number | null;
  normalEnergyScore: number | null;
  normalRestingHr: number | null;
  normalHrv: number | null;
  recoveryRules: string | null;
  trainingPreferenceSummary: string | null;
};

export type ProfileAnalysisResult = {
  summary: {
    dataRange: string;
    totalRuns: number;
    totalSleepLogs: number;
    confidence: "low" | "medium" | "high";
    notes: string;
  };
  suggestions: ProfileAnalysisSuggestions;
  reasoning: {
    currentLevelReason: string;
    easyPaceReason: string;
    easyHrReason: string;
    sleepPatternReason: string;
    riskReason: string;
  };
  warnings: string[];
};

export function buildRunnerHistoryStats(items: LocalHistoryItem[] = []): RunnerHistoryStats {
  const cutoff = getBangkokDateKey(Date.now() - 90 * 86400000);

  // ── Workout (run) data ────────────────────────────────────────────────────
  const workoutItems = items.filter((i) => i.type === "workout").filter((i) => getHistoryItemDateKey(i) >= cutoff);

  type RunEntry = { date: string; km: number; avgHR: number | null; maxHR: number | null; pace: string | null; cadence: number | null; vo2max: number | null };
  const runs: RunEntry[] = [];

  for (const item of workoutItems) {
    const ext = (item.data as WorkoutAnalysis)?.extracted;
    if (!ext) continue;
    const kind = ext.workoutKind;
    if (kind !== "outdoor_run" && kind !== "treadmill") continue;

    const km = Number(ext.distanceKm) || 0;
    if (km <= 0) continue;

    let pace = ext.avgPace ?? null;
    if (!pace && ext.avgSpeedKmh && ext.avgSpeedKmh > 0) {
      pace = secsToMinPace(3600 / ext.avgSpeedKmh) + "/km";
    }

    runs.push({
      date: getHistoryItemDateKey(item),
      km,
      avgHR: ext.avgHR ?? null,
      maxHR: ext.maxHR ?? null,
      pace,
      cadence: ext.cadence ?? null,
      vo2max: ext.vo2Max ?? null,
    });
  }

  runs.sort((a, b) => a.date.localeCompare(b.date));

  const kms = runs.map((r) => r.km);
  const hrs = runs.map((r) => r.avgHR).filter((h): h is number => h != null);
  const maxHRs = runs.map((r) => r.maxHR).filter((h): h is number => h != null);
  const paces = runs.map((r) => parsePaceToSecs(r.pace)).filter((p): p is number => p != null);
  const cadences = runs.map((r) => r.cadence).filter((c): c is number => c != null);
  const vo2maxValues = runs.map((r) => r.vo2max).filter((v): v is number => v != null);

  const sortedHRs = [...hrs].sort((a, b) => a - b);
  const sortedPaces = [...paces].sort((a, b) => a - b);
  const sortedCadences = [...cadences].sort((a, b) => a - b);
  const sortedKms = [...kms].sort((a, b) => a - b);

  // "Easy" heuristic: runs in the lower 60th percentile of HR
  const easyHRThreshold = sortedHRs.length >= 3 ? percentile(sortedHRs, 0.6) : null;
  const easyRuns = easyHRThreshold != null
    ? runs.filter((r) => r.avgHR != null && r.avgHR <= easyHRThreshold)
    : (hrs.length === 0 ? runs : []);

  const easyPaceSecs = easyRuns
    .map((r) => parsePaceToSecs(r.pace))
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);

  const easyHRValues = easyRuns
    .map((r) => r.avgHR)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b);

  const typicalEasyPaceRange = easyPaceSecs.length >= 3
    ? `${secsToMinPace(percentile(easyPaceSecs, 0.25))}–${secsToMinPace(percentile(easyPaceSecs, 0.75))}/km`
    : sortedPaces.length >= 3
      ? `${secsToMinPace(percentile(sortedPaces, 0.4))}–${secsToMinPace(percentile(sortedPaces, 0.75))}/km`
      : null;

  const typicalEasyHRRange = easyHRValues.length >= 3
    ? `${Math.round(percentile(easyHRValues, 0.25))}–${Math.round(percentile(easyHRValues, 0.75))} bpm`
    : sortedHRs.length >= 3
      ? `${Math.round(percentile(sortedHRs, 0.2))}–${Math.round(percentile(sortedHRs, 0.5))} bpm`
      : null;

  const allObservedMaxHRs = [...maxHRs, ...hrs];
  const maxObservedHR = allObservedMaxHRs.length > 0 ? Math.max(...allObservedMaxHRs) : null;

  const averageCadence = sortedCadences.length > 0
    ? Math.round(sortedCadences.reduce((a, b) => a + b, 0) / sortedCadences.length)
    : null;

  // Use the most recent value — history is sorted oldest-first, so the last index is the latest
  const latestVo2max = vo2maxValues.length > 0 ? vo2maxValues[vo2maxValues.length - 1] : null;

  // Weekly grouping
  const weekMap = new Map<string, { kms: number[]; days: Set<string> }>();
  for (const run of runs) {
    const wk = isoWeekKey(run.date);
    const entry = weekMap.get(wk) ?? { kms: [], days: new Set() };
    entry.kms.push(run.km);
    entry.days.add(run.date);
    weekMap.set(wk, entry);
  }

  const weeklyTotals = [...weekMap.values()].map((w) => w.kms.reduce((a, b) => a + b, 0));
  const weeklyDayCounts = [...weekMap.values()].map((w) => w.days.size);
  const weeklyMileageEstimate = weeklyTotals.length > 0
    ? Math.round(median(weeklyTotals) * 10) / 10
    : null;
  const runningDaysPerWeekEstimate = weeklyDayCounts.length > 0
    ? Math.round(median(weeklyDayCounts) * 10) / 10
    : null;

  // Day of week patterns
  const dayRunCounts = new Array(7).fill(0);
  const dayKmSums = new Array(7).fill(0);
  for (const run of runs) {
    const d = new Date(run.date).getDay();
    dayRunCounts[d]++;
    dayKmSums[d] += run.km;
  }

  const minRunsForDay = Math.max(1, Math.ceil(runs.length * 0.1));
  const commonTrainingDays = DAY_NAMES_TH.filter((_, i) => dayRunCounts[i] >= minRunsForDay);

  const dayAvgKm = dayRunCounts.map((count, i) => (count > 0 ? dayKmSums[i] / count : 0));
  const maxAvgKmDay = dayAvgKm.indexOf(Math.max(...dayAvgKm));
  const commonLongRunDay = runs.length > 0 && dayRunCounts[maxAvgKmDay] > 0
    ? DAY_NAMES_TH[maxAvgKmDay]
    : null;

  // ── Body composition data ─────────────────────────────────────────────────
  const bodyItemsSorted = items
    .filter((i) => i.type === "body")
    .sort((a, b) => {
      const dateOrder = getHistoryItemDateKey(b).localeCompare(getHistoryItemDateKey(a));
      return dateOrder || b.createdAt.localeCompare(a.createdAt);
    });
  let latestWeightKg: number | null = null;
  let latestBodyFatPercent: number | null = null;
  for (const item of bodyItemsSorted) {
    const ext = (item.data as BodyCompositionAnalysis)?.extracted;
    if (!ext) continue;
    const w = Number(ext.weightKg);
    if (Number.isFinite(w) && w > 0) {
      latestWeightKg = w;
      latestBodyFatPercent = ext.bodyFatPercent != null ? Number(ext.bodyFatPercent) : null;
      break;
    }
  }

  // ── Sleep data ────────────────────────────────────────────────────────────
  const sleepItems = items.filter((i) => i.type === "sleep").filter((i) => getHistoryItemDateKey(i) >= cutoff);

  const sleepHours: number[] = [];
  const sleepScores: number[] = [];
  const energyScores: number[] = [];
  const restingHRs: number[] = [];
  const hrvs: number[] = [];

  for (const item of sleepItems) {
    const ext = (item.data as SleepAnalysis)?.extracted;
    if (!ext) continue;
    const h = parseSleepDuration(ext.sleepDuration);
    if (h != null) sleepHours.push(h);
    if (ext.sleepScore != null) sleepScores.push(ext.sleepScore);
    if (ext.energyScore != null) energyScores.push(ext.energyScore);
    if (ext.restingHR != null) restingHRs.push(ext.restingHR);
    if (ext.hrv != null) hrvs.push(ext.hrv);
  }

  return {
    totalRuns: runs.length,
    dateFrom: runs[0]?.date ?? null,
    dateTo: runs[runs.length - 1]?.date ?? null,
    longestRunKm: sortedKms.length > 0 ? sortedKms[sortedKms.length - 1] : null,
    averageDistanceKm: kms.length > 0 ? Math.round(avg(kms) * 10) / 10 : null,
    typicalEasyPaceRange,
    typicalEasyHRRange,
    maxObservedHR,
    latestVo2max,
    averageCadence,
    weeklyMileageEstimate,
    runningDaysPerWeekEstimate,
    commonTrainingDays,
    commonLongRunDay,
    recentRunKms: runs.slice(-10).map((r) => r.km),
    totalSleepLogs: sleepItems.length,
    averageSleepHours: sleepHours.length > 0 ? Math.round(avg(sleepHours) * 10) / 10 : null,
    averageSleepScore: sleepScores.length > 0 ? Math.round(avg(sleepScores)) : null,
    averageEnergyScore: energyScores.length > 0 ? Math.round(avg(energyScores)) : null,
    averageRestingHR: restingHRs.length > 0 ? Math.round(avg(restingHRs)) : null,
    averageHRV: hrvs.length > 0 ? Math.round(avg(hrvs)) : null,
    latestWeightKg,
    latestBodyFatPercent,
  };
}

export function buildHistoryAnalysisPrompt(stats: RunnerHistoryStats, currentProfile: Record<string, unknown> | null): string {
  const lines: string[] = [];

  lines.push("Historical Running Stats:");
  lines.push(`- Total runs: ${stats.totalRuns}`);
  if (stats.dateFrom && stats.dateTo) lines.push(`- Date range: ${stats.dateFrom} to ${stats.dateTo}`);
  if (stats.longestRunKm != null) lines.push(`- Longest run: ${stats.longestRunKm} km`);
  if (stats.averageDistanceKm != null) lines.push(`- Average distance: ${stats.averageDistanceKm} km`);
  if (stats.weeklyMileageEstimate != null) lines.push(`- Weekly mileage estimate: ${stats.weeklyMileageEstimate} km`);
  if (stats.runningDaysPerWeekEstimate != null) lines.push(`- Running days/week estimate: ${stats.runningDaysPerWeekEstimate}`);
  if (stats.typicalEasyPaceRange) lines.push(`- Typical lower-intensity pace: ${stats.typicalEasyPaceRange}`);
  if (stats.typicalEasyHRRange) lines.push(`- Typical lower-intensity HR: ${stats.typicalEasyHRRange}`);
  if (stats.maxObservedHR != null) lines.push(`- Max observed HR: ${stats.maxObservedHR} bpm`);
  if (stats.latestVo2max != null) lines.push(`- Latest VO2max (device estimate): ${stats.latestVo2max}`);
  if (stats.averageCadence != null) lines.push(`- Average cadence: ${stats.averageCadence} spm`);
  if (stats.commonTrainingDays.length > 0) lines.push(`- Common training days: ${stats.commonTrainingDays.join(", ")}`);
  if (stats.commonLongRunDay) lines.push(`- Common long run day: ${stats.commonLongRunDay}`);
  if (stats.recentRunKms.length > 0) lines.push(`- Recent runs (km): ${stats.recentRunKms.map((k) => k.toFixed(1)).join(", ")}`);

  lines.push("\nHistorical Sleep Stats:");
  lines.push(`- Total sleep logs: ${stats.totalSleepLogs}`);
  if (stats.averageSleepHours != null) lines.push(`- Average sleep duration: ${stats.averageSleepHours} hours`);
  if (stats.averageSleepScore != null) lines.push(`- Average sleep score: ${stats.averageSleepScore}`);
  if (stats.averageEnergyScore != null) lines.push(`- Average energy score: ${stats.averageEnergyScore}`);
  if (stats.averageRestingHR != null) lines.push(`- Average resting HR: ${stats.averageRestingHR} bpm`);
  if (stats.averageHRV != null) lines.push(`- Average HRV: ${stats.averageHRV} ms`);

  if (currentProfile) {
    lines.push("\nCurrent Profile Values (null = not yet set):");
    const profileFields = [
      "currentLongestRunKm", "weeklyMileageKm", "runningDaysPerWeek",
      "easyPace", "easyHrCap", "maxHr", "averageCadence",
      "injuryHistory", "riskNotes",
      "averageSleepHours", "normalSleepScore", "normalEnergyScore",
      "normalRestingHr", "normalHrv", "recoveryRules",
    ];
    for (const field of profileFields) {
      const val = currentProfile[field];
      if (val != null) lines.push(`- ${field}: ${Array.isArray(val) ? val.join(", ") : String(val)}`);
    }
  }

  lines.push("\nTask: Infer conservative Runner Profile suggestions. Return JSON only.");
  return lines.join("\n");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[Math.min(idx, sorted.length - 1)];
}

function parsePaceToSecs(pace: string | null | undefined): number | null {
  if (!pace) return null;
  const m = pace.match(/(\d+):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function secsToMinPace(secs: number): string {
  const min = Math.floor(secs / 60);
  const sec = Math.round(secs % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function parseSleepDuration(dur: string | null | undefined): number | null {
  if (!dur) return null;
  // "6h 30m" / "6시간 30분" / "6ชั่วโมง 30นาที"
  const hm = dur.match(/(\d+)\s*[hH시간ชั่วโมง]\s*(\d+)?/);
  if (hm) {
    const h = parseInt(hm[1]);
    const min = hm[2] ? parseInt(hm[2]) : 0;
    return h + min / 60;
  }
  // "6:30"
  const colon = dur.match(/^(\d+):(\d{2})/);
  if (colon) return parseInt(colon[1]) + parseInt(colon[2]) / 60;
  // "6.5h"
  const decimal = dur.match(/^(\d+\.?\d*)\s*h/i);
  if (decimal) return parseFloat(decimal[1]);
  // bare number
  const bare = parseFloat(dur);
  if (!Number.isNaN(bare)) return bare > 24 ? bare / 60 : bare;
  return null;
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${weekNo}`;
}
