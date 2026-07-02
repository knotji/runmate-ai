"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { deleteHistoryItem, loadHistoryItems, saveHistoryItems } from "@/lib/cloudHistory";
import { deleteRaceResult, loadRaceResults } from "@/lib/raceResults";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis, WorkoutAnalysis, MealAnalysis, DailySummary, BodyCompositionAnalysis, HealthCheckAnalysis, LabValue } from "@/types/logs";
import type { RaceResult } from "@/types/race";
import type { UserProfile } from "@/types/profile";
import type { PainLog } from "@/types/pain";
import type { StrengthLog } from "@/types/strength";
import {
  formatDistanceKm,
  formatDuration,
  formatPace,
  formatScore,
  formatPercent,
  formatDecimal,
  formatCalories,
  formatMacro,
  formatSummaryText,
} from "@/lib/format";
import { extractMealData, normalizeMealNutrition } from "@/lib/mealMerge";
import { polishSleepInsightText } from "@/lib/sleepInsight";
import { sanitizeAIThaiText } from "@/lib/sanitizeAIText";
import { dedupeSleepItems } from "@/lib/sleepDedupe";
import { getHistoryItemDateKey, dateKeyToRecordedAt, todayBangkokDateKey, yesterdayBangkokDateKey } from "@/lib/date";
import { normalizeMealSlot, getMealSlotLabel, getMealSlotIcon, getMealSlotOrder } from "@/lib/mealSlots";
import { getMealSourceInfo, isQuickProteinMeal } from "@/lib/mealSource";
import { buildWeeklyReview, type WeeklyReview } from "@/lib/weeklyReview";
import { buildWeeklyCoachTrendInsight } from "@/lib/trainingGuardrails";
import { getRunMateReadinessLabel } from "@/lib/readinessV2";
import { getRecoveryAxisLabel } from "@/lib/recoverySystem";
import {
  type CalendarPeriod,
  getCurrentCalendarWeek,
  getCurrentCalendarMonth,
  getPreviousCalendarWeek,
  getNextCalendarWeek,
  getPreviousCalendarMonth,
  getNextCalendarMonth,
} from "@/lib/reportPeriods";
import {
  buildCalendarWeekSummary,
  buildCalendarMonthSummary,
  type WeeklyReportSummary,
} from "@/lib/reportSummary";
import { buildReportPeriodJsonExport } from "@/lib/exportRunMateJson";
import { buildRunMateExportFilename, downloadJsonFile } from "@/lib/downloadJson";

// ─── Page ─────────────────────────────────────────────────────────────────────

type ReportFilter = "all" | "run" | "meal" | "strength" | "pain" | "health";

export default function ReportPage() {
  const [items, setItems] = useState<LocalHistoryItem[]>([]);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<ReportFilter>("all");
  const [showOlderDays, setShowOlderDays] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [editingMeal, setEditingMeal] = useState<LocalHistoryItem | null>(null);
  // Report calendar mode — calendar periods for history display only
  const [reportMode, setReportMode] = useState<"week" | "month">("week");
  const [calendarWeek, setCalendarWeek] = useState<CalendarPeriod>(() => getCurrentCalendarWeek());
  const [calendarMonth, setCalendarMonth] = useState<CalendarPeriod>(() => getCurrentCalendarMonth());
  const [calendarTransitioning, setCalendarTransitioning] = useState(false);
  const [exportPreparing, setExportPreparing] = useState(false);
  const [exportStatus, setExportStatus] = useState("");
  const calendarTransitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const [result, raceResult, profileResult] = await Promise.all([
        loadHistoryItems(),
        loadRaceResults(50),
        loadProfileFromSupabase(),
      ]);
      if (!alive) return;
      if (profileResult.ok) setProfile(profileResult.profile ?? null);
      if (result.ok) {
        setItems(result.items);
        if (raceResult.ok) {
          setRaceResults(raceResult.results);
          if (process.env.NODE_ENV === "development") {
            console.info("[report-race-badge-debug]", { raceResultsCount: raceResult.results.length, dates: raceResult.results.map((r) => r.raceDate) });
          }
        }
        setError("");
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("runmate:cloud-data-updated", load);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("runmate:cloud-data-updated", load);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (calendarTransitionTimer.current) clearTimeout(calendarTransitionTimer.current);
      if (exportStatusTimer.current) clearTimeout(exportStatusTimer.current);
    };
  }, []);

  function runCalendarTransition(action: () => void) {
    if (calendarTransitioning) return;
    if (calendarTransitionTimer.current) clearTimeout(calendarTransitionTimer.current);
    setCalendarTransitioning(true);
    action();
    calendarTransitionTimer.current = setTimeout(() => {
      setCalendarTransitioning(false);
      calendarTransitionTimer.current = null;
    }, 180);
  }

  async function handleExportJson() {
    if (exportPreparing) return;
    const activePeriod = reportMode === "week" ? calendarWeek : calendarMonth;
    const activeSummary = reportMode === "week" ? weekSummary : monthSummary;
    if (!activeSummary) {
      setExportStatus("ส่งออกไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }

    if (exportStatusTimer.current) clearTimeout(exportStatusTimer.current);
    setExportPreparing(true);
    setExportStatus("กำลังเตรียมไฟล์...");

    try {
      await new Promise((resolve) => setTimeout(resolve, 220));
      const data = buildReportPeriodJsonExport({
        periodType: reportMode,
        periodLabel: activePeriod.label,
        startDateKey: activePeriod.startDateKey,
        endDateKey: activePeriod.endDateKey,
        weeklySummary: reportMode === "week" ? weekSummary : null,
        monthlySummary: reportMode === "month" ? monthSummary : null,
      });
      const filename = buildRunMateExportFilename({
        periodType: reportMode,
        startDateKey: activePeriod.startDateKey,
        endDateKey: activePeriod.endDateKey,
      });
      downloadJsonFile(data, filename);
      setExportStatus("ดาวน์โหลด JSON แล้ว");
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.error("[report-json-export-error]", err);
      }
      setExportStatus("ส่งออกไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setExportPreparing(false);
      exportStatusTimer.current = setTimeout(() => {
        setExportStatus("");
        exportStatusTimer.current = null;
      }, 2200);
    }
  }

  const raceResultsByDate = groupRaceResultsByDate(raceResults);
  const days = groupByDay(items);
  const dashboard = buildDashboard(items);
  const pTarget = proteinTargetGrams(profile);
  const dashboardCutoff = dateKeyBefore(7);
  const todayDateKey = todayBangkokDateKey();
  const yesterdayDateKey = yesterdayBangkokDateKey();
  const weeklyReview = items.length > 0 ? buildWeeklyReview(items, todayDateKey) : null;

  // Calendar summaries — display only, do not affect recovery/coach logic
  const weekSummary = items.length > 0 ? buildCalendarWeekSummary(items, calendarWeek, todayDateKey) : null;
  const monthSummary = items.length > 0 ? buildCalendarMonthSummary(items, calendarMonth, todayDateKey) : null;

  const filteredDays = days.filter((day) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "run") {
      const workouts = day.items.filter((i) => i.type === "workout");
      return workouts.some((w) => isRun(w));
    }
    if (activeFilter === "meal") {
      return day.items.some((i) => i.type === "meal");
    }
    if (activeFilter === "strength") {
      const strengths = day.items.filter((i) => i.type === "strength");
      const workouts = day.items.filter((i) => i.type === "workout");
      return (
        strengths.length > 0 ||
        workouts.some((w) => !isRun(w) && !isWalk(w) && (w.data as WorkoutAnalysis)?.extracted?.workoutKind === "strength")
      );
    }
    if (activeFilter === "pain") {
      return day.items.some((i) => i.type === "pain");
    }
    if (activeFilter === "health") {
      return day.items.some((i) => i.type === "health_check");
    }
    return true;
  });
  const recentDays = filteredDays.slice(0, 7);
  const olderDays = filteredDays.slice(7);
  const visibleDays = showOlderDays ? filteredDays : recentDays;

  async function handleDeleteItem(item: LocalHistoryItem) {
    const confirmed = window.confirm("ลบรายการนี้?\n\nรายการนี้จะถูกลบออกจาก Report และจะไม่ถูกใช้เป็นบริบทให้ Coach อีก");
    if (!confirmed) return;
    setDeleteStatus("");
    setDeletingKey(item.id);
    try {
      const result = await deleteHistoryItem(item.id);
      if (!result.ok) {
        setDeleteStatus(result.error ? `ลบไม่สำเร็จ: ${result.error}` : "ลบไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      setItems((current) => current.filter((next) => next.id !== item.id));
      setDeleteStatus("ลบรายการแล้ว");
    } finally {
      setDeletingKey(null);
    }
  }

  async function handleDeleteRaceResult(result: RaceResult) {
    if (!result.id) return;
    const confirmed = window.confirm("ลบ Race Result นี้?\n\nรายการนี้จะถูกลบออกจาก Report และจะไม่ถูกใช้เป็นบริบทให้ Coach อีก");
    if (!confirmed) return;
    setDeleteStatus("");
    setDeletingKey(`race:${result.id}`);
    try {
      const response = await deleteRaceResult(result.id);
      if (!response.ok) {
        setDeleteStatus(response.error ? `ลบไม่สำเร็จ: ${response.error}` : "ลบไม่สำเร็จ ลองใหม่อีกครั้ง");
        return;
      }
      setRaceResults((current) => current.filter((next) => next.id !== result.id));
      setDeleteStatus("ลบรายการแล้ว");
    } finally {
      setDeletingKey(null);
    }
  }

  return (
    <AppShell title="บันทึกของเรา" subtitle="Report · ข้อมูลจาก Upload ที่โค้ชใช้เป็นบริบท">
      {loading ? (
        <section className="card p-5 text-sm text-[var(--color-text-soft)]">กำลังโหลดข้อมูล...</section>
      ) : error ? (
        <section className="card space-y-3 p-5 text-sm">
          <p className="font-semibold text-[var(--foreground)]">โหลด Report ไม่สำเร็จ</p>
          <p className="leading-5 text-[var(--muted-text)]">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-[var(--surface-muted)] px-4 py-2 text-xs font-bold text-[var(--foreground)]"
          >
            ลองใหม่
          </button>
        </section>
      ) : days.length === 0 ? (
        <section className="card space-y-3 p-5 text-sm text-[var(--muted-text)]">
          <div>
            <p className="font-bold text-[var(--foreground)]">ยังไม่มีบันทึกในสัปดาห์นี้</p>
            <p className="mt-1 leading-6">ลองบันทึกการนอน อาหาร หรือการซ้อมวันนี้ก่อน — ข้อมูลจะเริ่มสะสมเป็น Report ให้โค้ชใช้ประเมิน</p>
          </div>
          <Link href="/upload" className="btn-primary block py-3 text-center text-sm">
            บันทึกข้อมูลวันนี้
          </Link>
        </section>
      ) : (
        <>
          <section className="rounded-3xl border border-[var(--color-border-soft)] bg-[var(--surface)]/70 px-4 py-3 text-xs leading-5 text-[var(--color-text-muted)] shadow-sm">
            Report คือข้อมูลจริงจาก Upload และการบันทึก ส่วนแชทกับโค้ชจะไม่ถูกเพิ่มเข้าหน้านี้อัตโนมัติ
          </section>

          {/* Calendar navigation */}
          <CalendarNav
            mode={reportMode}
            onModeChange={(mode) => {
              if (mode !== reportMode) runCalendarTransition(() => setReportMode(mode));
            }}
            week={calendarWeek}
            month={calendarMonth}
            onWeekChange={(week) => runCalendarTransition(() => setCalendarWeek(week))}
            onMonthChange={(month) => runCalendarTransition(() => setCalendarMonth(month))}
            todayDateKey={todayDateKey}
            transitioning={calendarTransitioning}
            exportPreparing={exportPreparing}
            exportStatus={exportStatus}
            onExport={() => void handleExportJson()}
          />

          {deleteStatus ? (
            <section className={`rounded-2xl px-4 py-3 text-xs font-semibold ${deleteStatus.startsWith("ลบไม่สำเร็จ") ? "bg-red-50 text-red-600" : "bg-[var(--primary-soft)] text-[var(--color-success)]"}`}>
              {deleteStatus}
            </section>
          ) : null}

          {/* Calendar views */}
          <div
            aria-busy={calendarTransitioning}
            className={`space-y-3 transition-all duration-200 ${calendarTransitioning ? "translate-y-0.5 opacity-70" : "translate-y-0 opacity-100"}`}
            data-testid="calendar-content"
          >
            {reportMode === "week" ? (
              <>
                {weekSummary && (
                  <PeriodMetrics totals={weekSummary.totals} averages={weekSummary.averages} />
                )}
                <div className="space-y-2" data-testid="week-day-list">
                  {weekSummary?.days.map((day) => (
                    <DaySlot key={day.dateKey} day={day} />
                  ))}
                </div>
              </>
            ) : (
              <>
                {monthSummary && (
                  <PeriodMetrics totals={monthSummary.totals} averages={monthSummary.averages} />
                )}
                <div className="space-y-2" data-testid="month-week-list">
                  {monthSummary?.weeks.map((week) => (
                    <MonthWeekBlock
                      key={week.startDateKey}
                      week={week}
                      disabled={calendarTransitioning}
                      onSelectWeek={(period) => {
                        runCalendarTransition(() => {
                          setCalendarWeek(period);
                          setReportMode("week");
                        });
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          <RollingSevenDayInsight
            dashboard={dashboard}
            proteinTarget={pTarget}
            items={items}
            cutoff={dashboardCutoff}
            review={weeklyReview}
          />

          <FullHistoryDetails
            activeFilter={activeFilter}
            onFilterChange={(filter) => {
              setActiveFilter(filter);
              setShowOlderDays(false);
            }}
            filteredDays={filteredDays}
            visibleDays={visibleDays}
            olderDays={olderDays}
            showOlderDays={showOlderDays}
            onToggleOlderDays={() => setShowOlderDays((value) => !value)}
            items={items}
            raceResultsByDate={raceResultsByDate}
            proteinTarget={pTarget}
            onDeleteItem={handleDeleteItem}
            onEditItem={setEditingMeal}
            onDeleteRaceResult={handleDeleteRaceResult}
            deletingKey={deletingKey}
            todayDateKey={todayDateKey}
            yesterdayDateKey={yesterdayDateKey}
          />
        </>
      )}
      {editingMeal && (
        <EditMealModal
          item={editingMeal}
          onClose={() => setEditingMeal(null)}
          onSave={(updatedItem) => {
            setItems((current) => current.map((i) => (i.id === updatedItem.id ? updatedItem : i)));
            setEditingMeal(null);
          }}
        />
      )}
    </AppShell>
  );
}

// ─── Calendar UI components ───────────────────────────────────────────────────

function CalendarNav({
  mode, onModeChange, week, month, onWeekChange, onMonthChange, todayDateKey, transitioning,
  exportPreparing, exportStatus, onExport,
}: {
  mode: "week" | "month";
  onModeChange: (m: "week" | "month") => void;
  week: CalendarPeriod;
  month: CalendarPeriod;
  onWeekChange: (w: CalendarPeriod) => void;
  onMonthChange: (m: CalendarPeriod) => void;
  todayDateKey: string;
  transitioning: boolean;
  exportPreparing?: boolean;
  exportStatus?: string;
  onExport?: () => void;
}) {
  const currentWeekStart = getCurrentCalendarWeek(todayDateKey).startDateKey;
  const currentMonthStart = getCurrentCalendarMonth(todayDateKey).startDateKey;
  const isCurrentWeek = week.startDateKey === currentWeekStart;
  const isCurrentMonth = month.startDateKey === currentMonthStart;
  const period = mode === "week" ? week : month;
  const atCurrent = mode === "week" ? isCurrentWeek : isCurrentMonth;

  return (
    <div className="space-y-2" data-testid="calendar-nav">
      <div className="flex rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface-muted)] p-1">
        {(["week", "month"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={transitioning}
            onClick={() => onModeChange(m)}
            className={`flex-1 rounded-xl py-2 text-xs font-bold transition-all disabled:cursor-not-allowed disabled:opacity-55 ${mode === m ? "bg-white shadow-sm text-[var(--primary)]" : "text-[var(--color-text-muted)]"}`}
          >
            {m === "week" ? "สัปดาห์" : "เดือน"}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={transitioning}
          onClick={() => {
            if (mode === "week") onWeekChange(getPreviousCalendarWeek(week));
            else onMonthChange(getPreviousCalendarMonth(month));
          }}
          className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--color-text-muted)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={mode === "week" ? "สัปดาห์ก่อน" : "เดือนก่อน"}
        >
          ‹
        </button>
        <div className="flex-1 text-center text-xs font-bold text-[var(--foreground)]">{period.label}</div>
        <button
          type="button"
          onClick={() => {
            if (mode === "week") {
              const next = getNextCalendarWeek(week);
              if (next.startDateKey <= todayDateKey) onWeekChange(next);
            } else {
              const next = getNextCalendarMonth(month);
              if (next.startDateKey <= todayDateKey) onMonthChange(next);
            }
          }}
          disabled={atCurrent || transitioning}
          className="rounded-xl border border-[var(--color-border-soft)] bg-[var(--surface)] px-3 py-2 text-sm font-bold text-[var(--color-text-muted)] disabled:opacity-40"
          aria-label={mode === "week" ? "สัปดาห์ถัดไป" : "เดือนถัดไป"}
        >
          ›
        </button>
        {!atCurrent && (
          <button
            type="button"
            disabled={transitioning}
            onClick={() => {
              if (mode === "week") onWeekChange(getCurrentCalendarWeek(todayDateKey));
              else onMonthChange(getCurrentCalendarMonth(todayDateKey));
            }}
            className="rounded-xl border border-[var(--primary)]/20 bg-[var(--primary)]/5 px-3 py-2 text-xs font-bold text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-45"
            data-testid="nav-current-btn"
          >
            ปัจจุบัน
          </button>
        )}
      </div>
      {onExport !== undefined && (
        <div className="flex items-center justify-end gap-2 px-0.5" data-testid="report-export-control">
          {exportStatus && (
            <p className={`text-[11px] font-semibold ${exportStatus.includes("ไม่สำเร็จ") ? "text-red-600" : "text-[var(--color-success)]"}`} data-testid="report-export-status">
              {exportStatus}
            </p>
          )}
          <button
            type="button"
            title="ส่งออกข้อมูลช่วงนี้เป็นไฟล์ JSON"
            disabled={exportPreparing}
            onClick={onExport}
            className="rounded-full border border-[var(--color-border-soft)] bg-white/80 px-3 py-1.5 text-[11px] font-bold text-[var(--primary)] transition hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportPreparing ? "กำลังเตรียมไฟล์..." : "ส่งออก JSON"}
          </button>
        </div>
      )}
    </div>
  );
}

function PeriodMetrics({
  totals,
  averages,
}: {
  totals: { runDistanceKm: number; workoutDays: number };
  averages: { sleepHours?: number; readiness?: number };
}) {
  return (
    <div className="grid grid-cols-4 gap-2" data-testid="period-metrics">
      <div className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)] p-3 text-center">
        <p className="text-[10px] text-[var(--color-text-muted)]">วิ่งรวม</p>
        <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">{totals.runDistanceKm > 0 ? `${totals.runDistanceKm} กม.` : "—"}</p>
      </div>
      <div className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)] p-3 text-center">
        <p className="text-[10px] text-[var(--color-text-muted)]">วันซ้อม</p>
        <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">{totals.workoutDays > 0 ? `${totals.workoutDays} วัน` : "—"}</p>
      </div>
      <div className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)] p-3 text-center">
        <p className="text-[10px] text-[var(--color-text-muted)]">นอนเฉลี่ย</p>
        <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">{averages.sleepHours != null ? `${averages.sleepHours} ชม.` : "—"}</p>
      </div>
      <div className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)] p-3 text-center">
        <p className="text-[10px] text-[var(--color-text-muted)]">ความพร้อม</p>
        <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">{averages.readiness != null ? `${averages.readiness}` : "—"}</p>
      </div>
    </div>
  );
}

function DaySlot({ day }: { day: import("@/lib/reportSummary").DailyReportItem }) {
  const nutritionText = formatDayNutritionSummary(day);
  const activityText = formatDayActivitySummary(day);
  const baseClass = `rounded-2xl border p-3 ${day.isToday ? "border-[var(--primary)]/30 bg-[var(--primary)]/5" : "border-[var(--color-border-soft)] bg-[var(--surface)]"}`;

  if (!day.hasData) {
    return (
      <div className={baseClass} data-testid="day-slot">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--foreground)]">
            {day.weekdayLabel}
            {day.isToday && (
              <span className="ml-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] text-white">วันนี้</span>
            )}
          </span>
          <span className="text-[10px] text-[var(--color-text-muted)]">ยังไม่มีข้อมูล</span>
        </div>
      </div>
    );
  }

  return (
    <details
      className={`${baseClass} group`}
      data-testid="day-slot"
    >
      <summary className="list-none cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold text-[var(--foreground)]">
            {day.weekdayLabel}
            {day.isToday && (
              <span className="ml-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[10px] text-white">วันนี้</span>
            )}
          </span>
          <span className="shrink-0 text-[10px] font-bold text-[var(--primary)]">
            <span className="group-open:hidden">รายละเอียด ˅</span>
            <span className="hidden group-open:inline">ซ่อนรายละเอียด ˄</span>
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {activityText && (
            <span className="text-xs text-[var(--color-text-muted)]">{activityText}</span>
          )}
          {day.sleepHours != null && (
            <span className="text-xs text-[var(--color-text-muted)]">🌙 {day.sleepHours} ชม.</span>
          )}
          {day.readiness != null && (
            <span className="text-xs text-[var(--color-text-muted)]">ความพร้อม {day.readiness}</span>
          )}
          {nutritionText && (
            <span className="text-xs text-[var(--color-text-muted)]">{nutritionText}</span>
          )}
          {day.painStatus === "active" && day.painLevel != null && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">เจ็บ {day.painLevel}/10</span>
          )}
          {day.painStatus === "resolved" && (
            <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">หายเจ็บแล้ว</span>
          )}
        </div>
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-2 border-t border-[var(--color-border-soft)] pt-2 text-[11px] text-[var(--color-text-muted)]" data-testid="day-slot-details">
        <DaySlotDetail label="กิจกรรม" value={activityText ?? "ยังไม่มี"} />
        <DaySlotDetail label="นอน" value={day.sleepHours != null ? `${day.sleepHours} ชม.` : "ยังไม่มี"} />
        <DaySlotDetail label="ความพร้อม" value={day.readiness != null ? `${day.readiness}` : "ยังไม่มี"} />
        <DaySlotDetail label="อาหาร" value={nutritionText ?? (day.mealCount > 0 ? `${day.mealCount} มื้อ` : "ยังไม่มี")} />
        {day.bodyWeightKg != null && <DaySlotDetail label="น้ำหนัก" value={`${day.bodyWeightKg} kg`} />}
        {day.painStatus && (
          <DaySlotDetail
            label="อาการเจ็บ"
            value={day.painStatus === "resolved" ? "หายเจ็บแล้ว" : day.painLevel != null ? `${day.painLevel}/10` : "มีบันทึก"}
          />
        )}
      </div>
    </details>
  );
}

function DaySlotDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-2.5 py-2">
      <p className="text-[10px] font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 font-bold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function formatDayActivitySummary(day: import("@/lib/reportSummary").DailyReportItem): string | null {
  if (day.runKm != null && day.runKm > 0) return `🏃 ${day.runKm} กม.`;
  if (day.strengthMins != null && day.strengthMins > 0) return `💪 เวท ${day.strengthMins} นาที`;
  if (day.walkMins != null && day.walkMins > 0) return `เดิน ${day.walkMins} นาที`;
  if (day.hasRestWorkout) return "Recovery";
  return null;
}

function formatDayNutritionSummary(day: import("@/lib/reportSummary").DailyReportItem): string | null {
  if (day.mealCount <= 0) return null;
  const parts = [`อาหาร ${day.mealCount} มื้อ`];
  if (day.proteinG != null) parts.push(`โปรตีน ${day.proteinG}g`);
  if (day.carbsG != null) parts.push(`คาร์บ ${day.carbsG}g`);
  return parts.join(" · ");
}

function MonthWeekBlock({
  week,
  onSelectWeek,
  disabled = false,
}: {
  week: WeeklyReportSummary;
  onSelectWeek: (p: CalendarPeriod) => void;
  disabled?: boolean;
}) {
  const hasData = week.days.some((d) => d.hasData);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onSelectWeek({
          startDateKey: week.startDateKey,
          endDateKey: week.endDateKey,
          label: week.label,
          shortLabel: week.label,
        })
      }
      className="w-full rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)] p-3 text-left disabled:cursor-not-allowed disabled:opacity-55"
      data-testid="month-week-block"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[var(--foreground)]">{week.label}</span>
        <span className="text-[10px] font-bold text-[var(--primary)]">ดูสัปดาห์ ›</span>
      </div>
      {hasData ? (
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-[var(--color-text-muted)]">
          {week.totals.runDistanceKm > 0 && <span>🏃 {week.totals.runDistanceKm} กม.</span>}
          {week.totals.workoutDays > 0 && <span>ซ้อม {week.totals.workoutDays} วัน</span>}
          {week.averages.sleepHours != null && <span>นอนเฉลี่ย {week.averages.sleepHours} ชม.</span>}
          {week.averages.readiness != null && <span>Readiness {week.averages.readiness}</span>}
          {week.pain.activePainDays > 0 && <span>เจ็บ {week.pain.activePainDays} วัน</span>}
        </div>
      ) : (
        <p className="mt-1 text-[10px] text-[var(--color-text-muted)]">ยังไม่มีข้อมูล</p>
      )}
    </button>
  );
}

// ─── Rolling 7-day components ─────────────────────────────────────────────────

function RollingSevenDayInsight({
  dashboard,
  proteinTarget,
  items,
  cutoff,
  review,
}: {
  dashboard: Dashboard;
  proteinTarget: number;
  items: LocalHistoryItem[];
  cutoff: string;
  review: WeeklyReview | null;
}) {
  const preview = buildRollingInsightPreview(dashboard, review);

  return (
    <details className="group rounded-3xl border border-[var(--color-border-soft)] bg-[var(--surface)] p-4 shadow-sm" data-testid="rolling-insight">
      <summary className="list-none cursor-pointer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--label-color)]">Insight 7 วันล่าสุด</p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{preview}</p>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[10px] font-bold text-[var(--primary)]">
            <span className="group-open:hidden">ดูรายละเอียด 7 วันล่าสุด</span>
            <span className="hidden group-open:inline">ซ่อน</span>
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-3 border-t border-[var(--color-border-soft)] pt-4">
        {/* Weekly coach trend insight */}
        {review && (() => {
          const insight = buildWeeklyCoachTrendInsight({
            avgRecoveryScore: review.avgRecoveryScore,
            avgSleepScore: review.avgSleepScore,
            avgSleepHours: review.avgSleepHours,
            avgLoadScore: review.avgLoadScore,
            loadLevel: review.loadLevel,
            sleepDebtLevel: review.sleepDebtLevel,
            activePainDays: review.activePainDays,
            runningKmTotal: review.runningKmTotal,
            runCount: review.runCount,
            sleepNights: review.sleepNights,
          });
          if (!insight) return null;
          return (
            <div className="rounded-2xl border border-[var(--border-warm)] bg-[var(--primary-soft)] px-4 py-3" data-testid="weekly-coach-insight">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--primary-strong)]">โค้ชวิเคราะห์สัปดาห์นี้</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--foreground)]">{insight}</p>
            </div>
          );
        })()}
        {review && <WeeklyReviewCard review={review} />}
        <WeeklyDashboard dashboard={dashboard} proteinTarget={proteinTarget} items={items} cutoff={cutoff} />
      </div>
    </details>
  );
}

function FullHistoryDetails({
  activeFilter,
  onFilterChange,
  filteredDays,
  visibleDays,
  olderDays,
  showOlderDays,
  onToggleOlderDays,
  items,
  raceResultsByDate,
  proteinTarget,
  onDeleteItem,
  onEditItem,
  onDeleteRaceResult,
  deletingKey,
  yesterdayDateKey,
}: {
  activeFilter: ReportFilter;
  onFilterChange: (filter: ReportFilter) => void;
  filteredDays: DayGroup[];
  visibleDays: DayGroup[];
  olderDays: DayGroup[];
  showOlderDays: boolean;
  onToggleOlderDays: () => void;
  items: LocalHistoryItem[];
  raceResultsByDate: Map<string, RaceResult[]>;
  proteinTarget: number;
  onDeleteItem: (item: LocalHistoryItem) => void;
  onEditItem: (item: LocalHistoryItem) => void;
  onDeleteRaceResult: (result: RaceResult) => void;
  deletingKey: string | null;
  todayDateKey: string;
  yesterdayDateKey: string;
}) {
  return (
    <details className="group rounded-3xl border border-[var(--color-border-soft)] bg-[var(--surface)] p-4 shadow-sm" data-testid="full-history-details">
      <summary className="list-none cursor-pointer">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">รายการทั้งหมด</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">ดูบันทึกทั้งหมดแบบละเอียด</p>
          </div>
          <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[10px] font-bold text-[var(--primary)]">
            <span className="group-open:hidden">เปิดดู</span>
            <span className="hidden group-open:inline">ซ่อน</span>
          </span>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-[var(--color-border-soft)] pt-4">
        <FilterPills activeFilter={activeFilter} onFilterChange={onFilterChange} />

        {activeFilter === "pain" && (
          <PainHistoryCompactList items={items} onDelete={onDeleteItem} deletingKey={deletingKey} />
        )}

        {filteredDays.length === 0 ? (
          <section className="card p-5 text-center text-sm text-slate-500">ไม่พบรายการที่ตรงกับตัวกรอง</section>
        ) : (
          <>
            {visibleDays.map((day) => (
              <DayCard
                key={day.date}
                day={day}
                raceResults={raceResultsByDate.get(day.date) ?? []}
                proteinTarget={proteinTarget}
                onDeleteItem={onDeleteItem}
                onEditItem={onEditItem}
                onDeleteRaceResult={onDeleteRaceResult}
                deletingKey={deletingKey}
                initialExpanded={day.date >= yesterdayDateKey}
              />
            ))}
            {olderDays.length > 0 && (
              <button
                type="button"
                onClick={onToggleOlderDays}
                className="w-full rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm font-bold text-slate-600"
              >
                {showOlderDays ? "ซ่อนรายการก่อนหน้า" : `ดูรายการก่อนหน้า (${olderDays.length} วัน)`}
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}

function FilterPills({
  activeFilter,
  onFilterChange,
}: {
  activeFilter: ReportFilter;
  onFilterChange: (filter: ReportFilter) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {(
        [
          { id: "all", label: "ทั้งหมด" },
          { id: "run", label: "วิ่ง" },
          { id: "meal", label: "อาหาร" },
          { id: "strength", label: "เวท" },
          { id: "pain", label: "เจ็บ" },
          { id: "health", label: "สุขภาพ" },
        ] as const
      ).map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onFilterChange(f.id)}
          className={`min-h-[36px] whitespace-nowrap rounded-[var(--radius-pill)] border px-4 py-2 text-xs font-semibold transition-all ${activeFilter === f.id ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border-warm)] bg-[var(--surface)] text-[var(--color-text-muted)] hover:bg-[var(--surface-muted)]"}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function buildRollingInsightPreview(dashboard: Dashboard, review: WeeklyReview | null): string {
  const parts = [
    dashboard.runKm > 0 ? `Load ${formatDistanceKm(dashboard.runKm)}` : null,
    review?.avgRecoveryScore != null ? `Recovery เฉลี่ย ${review.avgRecoveryScore}` : null,
    dashboard.avgSleepHours != null ? `นอนเฉลี่ย ${formatSleepAverageHours(dashboard.avgSleepHours)}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "ยังไม่มีข้อมูล 7 วันที่พอสำหรับสรุปแนวโน้ม";
}

function WeeklyDashboard({ dashboard, proteinTarget, items, cutoff }: { dashboard: Dashboard; proteinTarget: number; items: LocalHistoryItem[]; cutoff: string }) {
  const meals7d = items
    .filter((i) => i.type === "meal")
    .filter((i) => getHistoryItemDateKey(i) >= cutoff);
  const assessmentText = getDayMealsAssessmentText(meals7d);

  return (
    <details className="group cursor-pointer rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
      <summary className="list-none flex items-center justify-between font-bold text-[var(--foreground)]">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--label-color)]">METRICS 7 วัน</span>
          <span className="text-sm font-bold text-[var(--foreground)]">ตัวเลขสรุป 7 วันล่าสุด</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[var(--primary)] font-bold shrink-0">
          <span className="group-open:hidden">ดูรายละเอียด</span>
          <span className="hidden group-open:inline">ซ่อน</span>
          <span className="transition-transform group-open:rotate-180">▾</span>
        </div>
      </summary>

      <div className="mt-3 pt-3 border-t border-slate-100/60 cursor-default space-y-4">
        <div>
          <p className="text-xs text-slate-400">สรุป metrics หลักจาก Report</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 font-medium bg-slate-50 p-3 rounded-2xl border border-slate-100">{dashboard.coachNote}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DashboardMetric label="Run volume" value={dashboard.runKm > 0 ? formatDistanceKm(dashboard.runKm) : "-"} sub={`${dashboard.runSessions} sessions`} />
          <DashboardMetric label="Longest run" value={dashboard.longestRunKm != null ? formatDistanceKm(dashboard.longestRunKm) : "-"} sub="last 7 days" />
          <DashboardMetric label="Readiness เฉลี่ย" value={dashboard.avgReadiness != null ? formatScore(dashboard.avgReadiness) : "-"} sub="จากวันที่มีข้อมูล" />
          <DashboardMetric label="Sleep avg 7 วัน" value={formatSleepAverageHours(dashboard.avgSleepHours)} sub={sleepAverageSubtext(dashboard.sleepCount)} />
          <DashboardMetric label="Meal kcal avg" value={dashboard.avgMealCalories != null ? formatCalories(dashboard.avgMealCalories) : "-"} sub={assessmentText} />
          <DashboardMetric label="Protein avg / day" value={dashboard.avgMealProtein != null ? formatMacro(dashboard.avgMealProtein) : "-"} sub={`target ${proteinTarget} g`} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DashboardMetric label="Weight" value={dashboard.latestBody?.weightKg != null ? `${formatDecimal(dashboard.latestBody.weightKg)} kg` : "-"} compact />
          <DashboardMetric label="Body fat" value={formatPercent(dashboard.latestBody?.bodyFatPct)} compact />
          <DashboardMetric label="Muscle" value={dashboard.latestBody?.muscleKg != null ? `${formatDecimal(dashboard.latestBody.muscleKg)} kg` : "-"} compact />
        </div>
      </div>
    </details>
  );
}

function DashboardMetric({ label, value, sub, compact = false }: { label: string; value: string; sub?: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`${compact ? "text-base" : "text-xl"} mt-1 font-bold text-[var(--foreground)]`}>{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

function parseNutritionValue(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === "string") {
    const cleaned = val.trim();
    if (cleaned === "") return null;
    const match = cleaned.match(/^[+-]?\d+(?:\.\d+)?/);
    if (match) {
      const num = Number(match[0]);
      return Number.isFinite(num) ? num : null;
    }
  }
  return null;
}



function extractRawNutrition(item: LocalHistoryItem) {
  const d = extractMealData(item);
  const dAny = d as unknown as Record<string, unknown>;
  const n = (d.nutrition && typeof d.nutrition === "object" ? d.nutrition : {}) as Record<string, unknown>;
  
  const rawCalories = n.caloriesKcal ?? n.calories ?? dAny.caloriesKcal ?? dAny.calories ?? dAny.kcal;
  const rawProtein = n.proteinG ?? n.protein ?? dAny.proteinG ?? dAny.protein;
  const rawCarbs = n.carbsG ?? n.carbs ?? dAny.carbsG ?? dAny.carbs;
  const rawFat = n.fatG ?? n.fat ?? dAny.fatG ?? dAny.fat;
  
  return {
    calories: parseNutritionValue(rawCalories),
    protein: parseNutritionValue(rawProtein),
    carbs: parseNutritionValue(rawCarbs),
    fat: parseNutritionValue(rawFat),
  };
}

function getGroupSubtotalLabel(meals: LocalHistoryItem[]): string | null {
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  
  let hasCalories = false;
  let hasProtein = false;
  let hasCarbs = false;
  let hasFat = false;
  
  for (const meal of meals) {
    const raw = extractRawNutrition(meal);
    if (raw.calories !== null) {
      totalCalories += raw.calories;
      hasCalories = true;
    }
    if (raw.protein !== null) {
      totalProtein += raw.protein;
      hasProtein = true;
    }
    if (raw.carbs !== null) {
      totalCarbs += raw.carbs;
      hasCarbs = true;
    }
    if (raw.fat !== null) {
      totalFat += raw.fat;
      hasFat = true;
    }
  }
  
  if (!hasCalories && !hasProtein && !hasCarbs && !hasFat) {
    return null;
  }
  
  const parts: string[] = [];
  if (hasCalories) {
    parts.push(`${Math.round(totalCalories)} kcal`);
  }
  if (hasProtein) {
    parts.push(`โปรตีน ${Math.round(totalProtein)}g`);
  }
  if (hasCarbs) {
    parts.push(`คาร์บ ${Math.round(totalCarbs)}g`);
  }
  if (hasFat) {
    parts.push(`ไขมัน ${Math.round(totalFat)}g`);
  }
  
  return parts.join(" · ");
}

function getDayMealsAssessmentText(meals: LocalHistoryItem[]): string {
  if (!meals.length) return "ประเมินจากข้อมูลอาหาร";
  
  const sources = new Set<string>();
  for (const item of meals) {
    const d = extractMealData(item);
    const info = getMealSourceInfo(d);
    sources.add(info.sourceType);
  }

  if (sources.size === 1) {
    if (sources.has("image")) return "ประเมินจากรูปอาหาร";
    if (sources.has("manual")) return "ประเมินจากข้อมูลที่บันทึก";
  }
  return "ประเมินจากข้อมูลอาหาร";
}

// ─── Day card ─────────────────────────────────────────────────────────────────

function DayCard({
  day,
  raceResults,
  proteinTarget,
  onDeleteItem,
  onEditItem,
  onDeleteRaceResult,
  deletingKey,
  initialExpanded = false,
}: {
  day: DayGroup;
  raceResults: RaceResult[];
  proteinTarget: number;
  onDeleteItem: (item: LocalHistoryItem) => void;
  onEditItem: (item: LocalHistoryItem) => void;
  onDeleteRaceResult: (result: RaceResult) => void;
  deletingKey: string | null;
  initialExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initialExpanded);

  const sleeps = day.items.filter((i) => i.type === "sleep");
  const dedupedSleeps = dedupeSleepItems(sleeps);
  const workouts = day.items.filter((i) => i.type === "workout");
  const meals = day.items.filter((i) => i.type === "meal");
  const MEAL_GROUPS = [
    { key: "breakfast", label: "มื้อเช้า", icon: "🍳" },
    { key: "lunch", label: "มื้อกลางวัน", icon: "🍱" },
    { key: "dinner", label: "มื้อเย็น", icon: "🌙" },
    { key: "snack", label: "ของว่าง", icon: "🍌" },
    { key: "other", label: "อื่น ๆ", icon: "🍽️" },
  ] as const;
  const groupedMeals = MEAL_GROUPS.map((group) => {
    const groupMeals = meals.filter((meal) => normalizeMealSlot(meal, meal.recordedAt || meal.createdAt) === group.key);
    return {
      ...group,
      meals: groupMeals,
    };
  })
  .filter((group) => group.meals.length > 0)
  .sort((a, b) => getMealSlotOrder(a.key) - getMealSlotOrder(b.key));
  const summaries = day.items.filter((i) => i.type === "summary");
  const bodies = day.items.filter((i) => i.type === "body");
  const healthChecks = day.items.filter((i) => i.type === "health_check");
  // Body records can vary by time of day; Report shows the latest only to reduce noise.
  const latestBodies = bodies.slice(0, 1);
  const hasMultipleBodies = bodies.length > 1;
  const pains = day.items.filter((i) => i.type === "pain");
  const strengths = day.items.filter((i) => i.type === "strength");
  const painMetaById = buildPainDisplayMeta(pains);
  const latestSleepDuration = getLatestSleepDuration(dedupedSleeps);

  const readiness = getReadiness(dedupedSleeps);
  const totalKm = getTotalKm(workouts);
  const runKm = getTotalKm(workouts.filter(isRun));
  const mealCount = meals.length;
  const mealNutrition = getMealNutrition(meals);

  return (
    <section
      data-testid="report-day"
      data-date-key={day.date}
      className={`card overflow-hidden border transition-colors ${expanded ? "border-[#d9e8df] bg-[#fbfdfb] shadow-sm" : "border-transparent"}`}
    >
      <button
        data-testid="report-day-toggle"
        type="button"
        className="w-full cursor-pointer p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#b9d9c0] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">{day.label}</p>
            <div className="mt-2">
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const badgeElements: React.ReactNode[] = [];
                  if (dedupedSleeps.length > 0) {
                    badgeElements.push(<Badge icon="🌙" label={latestSleepDuration ? formatSleepBadgeDuration(latestSleepDuration) : "นอน"} key="sleep" />);
                  }
                  if (workouts.some((w) => isRun(w))) {
                    badgeElements.push(<Badge icon="🏃" label={runKm ? formatDistanceKm(runKm) : "วิ่ง"} color="green" key="run" />);
                  }
                  if (raceResults.length > 0) {
                    badgeElements.push(<Badge icon="🏁" label="Race Result" color="green" key="race" />);
                  }
                  if (strengths.length > 0 || workouts.some((w) => !isRun(w) && !isWalk(w) && (w.data as WorkoutAnalysis)?.extracted?.workoutKind === "strength")) {
                    const firstStrength = strengths[0];
                    const strengthWorkout = workouts.find((w) => !isRun(w) && !isWalk(w) && (w.data as WorkoutAnalysis)?.extracted?.workoutKind === "strength");
                    const durationMins = firstStrength
                      ? ((firstStrength.data as StrengthLog)?.durationMin ?? null)
                      : parseDurationMins((strengthWorkout?.data as WorkoutAnalysis)?.extracted?.duration);
                    badgeElements.push(<Badge icon="🏋️" label={durationMins ? `เวท ${durationMins} นาที` : "เวท"} color="blue" key="strength" />);
                  }
                  if (pains.length > 0) {
                    badgeElements.push(<Badge icon="🩹" label={isResolvedPainItem(pains[0]) ? "หายแล้ว" : `เจ็บ ${getPainLevel(pains[0])}/10`} color={isResolvedPainItem(pains[0]) ? "green" : "red"} key="pain" />);
                  }
                  return badgeElements.slice(0, 4);
                })()}
              </div>
            </div>
          </div>

          <div className="shrink-0 text-right">
            {readiness !== null && (
              <div>
                <p className={`text-2xl font-bold ${readinessColor(readiness)}`}>{readiness}</p>
                <p className="text-xs text-slate-400">Readiness</p>
              </div>
            )}
            {readiness === null && totalKm !== null && (
              <div>
                <p className="text-2xl font-bold text-[var(--recovery-blue)]">{formatDecimal(totalKm)}</p>
                <p className="text-xs text-slate-400">km</p>
              </div>
            )}
            {readiness === null && totalKm === null && mealCount > 0 && (
              <p className="text-sm text-slate-500">{mealCount} มื้อ</p>
            )}
            <p className="mt-1 text-[11px] font-semibold text-[var(--label-color)]">
              {expanded ? "ย่อ" : "ดูรายละเอียด"}
            </p>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-[#d9e8df]/70 space-y-3 px-4 pb-4 pt-3">
          {dedupedSleeps.map((item) => <SleepDetail key={item.id} item={item} onDelete={onDeleteItem} deleting={deletingKey === item.id} />)}
          {pains.map((item) => <PainDetail key={item.id} item={item} meta={painMetaById.get(item.id)} onDelete={onDeleteItem} deleting={deletingKey === item.id} />)}
          {strengths.map((item) => <StrengthDetail key={item.id} item={item} onDelete={onDeleteItem} deleting={deletingKey === item.id} />)}
          {raceResults.map((result) => <RaceResultDetail key={result.id ?? `${result.raceDate}-${result.raceName}`} result={result} onDelete={onDeleteRaceResult} deleting={Boolean(result.id && deletingKey === `race:${result.id}`)} />)}
          {workouts.map((item) => <WorkoutDetail key={item.id} item={item} onDelete={onDeleteItem} deleting={deletingKey === item.id} />)}
          {mealCount > 0 && <MealNutritionDaySummary summary={mealNutrition} mealCount={mealCount} proteinTarget={proteinTarget} meals={meals} />}
          {groupedMeals.map((group, idx) => {
            const subtotal = getGroupSubtotalLabel(group.meals);
            return (
              <div key={group.key} className={`space-y-2 ${idx > 0 ? "border-t border-slate-100/70 pt-3 mt-3" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 px-1">
                  <h4 className="text-sm font-bold text-slate-700">
                    {group.icon} {group.label}
                  </h4>
                  {subtotal && (
                    <span className="text-[11px] font-medium text-slate-400">
                      {subtotal}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {group.meals.map((item) => (
                    <MealDetail key={item.id} item={item} onDelete={onDeleteItem} onEdit={onEditItem} deleting={deletingKey === item.id} />
                  ))}
                </div>
              </div>
            );
          })}
          {healthChecks.map((item) => <HealthCheckDetail key={item.id} item={item} onDelete={onDeleteItem} deleting={deletingKey === item.id} />)}
          {latestBodies.map((item) => <BodyDetail key={item.id} item={item} onDelete={onDeleteItem} deleting={deletingKey === item.id} />)}
          {hasMultipleBodies && (
            <p className="px-1 text-xs text-slate-400">มีบันทึกร่างกายหลายรายการ แสดงรายการล่าสุด</p>
          )}
          {summaries.length > 0 && (dedupedSleeps.length + workouts.length + meals.length + bodies.length + pains.length + strengths.length + healthChecks.length === 0) &&
            summaries.map((item) => <SummaryDetail key={item.id} item={item} onDelete={onDeleteItem} deleting={deletingKey === item.id} />)}
          {summaries.length > 0 && (dedupedSleeps.length + workouts.length + meals.length + bodies.length + pains.length + strengths.length + healthChecks.length > 0) && (
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500 mb-1">สรุปท้ายวัน ({summaries.length})</p>
              {summaries.slice(0, 2).map((item) => (
                <div key={item.id} className="mt-2 rounded-xl bg-white/80 p-3">
                  <p className="text-sm text-slate-700 leading-5">
                    {truncate(getSummaryText(item), 120)}
                  </p>
                  <DeleteRecordButton onDelete={() => onDeleteItem(item)} loading={deletingKey === item.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RaceResultDetail({ result, onDelete, deleting }: { result: RaceResult; onDelete: (result: RaceResult) => void; deleting: boolean }) {
  return (
    <div className="rounded-2xl bg-[var(--primary-soft)] p-4">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--color-success)]">🏁 Race Day</p>
      <p className="font-bold text-[var(--foreground)]">{result.raceName || "Race Result"}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Time" value={result.actualTime ?? "-"} />
        <Metric label="Pace" value={result.actualPace ? `${result.actualPace}/km` : "-"} />
        <Metric label="Result" value={raceResultLabel(result.goalResult)} />
      </div>
      {result.coachSummary ? <p className="mt-3 text-sm leading-6 text-slate-700">{truncate(result.coachSummary, 160)}</p> : null}
      <DeleteRecordButton onDelete={() => onDelete(result)} loading={deleting} />
    </div>
  );
}

// ─── Detail panels ────────────────────────────────────────────────────────────

function SleepDetail({ item, onDelete, deleting }: { item: LocalHistoryItem; onDelete: (item: LocalHistoryItem) => void; deleting: boolean }) {
  const d = item.data as SleepAnalysis;
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};
  const merged = item as { mergedFromDuplicates?: boolean; duplicateCount?: number };

  return (
    <div className="rounded-2xl bg-[var(--primary-soft)] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--recovery-blue)] mb-2">🌙 การนอน</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {coach.readinessScore != null && (
          <Metric label="Readiness" value={formatScore(coach.readinessScore)} sub={coach.readinessLabel} />
        )}
        {ext.sleepScore != null && <Metric label="Sleep score" value={formatScore(ext.sleepScore)} />}
        {getSleepDurationRaw(item) && <Metric label="นอน" value={formatSleepDuration(getSleepDurationRaw(item))} />}
        {ext.hrv != null && <Metric label="HRV" value={formatScore(ext.hrv)} sub="ms" />}
        {ext.restingHR != null && <Metric label="Resting HR" value={formatScore(ext.restingHR)} sub="bpm" />}
      </div>
      {coach.aiSummary && <p className="text-sm leading-6 text-slate-700">{polishSleepInsightText(coach.aiSummary)}</p>}
      {coach.todayRecommendation && (
        <p className="mt-2 text-sm font-bold text-[var(--foreground)]">→ {polishSleepInsightText(coach.todayRecommendation)}</p>
      )}
      {coach.readinessScore != null && (
        <p className="mt-2 text-[11px] text-slate-400 leading-normal">
          * Readiness เป็นคะแนนความพร้อมจากข้อมูล recovery ของวันนั้น ไม่ใช่คะแนนสรุปทั้งวัน
        </p>
      )}
      {merged.mergedFromDuplicates && (
        <p className="mt-2 text-xs text-slate-400">รวมข้อมูลจากหลายบันทึก{merged.duplicateCount ? ` (${merged.duplicateCount})` : ""}</p>
      )}
      <DeleteRecordButton onDelete={() => onDelete(item)} loading={deleting} />
    </div>
  );
}

function WorkoutDetail({ item, onDelete, deleting }: { item: LocalHistoryItem; onDelete: (item: LocalHistoryItem) => void; deleting: boolean }) {
  const d = item.data as WorkoutAnalysis;
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};
  const icon =
    ext.workoutKind === "outdoor_run" || ext.workoutKind === "treadmill" ? "🏃"
    : ext.workoutKind === "walk" ? "🚶"
    : ext.workoutKind === "cycling" ? "🚴"
    : "💪";
  const kindLabel =
    ext.workoutKind === "outdoor_run" ? "วิ่งนอก"
    : ext.workoutKind === "treadmill" ? "วิ่งเครื่อง"
    : ext.workoutKind === "walk" ? "เดิน"
    : ext.workoutKind === "cycling" ? "ปั่นจักรยาน"
    : ext.workoutKind === "strength" ? "เวท"
    : "ออกกำลังกาย";

  const hasAnyMetric = ext.distanceKm != null || ext.duration || ext.avgHR != null || ext.calories != null;
  const isStrength = ext.workoutKind === "strength";

  const muscleGroupsText = isStrength && ext.muscleGroups && ext.muscleGroups.length > 0
    ? ext.muscleGroups.join(" · ")
    : null;

  const exercisesText = isStrength && ext.exercises && ext.exercises.length > 0
    ? ext.exercises.slice(0, 4).map((ex) => ex.name).join(", ") + (ext.exercises.length > 4 ? ` +${ext.exercises.length - 4}` : "")
    : null;

  return (
    <div data-testid="report-workout-card" className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--recovery-blue)] mb-2">{icon} {kindLabel}</p>
      {hasAnyMetric && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {ext.distanceKm != null && <Metric label="ระยะทาง" value={formatDistanceKm(ext.distanceKm)} />}
          {ext.duration && <Metric label="เวลา" value={formatDuration(ext.duration)} />}
          {ext.avgPace && ext.avgPace !== ":" && <Metric label="Pace" value={formatPace(ext.avgPace)} sub="/km" />}
          {ext.avgHR != null && <Metric label="Avg HR" value={formatScore(ext.avgHR)} sub="bpm" />}
          {ext.maxHR != null && <Metric label="Max HR" value={formatScore(ext.maxHR)} sub="bpm" />}
          {ext.calories != null && <Metric label="Calories" value={formatScore(ext.calories)} sub="Cal" />}
          {ext.sweatLossMl != null && <Metric label="เหงื่อ" value={formatScore(ext.sweatLossMl)} sub="ml" />}
        </div>
      )}
      {/* Strength-specific info */}
      {muscleGroupsText && (
        <p className="text-xs text-slate-500 mb-1">
          <span className="font-semibold">กล้ามเนื้อหลัก:</span> {muscleGroupsText}
        </p>
      )}
      {exercisesText && (
        <p className="text-xs text-slate-500 mb-2">
          <span className="font-semibold">ท่า:</span> {exercisesText}
        </p>
      )}
      {coach.workoutSummary && (
        <p className="text-sm leading-6 text-slate-700">{truncate(formatSummaryText(coach.workoutSummary), 160)}</p>
      )}
      <DeleteRecordButton onDelete={() => onDelete(item)} loading={deleting} />
    </div>
  );
}

function MealDetail({
  item,
  onDelete,
  onEdit,
  deleting,
}: {
  item: LocalHistoryItem;
  onDelete: (item: LocalHistoryItem) => void;
  onEdit: (item: LocalHistoryItem) => void;
  deleting: boolean;
}) {
  const d = extractMealData(item);
  const n = normalizeMealNutrition(d as unknown as Record<string, unknown>);
  const isQuickProtein = isQuickProteinMeal(item.data);
  const foodNames = isQuickProtein
    ? null
    : d.detectedFoods?.map((food) => food.name).filter(Boolean).join(", ") || d?.extracted?.detectedFood || "";
  const note = isQuickProtein
    ? null
    : sanitizeAIThaiText(d.trainingFit?.coachNote ?? d.coachNote ?? d?.coach?.aiSummary ?? d?.coach?.suggestion ?? "");
  const sourceInfo = getMealSourceInfo(item.data);

  const normalizedSlot = normalizeMealSlot(item, item.recordedAt || item.createdAt);
  const icon = getMealSlotIcon(normalizedSlot);
  const label = isQuickProtein ? "Quick log" : getMealSlotLabel(normalizedSlot);

  return (
    <div data-testid="report-meal-card" className="rounded-2xl bg-orange-50 p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-600">{icon} {label}</p>
        {sourceInfo.badgeText && (
          <span className="rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-700">{sourceInfo.badgeText}</span>
        )}
      </div>
      {isQuickProtein ? (
        <p className="text-sm font-bold text-[var(--foreground)] mb-2">{sourceInfo.assessmentText}</p>
      ) : foodNames ? (
        <p className="text-sm font-bold text-[var(--foreground)] mb-2">{truncate(foodNames, 100)}</p>
      ) : null}
      {isQuickProtein ? (
        n.proteinG != null && (
          <div className="mb-2">
            <Metric label="Protein" value={formatMacro(n.proteinG)} />
          </div>
        )
      ) : (
        <div className="grid grid-cols-4 gap-2 mb-2">
          <Metric label="kcal" value={formatCalories(n.caloriesKcal)} />
          <Metric label="Protein" value={formatMacro(n.proteinG)} />
          <Metric label="Carbs" value={formatMacro(n.carbsG)} />
          <Metric label="Fat" value={formatMacro(n.fatG)} />
        </div>
      )}
      {!isQuickProtein && (
        <p className="mb-2 text-xs text-orange-700">{sourceInfo.assessmentText}</p>
      )}
      {note && (
        <p className="text-sm leading-6 text-slate-700">{truncate(note, 140)}</p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onEdit(item)}
          className="rounded-full border border-orange-200 bg-white/80 px-4 py-1.5 text-xs font-bold text-orange-600 transition hover:bg-orange-100"
        >
          แก้ไข
        </button>
        <LoadingButton
          type="button"
          loading={deleting}
          loadingText="กำลังลบ..."
          onClick={() => onDelete(item)}
          className="rounded-full border border-red-100 bg-white/80 px-3 py-1.5 text-xs font-bold text-red-500 transition hover:bg-red-50"
        >
          ลบรายการ
        </LoadingButton>
      </div>
    </div>
  );
}

function formatLabWarning(key: string, lab: LabValue): string {
  const label = lab.label || key;
  const status = lab.status;
  const valStr = lab.value != null ? `${lab.value} ${lab.unit || ""}`.trim() : "";

  if (key === "ldl" || key === "totalCholesterol" || key === "triglyceride") {
    if (status === "high" || status === "borderline") {
      return `${label} (${valStr}) - สูงกว่าช่วงอ้างอิงเล็กน้อย/ควรระวัง`;
    }
  }
  if (key === "sgptAlt" || key === "sgotAst" || key === "alp") {
    if (status === "high" || status === "borderline") {
      return `${label} (${valStr}) - สูงกว่าช่วงอ้างอิง ควรเลือกมื้อเบากว่าและติดตามกับแพทย์หากค่านี้ผิดปกติต่อเนื่อง`;
    }
  }

  if (status === "high") {
    return `${label} (${valStr}) - สูงกว่าช่วงอ้างอิง/ควรระวัง`;
  }
  if (status === "low") {
    return `${label} (${valStr}) - ต่ำกว่าช่วงอ้างอิง/ควรระวัง`;
  }
  if (status === "borderline") {
    return `${label} (${valStr}) - สูงกว่าช่วงอ้างอิงเล็กน้อย/ควรระวัง`;
  }
  return `${label} (${valStr}) - ควรระวัง`;
}

function HealthCheckDetail({ item, onDelete, deleting }: { item: LocalHistoryItem; onDelete: (item: LocalHistoryItem) => void; deleting: boolean }) {
  const d = item.data as HealthCheckAnalysis;
  const allLabs = getHealthLabs(d);

  const warningLabs = allLabs.filter(([key, lab]) => {
    if (key === "hdl") return lab.status === "low";
    return lab.status === "high" || lab.status === "low" || lab.status === "borderline";
  });

  const normalLabs = allLabs.filter(([key, lab]) => {
    if (key === "hdl") return lab.status === "normal" || lab.status === "high";
    return lab.status === "normal";
  });

  const hasUnclearFields = d.unclearFields && d.unclearFields.length > 0;
  const isLowConfidence = d.confidence === "low" || hasUnclearFields;
  const isMissingLabs = !d.labs?.hba1c || !d.labs?.egfr;

  return (
    <div className="rounded-2xl bg-blue-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-[var(--foreground)] text-base">ผลตรวจสุขภาพล่าสุด</h3>
          <p className="mt-0.5 text-xs text-[var(--recovery-blue)] font-semibold">ใช้เพื่อช่วยปรับคำแนะนำอาหารและไลฟ์สไตล์</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{d.checkupDate ?? formatDayLabel(bangkokDateKey(item.createdAt))}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--recovery-blue)]">{d.confidence ?? "low"}</span>
      </div>

      <div className="mt-4 space-y-3">
        {/* ควรระวัง */}
        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-100">
          <p className="text-xs font-bold text-amber-800">⚠️ ควรระวัง</p>
          {warningLabs.length > 0 ? (
            <ul className="mt-1.5 list-disc pl-4 space-y-1 text-sm text-[var(--foreground)]">
              {warningLabs.map(([key, lab]) => (
                <li key={key}>{formatLabWarning(key, lab)}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-slate-600 font-medium">ยังไม่พบค่าที่ต้องระวังเด่น ๆ จากข้อมูลที่อ่านได้</p>
          )}
        </div>

        {/* อยู่ในเกณฑ์ */}
        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-100">
          <p className="text-xs font-bold text-emerald-800">✅ อยู่ในเกณฑ์</p>
          {normalLabs.length > 0 ? (
            <p className="mt-1.5 text-sm text-slate-700 leading-relaxed font-medium">
              {normalLabs.map(([key, lab]) => {
                const categoryNames: Record<string, string> = {
                  fbs: "น้ำตาล (FBS)",
                  hba1c: "น้ำตาลสะสม (HbA1c)",
                  totalCholesterol: "ไขมันรวม",
                  triglyceride: "ไตรกลีเซอไรด์",
                  ldl: "ไขมันตัวร้าย (LDL)",
                  hdl: "ไขมันตัวดี (HDL)",
                  uricAcid: "กรดยูริค",
                  bun: "ของเสียในไต (BUN)",
                  creatinine: "การทำงานของไต (Creatinine)",
                  egfr: "อัตราการกรองของไต (eGFR)",
                  sgotAst: "เอนไซม์ตับ (SGOT)",
                  sgptAlt: "เอนไซม์ตับ (SGPT)",
                  alp: "เอนไซม์ตับ (ALP)",
                };
                return categoryNames[key] || lab.label;
              }).join(" · ")}
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500 italic">ไม่มีข้อมูลค่าอ้างอิงที่เป็นปกติ</p>
          )}
        </div>

        {/* โภชนาการที่เหมาะ */}
        <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-100">
          <p className="text-xs font-bold text-[var(--recovery-blue)]">🥗 โภชนาการที่เหมาะ</p>
          {(d.foodGuidance?.prefer?.length || d.foodGuidance?.limit?.length) ? (
            <ul className="mt-1.5 list-disc pl-4 space-y-1 text-sm text-slate-700 font-medium">
              {d.foodGuidance.prefer?.map((item, idx) => (
                <li key={`pref-${idx}`}>เพิ่ม/เน้น {item}</li>
              ))}
              {d.foodGuidance.limit?.map((item, idx) => (
                <li key={`lim-${idx}`}>ลด/เลี่ยง {item}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-slate-500 italic">ไม่มีข้อมูลคำแนะนำโภชนาการ</p>
          )}
        </div>
      </div>

      {isLowConfidence && (
        <div className="mt-3 rounded-2xl bg-amber-50/80 px-3 py-2 text-xs leading-5 text-amber-800">
          ⚠️ ข้อมูลบางส่วนอาจอ่านไม่ชัด กรุณาตรวจทานก่อนใช้ประกอบคำแนะนำ
        </div>
      )}

      {isMissingLabs && (
        <div className="mt-3 rounded-2xl bg-blue-100/50 px-3 py-2 text-xs leading-5 text-slate-600">
          ℹ️ ยังไม่มีค่าบางรายการ เช่น HbA1c หรือ eGFR หากต้องการให้คำแนะนำแม่นขึ้น สามารถเพิ่มผลตรวจรอบถัดไปได้
        </div>
      )}

      {allLabs.length > 0 ? (
        <details className="mt-4 border-t border-slate-200/60 pt-3">
          <summary className="cursor-pointer text-xs font-bold text-[var(--recovery-blue)] hover:underline focus:outline-none select-none">
            ดูค่าตรวจทั้งหมด ({allLabs.length} รายการ)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {allLabs.map(([key, lab]) => (
              <Metric key={key} label={lab.label} value={formatHealthLabValue(lab)} />
            ))}
          </div>
        </details>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-slate-200/60 pt-3 text-xs leading-5 text-slate-500">
        <p>🛡️ ระบบบันทึกเฉพาะค่าที่สรุปแล้ว ไม่บันทึกไฟล์ PDF ต้นฉบับหรือข้อความดิบ</p>
        <DeleteRecordButton onDelete={() => onDelete(item)} loading={deleting} />
      </div>
    </div>
  );
}

function MealNutritionDaySummary({ summary, mealCount, proteinTarget, meals }: { summary: MealNutritionSummary; mealCount: number; proteinTarget: number; meals: LocalHistoryItem[] }) {
  const status = summary.proteinG != null ? calcProteinStatus(summary.proteinG, proteinTarget) : null;
  const coachNote = summary.proteinG != null ? proteinCoachNote(summary.proteinG, proteinTarget) : null;
  const remaining = summary.proteinG != null && summary.proteinG < proteinTarget ? proteinTarget - summary.proteinG : null;
  const showSecondaryMacros = summary.caloriesKcal != null || summary.carbsG != null || summary.fatG != null;

  return (
    <div className="rounded-2xl bg-orange-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-orange-600">Nutrition Summary</p>

      {/* Protein — hero metric */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">💪 Protein</p>
          <p className="text-xl font-bold leading-tight text-[var(--foreground)]">
            {summary.proteinG != null ? `${summary.proteinG} / ${proteinTarget} g` : "-"}
          </p>
          {remaining != null && (
            <p className="mt-0.5 text-xs text-slate-500">ยังขาดอีก {remaining} g</p>
          )}
        </div>
        {status && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-orange-600">{status}</span>
        )}
      </div>

      {/* Secondary macros — hide when only protein quick logs contributed partial data */}
      {showSecondaryMacros && (
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Calories" value={formatCalories(summary.caloriesKcal)} />
          <Metric label="Carbs" value={formatMacro(summary.carbsG)} />
          <Metric label="Fat" value={formatMacro(summary.fatG)} />
        </div>
      )}

      <p className="text-xs text-orange-700">{mealCount} มื้อ · {getDayMealsAssessmentText(meals)}</p>
      {coachNote && <p className="text-sm font-semibold text-[var(--foreground)]">{coachNote}</p>}
    </div>
  );
}

function BodyDetail({ item, onDelete, deleting }: { item: LocalHistoryItem; onDelete: (item: LocalHistoryItem) => void; deleting: boolean }) {
  const d = item.data as BodyCompositionAnalysis;
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};
  const confidenceLabel =
    d?.confidence === "high" ? "ความมั่นใจสูง"
    : d?.confidence === "medium" ? "ความมั่นใจปานกลาง"
    : null;

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--recovery-blue)] mb-2">⚖️ ร่างกาย</p>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {ext.weightKg != null && <Metric label="น้ำหนัก" value={`${formatDecimal(ext.weightKg)} kg`} />}
        {ext.bodyFatPercent != null && <Metric label="ไขมัน" value={formatPercent(ext.bodyFatPercent)} />}
        {ext.skeletalMuscleKg != null && <Metric label="กล้ามเนื้อ" value={`${formatDecimal(ext.skeletalMuscleKg)} kg`} />}
      </div>
      {typeof coach.bodySummary === "string" && coach.bodySummary && (
        <p className="text-sm leading-6 text-slate-700">{truncate(coach.bodySummary, 140)}</p>
      )}
      {confidenceLabel && (
        <p className="mt-2 text-xs text-slate-400">{confidenceLabel}</p>
      )}
      <DeleteRecordButton onDelete={() => onDelete(item)} loading={deleting} />
    </div>
  );
}

function SummaryDetail({ item, onDelete, deleting }: { item: LocalHistoryItem; onDelete: (item: LocalHistoryItem) => void; deleting: boolean }) {
  const d = item.data as DailySummary & { coachMessage?: string };

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--label-color)] mb-1">💬 สรุปท้ายวัน</p>
      <p className="text-sm leading-6 text-slate-700 whitespace-pre-line">
        {truncate(d?.coachMessage ?? d?.overallSummary ?? "", 240)}
      </p>
      <DeleteRecordButton onDelete={() => onDelete(item)} loading={deleting} />
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function PainDetail({ item, meta, onDelete, deleting }: { item: LocalHistoryItem; meta?: PainDisplayMeta; onDelete: (item: LocalHistoryItem) => void; deleting: boolean }) {
  const painLog = item.data as PainLog;
  if (!painLog) return null;

  const SIDE_LABELS: Record<string, string> = {
    left: "ซ้าย", right: "ขวา", both: "ทั้งสองข้าง", unknown: "ไม่แน่ใจ",
  };
  const STARTED_LABELS: Record<string, string> = {
    before_run: "ก่อนวิ่ง", during_run: "ระหว่างวิ่ง",
    after_run: "หลังวิ่ง", next_morning: "เช้าวันถัดไป", unknown: "ไม่แน่ใจ",
  };
  const TRI_LABELS: Record<string, string> = { yes: "ใช่", no: "ไม่มี", unknown: "ไม่แน่ใจ" };
  const BEAR_LABELS: Record<string, string> = { yes: "รับได้ปกติ", no: "รับไม่ได้", unknown: "ไม่แน่ใจ" };

  function riskBadgeClass(risk: string) {
    if (risk === "high")   return "bg-red-100 text-red-700";
    if (risk === "medium") return "bg-amber-100 text-amber-700";
    return "bg-[var(--primary-soft)] text-[var(--color-success)]";
  }
  function cardClass(risk: string) {
    if (risk === "high")   return "border-red-200 bg-red-50";
    if (risk === "medium") return "border-amber-200 bg-amber-50";
    return "border-[#d9e8df] bg-[#f5faf7]";
  }
  function riskLabel(risk: string) {
    if (risk === "high")   return "ต้องระวังสูง";
    if (risk === "medium") return "ควรระวัง";
    return "ระดับต่ำ";
  }
  function impactLabel(impact: string) {
    if (impact === "seek_professional") return "ปรึกษาผู้เชี่ยวชาญก่อนซ้อม";
    if (impact === "rest")              return "พักทั้งหมด";
    if (impact === "reduce_load")       return "ลดปริมาณซ้อม 24–48 ชม.";
    return "Easy run ได้ถ้าอาการไม่แย่ลง";
  }
  const hasRedFlags = Array.isArray(painLog.redFlags) && painLog.redFlags.length > 0;
  const isResolved = isResolvedPainItem(item);
  const metaLabel = meta ? `${meta.statusLabel}${meta.timeLabel ? ` · ${meta.timeLabel}` : ""}` : "";

  return (
    <div className={`rounded-2xl border p-3 space-y-2.5 ${cardClass(painLog.riskLevel)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">🩹 อาการเจ็บ</p>
          <h4 className="mt-1 truncate text-base font-bold text-[var(--foreground)]">
            {painLog.painLocation}
            {painLog.painSide && painLog.painSide !== "unknown" && (
              <span className="ml-1 text-xs font-normal text-slate-500">
                ({SIDE_LABELS[painLog.painSide] ?? painLog.painSide})
              </span>
            )}
          </h4>
          {metaLabel && <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{metaLabel}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isResolved ? "bg-[var(--primary-soft)] text-[var(--color-success)]" : painLog.riskLevel === "high" ? "bg-red-100 text-red-700" : painLog.riskLevel === "medium" ? "bg-amber-100 text-amber-700" : "bg-[var(--primary-soft)] text-[var(--color-success)]"}`}>
            {isResolved ? "หายแล้ว" : `${painLog.painLevel}/10`}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${riskBadgeClass(painLog.riskLevel)}`}>
            {riskLabel(painLog.riskLevel)}
          </span>
        </div>
      </div>

      <p className="rounded-xl bg-white/65 px-3 py-2 text-xs font-semibold leading-5 text-[var(--foreground)]">
        {isResolved ? "ล่าสุดบันทึกว่าอาการหายแล้ว ค่อย ๆ เพิ่มโหลดกลับและหยุดถ้าอาการกลับมา" : impactLabel(painLog.trainingImpact)}
      </p>

      {hasRedFlags && (
        <div className="rounded-xl bg-red-100/70 px-3 py-2 space-y-0.5">
          <p className="text-[10px] font-bold text-red-700">สัญญาณที่ควรระวัง</p>
          {painLog.redFlags.slice(0, 3).map((f, i) => (
            <p key={i} className="text-[10px] text-red-600">· {f}</p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500">
        <span className="rounded-full bg-white/60 px-2 py-0.5">เริ่ม: {STARTED_LABELS[painLog.startedWhen] ?? painLog.startedWhen}</span>
        <span className="rounded-full bg-white/60 px-2 py-0.5">บวม/แดง: {TRI_LABELS[painLog.swellingOrRedness] ?? painLog.swellingOrRedness}</span>
        <span className="rounded-full bg-white/60 px-2 py-0.5">ลงน้ำหนัก: {BEAR_LABELS[painLog.canBearWeight] ?? painLog.canBearWeight}</span>
      </div>
      <div className="flex gap-2 pt-0.5">
        <Link
          href={`/pain/${encodeURIComponent(item.id)}`}
          className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-[var(--recovery-blue)] hover:bg-white"
        >
          ดูรายละเอียด
        </Link>
        <Link
          href={`/pain?from=${encodeURIComponent(item.id)}`}
          className="rounded-full bg-white/70 px-3 py-1.5 text-xs font-bold text-[var(--recovery-blue)] hover:bg-white"
        >
          อัปเดตอาการ
        </Link>
      </div>
      <DeleteRecordButton onDelete={() => onDelete(item)} loading={deleting} />
    </div>
  );
}

function StrengthDetail({ item, onDelete, deleting }: { item: LocalHistoryItem; onDelete: (item: LocalHistoryItem) => void; deleting: boolean }) {
  const log = item.data as StrengthLog;
  if (!log) return null;

  const INTENSITY_LABELS: Record<string, string> = {
    easy: "เบา (Easy)",
    moderate: "ปานกลาง (Moderate)",
    hard: "หนัก (Hard)"
  };

  const SOURCE_LABELS: Record<string, string> = {
    saved_routine: "เทมเพลตที่บันทึกไว้",
    ai_prescription: "โค้ชปรับแนะนำประจำวัน",
    custom: "ปรับแต่งเอง"
  };

  return (
    <div className="rounded-2xl bg-blue-50/70 border border-blue-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600">🏋️ เวทเทรนนิ่ง</p>
          <h4 className="mt-1 text-sm font-bold text-[var(--foreground)]">
            {log.routineName}
          </h4>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-slate-700">{log.durationMin} นาที</p>
          <span className="text-[10px] text-slate-500">{SOURCE_LABELS[log.source] ?? log.source}</span>
        </div>
      </div>

      {log.coachReason && (
        <div className="rounded-xl bg-white/60 p-2 text-xs text-slate-700">
          <p className="font-semibold text-slate-800">คำแนะนำจากโค้ช:</p>
          <p>{log.coachReason}</p>
        </div>
      )}

      {Array.isArray(log.exercises) && log.exercises.length > 0 && (
        <div className="space-y-1 bg-white/40 p-2 rounded-xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">ท่าที่ฝึกซ้อม</p>
          <div className="divide-y divide-slate-100/50">
            {log.exercises.map((ex, i) => (
              <div key={i} className="flex justify-between py-1 text-xs text-slate-700">
                <span className="font-medium">{ex.name}</span>
                <span className="text-slate-500 shrink-0 ml-2">
                  {ex.sets} เซต × {ex.reps} ครั้ง {ex.durationSec ? `(${ex.durationSec} วิ)` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.notes && (
        <p className="text-xs text-slate-600 italic">หมายเหตุ: {log.notes}</p>
      )}

      <div className="text-[10px] text-slate-400">
        ความเหนื่อย: {INTENSITY_LABELS[log.intensity] ?? log.intensity}
      </div>
      <DeleteRecordButton onDelete={() => onDelete(item)} loading={deleting} />
    </div>
  );
}

function DeleteRecordButton({ onDelete, loading = false }: { onDelete: () => void; loading?: boolean }) {
  return (
    <div className="mt-3 flex justify-end">
      <LoadingButton
        type="button"
        loading={loading}
        loadingText="กำลังลบ..."
        onClick={onDelete}
        className="rounded-full border border-red-100 bg-white/80 px-3 py-1.5 text-xs font-bold text-red-500 transition hover:bg-red-50"
      >
        ลบรายการ
      </LoadingButton>
    </div>
  );
}

function Badge({ icon, label, color }: { icon?: string; label: string; color?: "green" | "blue" | "orange" | "red" }) {
  const bg =
    color === "green" ? "bg-[var(--primary-soft)] text-[var(--color-success)]"
    : color === "blue" ? "bg-blue-50 text-blue-700"
    : color === "orange" ? "bg-orange-50 text-orange-700"
    : color === "red" ? "bg-red-50 text-red-700"
    : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${bg}`}>
      {icon ? `${icon} ` : null}{label}
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-2.5 text-center">
      <p className="text-xs text-slate-400 truncate">{label}</p>
      <p className="mt-0.5 text-sm font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

type DayGroup = { date: string; label: string; items: LocalHistoryItem[] };
type PainDisplayMeta = { statusLabel: "ล่าสุด" | "ก่อนหน้า"; timeLabel: string };

type Dashboard = {
  runKm: number;
  runSessions: number;
  longestRunKm: number | null;
  avgReadiness: number | null;
  readinessTrend: string;
  avgSleepHours: number | null;
  sleepCount: number;
  latestBody: { weightKg: number | null; bodyFatPct: number | null; muscleKg: number | null } | null;
  avgMealCalories: number | null;
  avgMealProtein: number | null;
  coachNote: string;
};

type MealNutritionSummary = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

function buildDashboard(items: LocalHistoryItem[]): Dashboard {
  const cutoff = dateKeyBefore(7);
  const recent = items.filter((item) => getHistoryItemDateKey(item) >= cutoff);
  const runs = recent.filter((item) => item.type === "workout" && isRun(item));
  const sleeps = dedupeSleepItems(recent.filter((item) => item.type === "sleep"));
  const meals = recent.filter((item) => item.type === "meal");
  const bodies = items.filter((item) => item.type === "body");
  const mealDays = groupByDay(meals);
  const mealSummaries = mealDays.map((day) => getMealNutrition(day.items));
  const calorieDays = mealSummaries.map((summary) => summary.caloriesKcal).filter((value): value is number => value != null);
  const proteinDays = mealSummaries.map((summary) => summary.proteinG).filter((value): value is number => value != null);

  const runKm = getTotalKm(runs) ?? 0;
  const longestRunKm = runs.reduce<number | null>((max, item) => {
    const km = Number((item.data as WorkoutAnalysis)?.extracted?.distanceKm);
    if (!(km > 0)) return max;
    return Math.max(max ?? 0, km);
  }, null);

  const readinessValues = sleeps
    .map((item) => (item.data as SleepAnalysis)?.coach?.readinessScore)
    .filter((score): score is number => score != null && score > 0);
  const avgReadiness = readinessValues.length
    ? Math.round(readinessValues.reduce((sum, score) => sum + score, 0) / readinessValues.length)
    : null;

  const sleepHours = sleeps
    .map((item) => parseSleepHours(getSleepDurationRaw(item)))
    .filter((hours): hours is number => hours != null);
  const avgSleepHours = sleepHours.length
    ? Math.round((sleepHours.reduce((sum, hours) => sum + hours, 0) / sleepHours.length) * 10) / 10
    : null;

  return {
    runKm: Math.round(runKm * 10) / 10,
    runSessions: runs.length,
    longestRunKm,
    avgReadiness,
    readinessTrend: readinessLabel(readinessValues),
    avgSleepHours,
    sleepCount: sleepHours.length,
    latestBody: bodies[0] ? bodySummary(bodies[0]) : null,
    avgMealCalories: calorieDays.length ? average(calorieDays) : null,
    avgMealProtein: proteinDays.length ? average(proteinDays) : null,
    coachNote: dashboardNote({ runKm, runSessions: runs.length, avgReadiness, avgSleepHours, longestRunKm }),
  };
}

function groupByDay(items: LocalHistoryItem[]): DayGroup[] {
  const map = new Map<string, LocalHistoryItem[]>();
  for (const item of items) {
    const date = getHistoryItemDateKey(item);
    const list = map.get(date) ?? [];
    list.push(item);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayItems]) => ({
      date,
      label: formatDayLabel(date),
      items: dayItems.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    }));
}

function buildPainDisplayMeta(pains: LocalHistoryItem[]): Map<string, PainDisplayMeta> {
  const result = new Map<string, PainDisplayMeta>();
  const byArea = new Map<string, LocalHistoryItem[]>();
  for (const item of pains) {
    const pain = item.data as PainLog;
    const key = `${pain?.painLocation ?? "unknown"}|${pain?.painSide ?? "unknown"}`;
    const list = byArea.get(key) ?? [];
    list.push(item);
    byArea.set(key, list);
  }

  for (const list of byArea.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    sorted.forEach((item, index) => {
      result.set(item.id, {
        statusLabel: index === 0 ? "ล่าสุด" : "ก่อนหน้า",
        timeLabel: formatBangkokTime(item.createdAt),
      });
    });
  }
  return result;
}

function formatBangkokTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "";
  }
}

function groupRaceResultsByDate(results: RaceResult[]) {
  const map = new Map<string, RaceResult[]>();
  for (const result of results) {
    if (!result.raceDate) continue;
    const list = map.get(result.raceDate) ?? [];
    list.push(result);
    map.set(result.raceDate, list);
  }
  return map;
}

function raceResultLabel(value: RaceResult["goalResult"]) {
  if (value === "achieved") return "Achieved";
  if (value === "missed") return "Missed";
  if (value === "completed") return "Completed";
  return "Race";
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(d);
}

function getReadiness(sleeps: LocalHistoryItem[]): number | null {
  for (const item of sleeps) {
    const score = (item.data as SleepAnalysis)?.coach?.readinessScore;
    if (score != null && score > 0) return score;
  }
  return null;
}

function getPainLevel(item: LocalHistoryItem): number | string {
  const data = item.data as { painLevel?: unknown };
  const painLevel = Number(data?.painLevel);
  return Number.isFinite(painLevel) ? painLevel : "-";
}

function isResolvedPainItem(item: LocalHistoryItem): boolean {
  const data = item.data as PainLog | undefined;
  const painLevel = Number(data?.painLevel);
  const hasRedFlags = data?.swellingOrRedness === "yes"
    || data?.canBearWeight === "no"
    || Boolean(data?.redFlags?.length);
  return painLevel === 0 && !hasRedFlags && Boolean(data?.resolved || data?.status === "resolved");
}

function getTotalKm(workouts: LocalHistoryItem[]): number | null {
  let total = 0;
  let found = false;
  for (const item of workouts) {
    const km = Number((item.data as WorkoutAnalysis)?.extracted?.distanceKm);
    if (km > 0) { total += km; found = true; }
  }
  return found ? total : null;
}

function getMealNutrition(meals: LocalHistoryItem[]): MealNutritionSummary {
  const totals = {
    caloriesKcal: sumNutrition(meals, "caloriesKcal"),
    proteinG: sumNutrition(meals, "proteinG"),
    carbsG: sumNutrition(meals, "carbsG"),
    fatG: sumNutrition(meals, "fatG"),
  };
  return totals;
}

function getHealthLabs(healthCheck: HealthCheckAnalysis): [string, LabValue][] {
  const order: (keyof HealthCheckAnalysis["labs"])[] = [
    "fbs",
    "hba1c",
    "totalCholesterol",
    "triglyceride",
    "ldl",
    "hdl",
    "uricAcid",
    "creatinine",
    "egfr",
    "sgotAst",
    "sgptAlt",
  ];
  const labs = healthCheck.labs ?? {};
  const ordered = order
    .map((key) => [key, labs[key]] as [string, LabValue | undefined])
    .filter((entry): entry is [string, LabValue] => Boolean(entry[1]?.label || entry[1]?.value != null));
  const extra = Object.entries(labs)
    .filter(([key, lab]) => !order.includes(key as keyof HealthCheckAnalysis["labs"]) && Boolean(lab?.label || lab?.value != null)) as [string, LabValue][];
  return [...ordered, ...extra];
}


function formatHealthLabValue(lab: LabValue): string {
  const value = lab.value == null || lab.value === "" ? "-" : String(lab.value);
  return lab.unit ? `${value} ${lab.unit}` : value;
}

function proteinTargetGrams(profile: UserProfile | null): number {
  if (profile?.proteinTargetG && profile.proteinTargetG > 0) return Math.round(profile.proteinTargetG);
  if (profile?.weightKg && profile.weightKg > 0) return Math.round(profile.weightKg * 1.6);
  return 90;
}

function calcProteinStatus(actual: number, target: number): string {
  const pct = actual / target;
  if (pct < 0.7) return "น้อยไป";
  if (pct < 0.9) return "ใกล้ถึง";
  if (pct <= 1.2) return "ดี";
  return "เกินเป้า";
}

function proteinCoachNote(actual: number, target: number): string {
  const remaining = target - actual;
  if (remaining <= 0) return "โปรตีนวันนี้ถึงเป้าแล้ว ช่วยเรื่องฟื้นตัวได้ดี";
  return `วันนี้โปรตีนยังขาดประมาณ ${remaining} g เพิ่มโปรตีนอีกมื้อเล็ก ๆ ได้`;
}

function sumNutrition(meals: LocalHistoryItem[], key: keyof MealAnalysis["nutrition"]): number | null {
  let total = 0;
  let found = false;
  for (const meal of meals) {
    const d = extractMealData(meal);
    const n = normalizeMealNutrition(d as unknown as Record<string, unknown>);
    const value = n[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }
  return found ? Math.round(total) : null;
}

function average(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isRun(item: LocalHistoryItem): boolean {
  const kind = (item.data as WorkoutAnalysis)?.extracted?.workoutKind;
  return kind === "outdoor_run" || kind === "treadmill";
}

function isWalk(item: LocalHistoryItem): boolean {
  const kind = (item.data as WorkoutAnalysis)?.extracted?.workoutKind;
  return kind === "walk";
}

function getSummaryText(item: LocalHistoryItem): string {
  const d = item.data as DailySummary & { coachMessage?: string; overallSummary?: string };
  return d?.coachMessage ?? d?.overallSummary ?? "";
}

/** Parse "HH:MM:SS" or "MM:SS" duration string → total minutes (rounded), or null. */
function parseDurationMins(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const parts = duration.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60) || null;
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]) || null;
  return null;
}

function readinessColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 65) return "text-[var(--recovery-blue)]";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  const firstLine = text.split("\n").find((l) => l.trim()) ?? text;
  const clean = firstLine.replace(/\*+/g, "").replace(/^[-•]\s*/, "").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// ─── Data subscription ────────────────────────────────────────────────────────

function dateKeyBefore(days: number): string {
  const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
  return new Date(Date.now() + TZ_OFFSET_MS - days * 86_400_000).toISOString().slice(0, 10);
}

function bangkokDateKey(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString.slice(0, 10);
  return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function formatSleepAverageHours(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toFixed(1).replace(/\.0$/, "")} ชม.`;
}

function sleepAverageSubtext(count: number): string {
  if (count <= 0) return "ยังไม่มีข้อมูลนอน";
  return `จากข้อมูล ${count} คืน`;
}

function getLatestSleepDuration(sleeps: LocalHistoryItem[]): string | number | null {
  const latest = [...sleeps]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .find((item) => getSleepDurationRaw(item) != null);
  return latest ? getSleepDurationRaw(latest) : null;
}

function getSleepDurationRaw(item: LocalHistoryItem): string | number | null {
  const data = item.data as Record<string, unknown> | null;
  const extracted = data?.extracted as Record<string, unknown> | undefined;
  const sleep = data?.sleep as Record<string, unknown> | undefined;
  const candidates = [
    extracted?.actualSleepDurationMinutes,
    extracted?.actualSleepDurationText,
    extracted?.sleepDuration,
    extracted?.duration,
    extracted?.sleepTime,
    data?.sleepDuration,
    data?.duration,
    data?.sleepTime,
    data?.sleepDurationHours,
    data?.sleepDurationMinutes,
    data?.totalSleepMinutes,
    sleep?.duration,
    sleep?.sleepDuration,
    sleep?.totalSleepMinutes,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) return candidate;
  }
  return null;
}

function formatSleepBadgeDuration(value: string | number | null | undefined): string {
  const hours = parseSleepHours(value);
  return hours == null ? "นอน" : formatSleepAverageHours(hours);
}

function formatSleepDuration(value: string | number | null | undefined): string {
  if (value == null || value === "") return "-";
  const hours = parseSleepHours(value);
  const raw = String(value).trim();
  if (hours == null) return formatDuration(raw);
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes <= 0) return "-";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
  if (h > 0) return `${h} ชม.`;
  return `${m} นาที`;
}

function parseSleepHours(value: string | number | null | undefined): number | null {
  if (!value) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 24 ? value / 60 : value;
  }
  const colonMatch = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (colonMatch) {
    return Number(colonMatch[1]) + Number(colonMatch[2]) / 60;
  }
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minMatch = value.match(/(\d+)\s*m/i);
  if (hourMatch || minMatch) {
    return Number(hourMatch?.[1] ?? 0) + Number(minMatch?.[1] ?? 0) / 60;
  }
  const thaiHour = value.match(/(\d+(?:\.\d+)?)\s*ชม/);
  const thaiMin = value.match(/(\d+)\s*น/);
  if (thaiHour || thaiMin) {
    return Number(thaiHour?.[1] ?? 0) + Number(thaiMin?.[1] ?? 0) / 60;
  }
  return null;
}

function readinessLabel(values: number[]): string {
  if (values.length < 2) return "need more data";
  const latest = values[0];
  const previousAvg = values.slice(1).reduce((sum, score) => sum + score, 0) / (values.length - 1);
  const diff = Math.round(latest - previousAvg);
  if (diff >= 5) return `up ${diff}`;
  if (diff <= -5) return `down ${Math.abs(diff)}`;
  return "stable";
}

function bodySummary(item: LocalHistoryItem): Dashboard["latestBody"] {
  const ext = (item.data as BodyCompositionAnalysis)?.extracted;
  return {
    weightKg: ext?.weightKg ?? null,
    bodyFatPct: ext?.bodyFatPercent ?? null,
    muscleKg: ext?.skeletalMuscleKg ?? null,
  };
}

function dashboardNote(input: {
  runKm: number;
  runSessions: number;
  avgReadiness: number | null;
  avgSleepHours: number | null;
  longestRunKm: number | null;
}): string {
  if (input.runSessions === 0 && input.avgReadiness == null) {
    return "ยังไม่มีข้อมูล 7 วันที่พอสำหรับสรุปแนวโน้ม ลอง import Samsung Health หรือ upload workout/sleep เพิ่มก่อนครับ";
  }
  const parts: string[] = [];
  if (input.runSessions > 0) parts.push(`วิ่ง ${Math.round(input.runKm * 10) / 10} km จาก ${input.runSessions} sessions`);
  if (input.longestRunKm != null) parts.push(`longest ${input.longestRunKm.toFixed(1)} km`);
  if (input.avgReadiness != null) parts.push(`readiness เฉลี่ย ${input.avgReadiness}`);
  if (input.avgSleepHours != null) parts.push(`นอนเฉลี่ยช่วงล่าสุด ${formatSleepAverageHours(input.avgSleepHours)}`);
  return parts.join(" · ");
}

function PainHistoryCompactList({
  items,
  onDelete,
  deletingKey,
}: {
  items: LocalHistoryItem[];
  onDelete: (item: LocalHistoryItem) => void;
  deletingKey: string | null;
}) {
  const painItems = items
    .filter((i) => i.type === "pain")
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  if (painItems.length === 0) {
    return (
      <div className="card p-5 text-sm text-slate-500 text-center">ไม่พบประวัติอาการเจ็บ</div>
    );
  }

  const RISK_LABELS: Record<string, string> = { high: "สูง", medium: "กลาง", low: "ต่ำ" };
  const RISK_COLORS: Record<string, string> = {
    high: "text-red-600 bg-red-50 border-red-100",
    medium: "text-amber-600 bg-amber-50 border-amber-100",
    low: "text-green-600 bg-green-50 border-green-100"
  };

  const IMPACT_LABELS: Record<string, string> = {
    seek_professional: "ปรึกษาผู้เชี่ยวชาญ",
    rest: "พักทั้งหมด",
    reduce_load: "ลดปริมาณซ้อม",
    run_ok_easy: "วิ่งเบาได้"
  };

  return (
    <section className="card p-5 space-y-4 bg-white">
      <div>
        <h3 className="text-base font-bold text-[var(--foreground)]">ประวัติอาการเจ็บ</h3>
        <p className="text-xs text-slate-500 mt-0.5">ประวัติและคำแนะนำผลกระทบการซ้อมสะสม</p>
      </div>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-left border-collapse text-xs min-w-[450px]">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="py-2.5 font-semibold">วันที่</th>
              <th className="py-2.5 font-semibold">ตำแหน่ง</th>
              <th className="py-2.5 font-semibold text-center">ระดับ</th>
              <th className="py-2.5 font-semibold text-center">ความเสี่ยง</th>
              <th className="py-2.5 font-semibold">ผลกระทบ</th>
              <th className="py-2.5 font-semibold text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {painItems.map((item) => {
              const p = item.data as PainLog;
              const dateStr = getHistoryItemDateKey(item);
              const formattedDate = new Date(dateStr).toLocaleDateString("th-TH", {
                day: "numeric", month: "short"
              });
              return (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="py-2.5 font-medium text-slate-500">{formattedDate}</td>
                  <td className="py-2.5 font-bold text-slate-700">🩹 {p.painLocation}</td>
                  <td className="py-2.5 font-bold text-center text-slate-800">{p.painLevel}/10</td>
                  <td className="py-2.5 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${RISK_COLORS[p.riskLevel] || "bg-slate-50 text-slate-500"}`}>
                      {RISK_LABELS[p.riskLevel] || p.riskLevel}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-600 font-medium">{IMPACT_LABELS[p.trainingImpact] || p.trainingImpact}</td>
                  <td className="py-2.5 text-right">
                    <LoadingButton
                      type="button"
                      loading={deletingKey === item.id}
                      loadingText="กำลังลบ..."
                      onClick={() => onDelete(item)}
                      className="rounded-full border border-red-100 bg-white px-2.5 py-1 text-[10px] font-bold text-red-500 hover:bg-red-50"
                    >
                      ลบ
                    </LoadingButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function parseEditNumber(val: string): number | null {
  if (val === undefined || val === null) return null;
  const trimmed = val.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function EditMealModal({
  item,
  onClose,
  onSave,
}: {
  item: LocalHistoryItem;
  onClose: () => void;
  onSave: (updatedItem: LocalHistoryItem) => void;
}) {
  const d = extractMealData(item);
  const n = normalizeMealNutrition(d as unknown as Record<string, unknown>);

  const [foodNames, setFoodNames] = useState(
    d.detectedFoods?.map((food: { name: string }) => food.name).filter(Boolean).join(", ") || d?.extracted?.detectedFood || ""
  );
  const [kcal, setKcal] = useState(n.caloriesKcal != null ? String(n.caloriesKcal) : "");
  const [protein, setProtein] = useState(n.proteinG != null ? String(n.proteinG) : "");
  const [carbs, setCarbs] = useState(n.carbsG != null ? String(n.carbsG) : "");
  const [fat, setFat] = useState(n.fatG != null ? String(n.fatG) : "");
  
  const initialSlot = normalizeMealSlot(item, item.recordedAt || item.createdAt);
  const [mealSlot, setMealSlot] = useState<"breakfast" | "lunch" | "dinner" | "snack" | "other">(initialSlot);
  
  const initialDate = getHistoryItemDateKey(item);
  const [recordedDate, setRecordedDate] = useState(initialDate);
  
  const [note, setNote] = useState(d.note || d.trainingFit?.coachNote || d.coachNote || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const kcalVal = parseEditNumber(kcal);
      const proteinVal = parseEditNumber(protein);
      const carbsVal = parseEditNumber(carbs);
      const fatVal = parseEditNumber(fat);

      const originalDateKey = getHistoryItemDateKey(item);
      const dateChanged = originalDateKey !== recordedDate;
      const newRecordedAt = dateKeyToRecordedAt(recordedDate);
      const finalRecordedAt = dateChanged ? newRecordedAt : (item.recordedAt || dateKeyToRecordedAt(recordedDate));

      const updatedData = { ...d };

      // update names
      const trimmedFoods = foodNames.trim();
      updatedData.detectedFoods = trimmedFoods
        ? trimmedFoods.split(",").map((name) => ({ name: name.trim() })).filter((f) => f.name)
        : [];
      if (!updatedData.extracted) updatedData.extracted = {};
      updatedData.extracted.detectedFood = trimmedFoods;

      // metadata preserve
      const originalSourceType = d.sourceType || "manual";
      const originalInputMode = d.inputMode || "text";
      const originalImageCount = d.imageCount ?? (originalSourceType === "image" ? 1 : 0);
      
      updatedData.sourceType = originalSourceType;
      updatedData.inputMode = originalInputMode;
      updatedData.imageCount = originalImageCount;
      updatedData.itemCount = updatedData.detectedFoods.length;

      // update slot
      updatedData.mealSlot = mealSlot;
      updatedData.mealType = mealSlot;

      // update nutrition
      updatedData.nutrition = {
        caloriesKcal: kcalVal,
        proteinG: proteinVal,
        carbsG: carbsVal,
        fatG: fatVal,
        fiberG: d.nutrition?.fiberG ?? null,
      };

      // note
      updatedData.note = note.trim() || undefined;
      if (updatedData.trainingFit) {
        updatedData.trainingFit.coachNote = note.trim() || "";
      }
      updatedData.coachNote = note.trim() || "";


      const updatedItem: LocalHistoryItem = {
        ...item,
        recordedAt: finalRecordedAt,
        dateKey: recordedDate,
        data: updatedData,
      };

      const result = await saveHistoryItems([updatedItem]);
      if (result.ok) {
        onSave(updatedItem);
      } else {
        setError(result.error || "เกิดข้อผิดพลาดในการบันทึก");
      }
    } catch {
      setError("เกิดข้อผิดพลาดในการประมวลผลข้อมูล");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div
        data-testid="meal-edit-modal"
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 flex flex-col max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-lg font-bold text-[var(--foreground)] mb-4">แก้ไขมื้ออาหาร</h3>
        
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">ชื่อมื้อ / รายการอาหาร</label>
            <input
              type="text"
              required
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#b9d9c0] focus:ring-1 focus:ring-[#b9d9c0] outline-none"
              placeholder="เช่น ข้าวมันไก่, แกงจืด"
              value={foodNames}
              onChange={(e) => setFoodNames(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">kcal</label>
              <input
                data-testid="meal-edit-kcal"
                type="text"
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#b9d9c0] focus:ring-1 focus:ring-[#b9d9c0] outline-none"
                placeholder="ไม่ระบุ"
                value={kcal}
                onChange={(e) => setKcal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">โปรตีน (g)</label>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#b9d9c0] focus:ring-1 focus:ring-[#b9d9c0] outline-none"
                placeholder="ไม่ระบุ"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">คาร์บ (g)</label>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#b9d9c0] focus:ring-1 focus:ring-[#b9d9c0] outline-none"
                placeholder="ไม่ระบุ"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500">ไขมัน (g)</label>
              <input
                type="text"
                className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#b9d9c0] focus:ring-1 focus:ring-[#b9d9c0] outline-none"
                placeholder="ไม่ระบุ"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 block">ช่วงเวลาของมื้อนี้</label>
            <div className="flex flex-wrap gap-1.5">
              {(["breakfast", "lunch", "dinner", "snack", "other"] as const).map((slot) => {
                const label = getMealSlotLabel(slot);
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setMealSlot(slot)}
                    className={`rounded-full px-4 py-1.5 text-xs font-bold transition border ${mealSlot === slot ? "bg-[#17201d] text-white border-[#17201d]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="meal-edit-date-input" className="text-xs font-bold text-slate-500">วันที่ของข้อมูลนี้</label>
            <input
              id="meal-edit-date-input"
              data-testid="meal-edit-date"
              type="date"
              required
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#b9d9c0] focus:ring-1 focus:ring-[#b9d9c0] outline-none"
              value={recordedDate}
              onChange={(e) => setRecordedDate(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500">หมายเหตุ ถ้ามี</label>
            <textarea
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm focus:border-[#b9d9c0] focus:ring-1 focus:ring-[#b9d9c0] outline-none min-h-16"
              placeholder="หมายเหตุเพิ่มเติม..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
            >
              ยกเลิก
            </button>
            <LoadingButton
              type="submit"
              loading={saving}
              loadingText="กำลังบันทึก..."
              className="rounded-full bg-[#17201d] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2c3d38]"
            >
              บันทึกการแก้ไข
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Weekly Review Card ───────────────────────────────────────────────────────

function WeeklyReviewCard({ review }: { review: WeeklyReview }) {
  const readinessLabel = review.avgReadiness != null
    ? getRunMateReadinessLabel(review.avgReadiness)
    : null;

  return (
    <section className="card p-5 space-y-4">
      {/* Primary header of the card: Recovery Trend */}
      <div className="flex items-center gap-2 border-b border-[var(--border-warm)] pb-2.5">
        <span className="text-xl">📈</span>
        <div>
          <h3 className="text-sm font-bold text-[var(--foreground)]">แนวโน้ม Recovery 7 วัน</h3>
          <p className="text-[10px] text-slate-400">ประเมินความพร้อมและแนวโน้มการฟื้นตัวสะสม</p>
        </div>
      </div>

      {/* Dynamic parameters for recovery trend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-slate-50/70 p-3 rounded-2xl border border-slate-100">
        <div className="flex justify-between border-b border-slate-100/80 pb-1">
          <span className="text-slate-400">ฟื้นตัวเฉลี่ย:</span>
          <span className="font-bold text-slate-700">
            {review.avgRecoveryScore != null ? `${review.avgRecoveryScore}/100` : "–"}
          </span>
        </div>
        <div className="flex justify-between border-b border-slate-100/80 pb-1">
          <span className="text-slate-400">โหลดสะสม:</span>
          <span className={`font-bold ${review.loadLevel === "สูง" || review.loadLevel === "สูงมาก" ? "text-[#9b742c]" : "text-[var(--color-success)]"}`}>
            {review.avgLoadScore != null ? `${review.avgLoadScore}/100 · ` : ""}{review.loadLevel}
          </span>
        </div>
        <div className="flex justify-between border-b border-slate-100/80 pb-1">
          <span className="text-slate-400">การนอน:</span>
          <span className={`font-bold ${review.sleepDebtLevel === "สูง" ? "text-[var(--status-rest)]" : review.sleepDebtLevel === "ปานกลาง" ? "text-[#9b742c]" : "text-[var(--color-success)]"}`}>
            {review.avgSleepHours != null ? `${review.avgSleepHours} ชม.` : "–"}{review.avgSleepScore != null ? ` · ${review.avgSleepScore}/100` : ""}
          </span>
        </div>
        <div className="flex justify-between border-b border-slate-100/80 pb-1">
          <span className="text-slate-400">สารอาหาร:</span>
          <span className="font-bold text-slate-700">
            {review.avgFuelScore != null ? `${getRecoveryAxisLabel("fuel", review.avgFuelScore)} · ${review.avgFuelScore}/100` : "–"}
          </span>
        </div>
        <div className="flex justify-between col-span-2 pt-0.5">
          <span className="text-slate-400">อาการเจ็บ:</span>
          <span className="font-bold text-slate-700">{review.painStatusText}</span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[#2e4a5e] bg-blue-50/40 p-3 rounded-2xl border border-blue-100/50">
        💡 {review.recoveryTrendSummaryText}
      </p>

      {/* Stats Summary Grid (Collapsible/smaller visual weight) */}
      <div className="border-t border-[var(--border-warm)] pt-3.5 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">ตัวเลขสรุปรวม 7 วัน</p>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-xl bg-slate-50/50 p-2">
            <p className="text-[9px] text-slate-400">วิ่งรวม</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">{review.runningKmTotal > 0 ? `${review.runningKmTotal} km` : "–"}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{review.runCount} ครั้ง</p>
          </div>
          <div className="rounded-xl bg-slate-50/50 p-2">
            <p className="text-[9px] text-slate-400">เวท</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">{review.strengthCount > 0 ? `${review.strengthCount} ครั้ง` : "–"}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{review.walkCount > 0 ? `เดิน ${review.walkCount}` : "–"}</p>
          </div>
          <div className="rounded-xl bg-slate-50/50 p-2">
            <p className="text-[9px] text-slate-400">นอนเฉลี่ย</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">{review.avgSleepHours != null ? `${review.avgSleepHours} ชม.` : "–"}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">{review.sleepNights} คืน</p>
            {(review.readinessCount > 0 || review.avgReadiness != null) && (
              <p className="text-[8px] text-slate-400 mt-0.5 leading-tight">
                {review.readinessCount > 0
                  ? `Readiness เฉลี่ย ${review.avgReadiness} (${review.readinessCount} วัน)`
                  : `Readiness ${readinessLabel}`}
              </p>
            )}
          </div>
          <div className="rounded-xl bg-slate-50/50 p-2">
            <p className="text-[9px] text-slate-400">อาหาร</p>
            <p className="text-xs font-bold text-slate-700 mt-0.5">{review.mealCount > 0 ? `${review.mealCount} มื้อ` : "–"}</p>
            <p className="text-[9px] text-slate-400 mt-0.5">เจ็บ {review.activePainDays} วัน</p>
          </div>
        </div>
      </div>

      {/* Highlights / cautions */}
      {(review.highlights.length > 0 || review.cautions.length > 0) && (
        <div className="grid grid-cols-2 gap-4 border-t border-[var(--border-warm)] pt-3.5 text-[11px] leading-relaxed">
          {review.highlights.length > 0 && (
            <div className="space-y-1">
              <p className="font-bold text-[var(--primary-strong)]">✓ จุดที่ดี</p>
              {review.highlights.slice(0, 3).map((h, i) => (
                <p key={i} className="text-slate-600">· {h}</p>
              ))}
            </div>
          )}
          {review.cautions.length > 0 && (
            <div className="space-y-1">
              <p className="font-bold text-amber-600">⚠️ ควรระวัง</p>
              {review.cautions.slice(0, 3).map((c, i) => (
                <p key={i} className="text-amber-700">· {c}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {review.nextFocus.length > 0 && (
        <div className="rounded-2xl bg-[#eef4f8] border border-[#ccdce8] p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-base">🎯</span>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--recovery-blue)]">โฟกัสถัดไป</p>
          </div>
          {review.nextFocus.map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#42677f] text-[9px] font-bold text-white">
                {i + 1}
              </span>
              <p className="text-xs font-semibold text-[#2e4a5e] leading-5">{f}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
