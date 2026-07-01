/**
 * Report Calendar summary builders.
 * Report calendar weeks/months are for history display only.
 * Recovery/coach logic still uses rolling 7 days.
 */

import type { LocalHistoryItem } from "@/lib/localHistory";
import type { CalendarPeriod } from "@/lib/reportPeriods";
import { buildReportDaySummary, type ReportDaySummary } from "@/lib/reportDaySummary";
import { getHistoryItemDateKey } from "@/lib/date";
import { getDateKeysInRange, getWeeksInMonth, formatCalendarDayLabel } from "@/lib/reportPeriods";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ReportPeriodType = "week" | "month";

export type DailyReportItem = ReportDaySummary & {
  weekdayLabel: string;
  hasData: boolean;
  isToday: boolean;
};

export type PeriodTotals = {
  runDistanceKm: number;
  workoutDays: number;
  runDays: number;
  strengthDays: number;
  restDays: number;
  activityCount: number;
};

export type PeriodAverages = {
  readiness?: number;
  sleepHours?: number;
};

export type PeriodHighlights = {
  longestRunKm?: number;
  bestReadinessDay?: string;
  lowestSleepDay?: string;
};

export type PeriodConsistency = {
  sleepDays: number;
  nutritionDays: number;
  summaryDays: number;
};

export type PeriodPain = {
  activePainDays: number;
  resolvedPainDays: number;
};

export type WeeklyReportSummary = {
  periodType: "week";
  startDateKey: string;
  endDateKey: string;
  label: string;
  days: DailyReportItem[];
  totals: PeriodTotals;
  averages: PeriodAverages;
  highlights: PeriodHighlights;
  consistency: PeriodConsistency;
  pain: PeriodPain;
};

export type MonthlyReportSummary = {
  periodType: "month";
  startDateKey: string;
  endDateKey: string;
  label: string;
  weeks: WeeklyReportSummary[];
  totals: PeriodTotals;
  averages: PeriodAverages;
  highlights: PeriodHighlights & { highestWeeklyKm?: number };
  consistency: PeriodConsistency;
  pain: PeriodPain;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function itemsForDate(allItems: LocalHistoryItem[], dateKey: string): LocalHistoryItem[] {
  return allItems.filter((i) => getHistoryItemDateKey(i) === dateKey);
}

function buildDailyItem(
  allItems: LocalHistoryItem[],
  dateKey: string,
  todayDateKey: string,
): DailyReportItem {
  const dayItems = itemsForDate(allItems, dateKey);
  const summary = buildReportDaySummary(dayItems, dateKey);
  const hasData = dayItems.length > 0;
  return {
    ...summary,
    weekdayLabel: formatCalendarDayLabel(dateKey),
    hasData,
    isToday: dateKey === todayDateKey,
  };
}

function computeTotals(days: DailyReportItem[]): PeriodTotals {
  let runDistanceKm = 0;
  let workoutDays = 0;
  let runDays = 0;
  let strengthDays = 0;
  let activityCount = 0;

  for (const d of days) {
    if (!d.hasData) continue;
    if (d.runKm != null && d.runKm > 0) {
      runDistanceKm += d.runKm;
      runDays++;
      activityCount++;
    }
    if (d.strengthMins != null && d.strengthMins > 0) {
      strengthDays++;
      activityCount++;
    }
    if (d.hasRestWorkout) {
      activityCount++;
    }
    if (d.runKm != null || d.strengthMins != null || d.walkMins != null || d.hasRestWorkout) {
      workoutDays++;
    }
  }

  const restDays = days.filter((d) => d.hasData && workoutDays === 0).length;

  return {
    runDistanceKm: Math.round(runDistanceKm * 10) / 10,
    workoutDays,
    runDays,
    strengthDays,
    restDays,
    activityCount,
  };
}

function computeAverages(days: DailyReportItem[]): PeriodAverages {
  const readinessValues = days.map((d) => d.readiness).filter((v): v is number => v != null);
  const sleepValues = days.map((d) => d.sleepHours).filter((v): v is number => v != null);

  return {
    readiness: readinessValues.length
      ? Math.round(readinessValues.reduce((a, b) => a + b, 0) / readinessValues.length)
      : undefined,
    sleepHours: sleepValues.length
      ? Math.round((sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length) * 10) / 10
      : undefined,
  };
}

function computeHighlights(days: DailyReportItem[]): PeriodHighlights {
  let longestRunKm: number | undefined;
  let bestReadinessDay: string | undefined;
  let bestReadiness = -1;
  let lowestSleepDay: string | undefined;
  let lowestSleep = Infinity;

  for (const d of days) {
    if (!d.hasData) continue;
    if (d.runKm != null && (longestRunKm === undefined || d.runKm > longestRunKm)) {
      longestRunKm = d.runKm;
    }
    if (d.readiness != null && d.readiness > bestReadiness) {
      bestReadiness = d.readiness;
      bestReadinessDay = d.dateKey;
    }
    if (d.sleepHours != null && d.sleepHours < lowestSleep) {
      lowestSleep = d.sleepHours;
      lowestSleepDay = d.dateKey;
    }
  }

  return {
    longestRunKm,
    bestReadinessDay,
    lowestSleepDay,
  };
}

function computeConsistency(days: DailyReportItem[]): PeriodConsistency {
  return {
    sleepDays: days.filter((d) => d.sleepHours != null).length,
    nutritionDays: days.filter((d) => d.mealCount > 0).length,
    summaryDays: days.filter((d) => d.hasDailySummary).length,
  };
}

function computePain(days: DailyReportItem[]): PeriodPain {
  return {
    activePainDays: days.filter((d) => d.painStatus === "active").length,
    resolvedPainDays: days.filter((d) => d.painStatus === "resolved").length,
  };
}

// ─── Weekly summary ───────────────────────────────────────────────────────────

export function buildCalendarWeekSummary(
  allItems: LocalHistoryItem[],
  weekRange: CalendarPeriod,
  todayDateKey: string,
): WeeklyReportSummary {
  const dateKeys = getDateKeysInRange(weekRange.startDateKey, weekRange.endDateKey);
  const days = dateKeys.map((dk) => buildDailyItem(allItems, dk, todayDateKey));

  return {
    periodType: "week",
    startDateKey: weekRange.startDateKey,
    endDateKey: weekRange.endDateKey,
    label: weekRange.label,
    days,
    totals: computeTotals(days),
    averages: computeAverages(days),
    highlights: computeHighlights(days),
    consistency: computeConsistency(days),
    pain: computePain(days),
  };
}

// ─── Monthly summary ──────────────────────────────────────────────────────────

export function buildCalendarMonthSummary(
  allItems: LocalHistoryItem[],
  monthRange: CalendarPeriod,
  todayDateKey: string,
): MonthlyReportSummary {
  const weeksInMonth = getWeeksInMonth(monthRange);

  // Build weekly summaries, but only count days inside the selected month
  const weeks: WeeklyReportSummary[] = weeksInMonth.map((weekRange) => {
    const clampedStart = weekRange.startDateKey < monthRange.startDateKey
      ? monthRange.startDateKey
      : weekRange.startDateKey;
    const clampedEnd = weekRange.endDateKey > monthRange.endDateKey
      ? monthRange.endDateKey
      : weekRange.endDateKey;

    // Build the full week (7 days) for the day list, but compute totals only from clamped range
    const fullWeek = buildCalendarWeekSummary(allItems, weekRange, todayDateKey);

    // Rebuild totals/averages using only days inside this month
    const clampedDays = fullWeek.days.filter(
      (d) => d.dateKey >= clampedStart && d.dateKey <= clampedEnd,
    );

    return {
      ...fullWeek,
      totals: computeTotals(clampedDays),
      averages: computeAverages(clampedDays),
      highlights: computeHighlights(clampedDays),
      consistency: computeConsistency(clampedDays),
      pain: computePain(clampedDays),
    };
  });

  // Month totals: only days within the month
  const monthDateKeys = getDateKeysInRange(monthRange.startDateKey, monthRange.endDateKey);
  const monthDays = monthDateKeys.map((dk) => buildDailyItem(allItems, dk, todayDateKey));
  const monthTotals = computeTotals(monthDays);
  const monthAverages = computeAverages(monthDays);
  const monthHighlights = computeHighlights(monthDays);

  const highestWeeklyKm = weeks.reduce<number | undefined>((max, w) => {
    const km = w.totals.runDistanceKm;
    return km > 0 && (max === undefined || km > max) ? km : max;
  }, undefined);

  return {
    periodType: "month",
    startDateKey: monthRange.startDateKey,
    endDateKey: monthRange.endDateKey,
    label: monthRange.label,
    weeks,
    totals: monthTotals,
    averages: monthAverages,
    highlights: { ...monthHighlights, highestWeeklyKm },
    consistency: computeConsistency(monthDays),
    pain: computePain(monthDays),
  };
}
