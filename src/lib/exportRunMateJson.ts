import type { DailyReportItem, MonthlyReportSummary, WeeklyReportSummary } from "@/lib/reportSummary";

export type RunMateExportVersion = "runmate_export_v1";

export type RunMateReportPeriodExport = {
  schemaVersion: RunMateExportVersion;
  exportType: "report_period";
  exportedAt: string;
  appName: "RunMate AI";
  period: {
    type: "week" | "month";
    label: string;
    startDateKey: string;
    endDateKey: string;
  };
  summary: unknown;
  days?: unknown[];
  weeks?: unknown[];
  metadata: {
    timezone: "Asia/Bangkok";
    source: "report_calendar";
    includesRawImages: false;
    includesRawOcr: false;
    includesAuthData: false;
  };
};

export function buildReportPeriodJsonExport(args: {
  periodType: "week" | "month";
  periodLabel: string;
  startDateKey: string;
  endDateKey: string;
  weeklySummary?: WeeklyReportSummary | null;
  monthlySummary?: MonthlyReportSummary | null;
  exportedAt?: string;
}): RunMateReportPeriodExport {
  const base: RunMateReportPeriodExport = {
    schemaVersion: "runmate_export_v1",
    exportType: "report_period",
    exportedAt: args.exportedAt ?? new Date().toISOString(),
    appName: "RunMate AI",
    period: {
      type: args.periodType,
      label: args.periodLabel,
      startDateKey: args.startDateKey,
      endDateKey: args.endDateKey,
    },
    summary: {},
    metadata: {
      timezone: "Asia/Bangkok",
      source: "report_calendar",
      includesRawImages: false,
      includesRawOcr: false,
      includesAuthData: false,
    },
  };

  if (args.periodType === "week") {
    const summary = args.weeklySummary;
    return {
      ...base,
      summary: summary ? compactPeriodSummary(summary) : {},
      days: summary?.days.map(compactDay) ?? [],
    };
  }

  const summary = args.monthlySummary;
  return {
    ...base,
    summary: summary ? compactPeriodSummary(summary) : {},
    weeks: summary?.weeks.map((week) => ({
      label: week.label,
      startDateKey: week.startDateKey,
      endDateKey: week.endDateKey,
      totals: week.totals,
      averages: week.averages,
      highlights: week.highlights,
      consistency: week.consistency,
      pain: week.pain,
    })) ?? [],
  };
}

function compactPeriodSummary(summary: WeeklyReportSummary | MonthlyReportSummary) {
  return {
    totals: summary.totals,
    averages: summary.averages,
    highlights: summary.highlights,
    consistency: summary.consistency,
    pain: summary.pain,
  };
}

function compactDay(day: DailyReportItem) {
  const workouts = [
    day.runKm != null && day.runKm > 0
      ? { type: "run", distanceKm: day.runKm }
      : null,
    day.strengthMins != null && day.strengthMins > 0
      ? { type: "strength", durationMinutes: day.strengthMins }
      : null,
    day.walkMins != null && day.walkMins > 0
      ? { type: "walk", durationMinutes: day.walkMins }
      : null,
    day.hasRestWorkout ? { type: "recovery" } : null,
  ].filter(Boolean);

  return {
    dateKey: day.dateKey,
    weekdayLabel: day.weekdayLabel,
    hasData: day.hasData,
    runDistanceKm: day.runKm,
    workouts,
    sleepHours: day.sleepHours,
    readiness: day.readiness,
    nutrition: {
      mealCount: day.mealCount,
      caloriesKcal: day.caloriesKcal,
      proteinG: day.proteinG,
      carbsG: day.carbsG,
      fatG: day.fatG,
    },
    recovery: {
      hasDailySummary: day.hasDailySummary,
    },
    fuel: {
      mealCount: day.mealCount,
      proteinG: day.proteinG,
      carbsG: day.carbsG,
    },
    painSummary: day.painStatus
      ? {
          status: day.painStatus,
          painLevel: day.painLevel,
        }
      : null,
    bodyWeightKg: day.bodyWeightKg,
    shortSummary: buildDayShortSummary(day),
  };
}

function buildDayShortSummary(day: DailyReportItem): string {
  if (!day.hasData) return "ยังไม่มีข้อมูลวันนี้";
  const parts = [
    day.runKm != null && day.runKm > 0 ? `วิ่ง ${day.runKm} กม.` : null,
    day.strengthMins != null && day.strengthMins > 0 ? `เวท ${day.strengthMins} นาที` : null,
    day.sleepHours != null ? `นอน ${day.sleepHours} ชม.` : null,
    day.readiness != null ? `Readiness ${day.readiness}` : null,
    day.mealCount > 0 ? `อาหาร ${day.mealCount} มื้อ` : null,
    day.painStatus === "active" && day.painLevel != null ? `เจ็บ ${day.painLevel}/10` : null,
    day.painStatus === "resolved" ? "อาการเจ็บหายแล้ว" : null,
  ].filter(Boolean);

  return parts.join(" · ") || "มีข้อมูลบันทึกในวันนี้";
}
