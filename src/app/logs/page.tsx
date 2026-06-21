"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { loadHistoryItems } from "@/lib/cloudHistory";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis, WorkoutAnalysis, MealAnalysis, DailySummary, BodyCompositionAnalysis } from "@/types/logs";
import {
  formatDistanceKm,
  formatDuration,
  formatPace,
  formatScore,
  formatPercent,
  formatDecimal,
  formatSummaryText,
} from "@/lib/format";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [items, setItems] = useState<LocalHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const result = await loadHistoryItems();
      if (!alive) return;
      if (result.ok) {
        setItems(result.items);
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

  const days = groupByDay(items);
  const dashboard = buildDashboard(items);

  return (
    <AppShell title="Report" subtitle="บันทึกสะสมรายวัน">
      {loading ? (
        <section className="card p-5 text-sm text-slate-500">กำลังโหลดข้อมูล...</section>
      ) : error ? (
        <section className="card p-5 text-sm text-red-500">{error}</section>
      ) : days.length === 0 ? (
        <section className="card space-y-1 p-5 text-sm text-slate-600">
          <p className="font-bold text-[#17201d]">ยังไม่มีข้อมูลสำหรับสรุปผล</p>
          <p>เริ่มจากอัปโหลดผลนอนหรือผลวิ่งวันนี้</p>
        </section>
      ) : (
        <>
          <WeeklyDashboard dashboard={dashboard} />
          {days.map((day) => <DayCard key={day.date} day={day} />)}
        </>
      )}
    </AppShell>
  );
}

function WeeklyDashboard({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">7 Day Overview</p>
        <h2 className="mt-1 text-xl font-bold text-[#17201d]">ภาพรวมสัปดาห์ล่าสุด</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{dashboard.coachNote}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DashboardMetric label="Run volume" value={dashboard.runKm > 0 ? formatDistanceKm(dashboard.runKm) : "-"} sub={`${dashboard.runSessions} sessions`} />
        <DashboardMetric label="Longest run" value={dashboard.longestRunKm != null ? formatDistanceKm(dashboard.longestRunKm) : "-"} sub="last 7 days" />
        <DashboardMetric label="Readiness avg" value={dashboard.avgReadiness != null ? formatScore(dashboard.avgReadiness) : "-"} sub={dashboard.readinessTrend} />
        <DashboardMetric label="Sleep avg" value={dashboard.avgSleepHours != null ? `${formatDecimal(dashboard.avgSleepHours)} h` : "-"} sub={`${dashboard.sleepCount} nights`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <DashboardMetric label="Weight" value={dashboard.latestBody?.weightKg != null ? `${formatDecimal(dashboard.latestBody.weightKg)} kg` : "-"} compact />
        <DashboardMetric label="Body fat" value={formatPercent(dashboard.latestBody?.bodyFatPct)} compact />
        <DashboardMetric label="Muscle" value={dashboard.latestBody?.muscleKg != null ? `${formatDecimal(dashboard.latestBody.muscleKg)} kg` : "-"} compact />
      </div>
    </section>
  );
}

function DashboardMetric({ label, value, sub, compact = false }: { label: string; value: string; sub?: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`${compact ? "text-base" : "text-xl"} mt-1 font-bold text-[#17201d]`}>{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

// ─── Day card ─────────────────────────────────────────────────────────────────

function DayCard({ day }: { day: DayGroup }) {
  const [expanded, setExpanded] = useState(false);

  const sleeps = day.items.filter((i) => i.type === "sleep");
  const workouts = day.items.filter((i) => i.type === "workout");
  const meals = day.items.filter((i) => i.type === "meal");
  const summaries = day.items.filter((i) => i.type === "summary");
  const bodies = day.items.filter((i) => i.type === "body");

  const readiness = getReadiness(sleeps);
  const totalKm = getTotalKm(workouts);
  const runKm = getTotalKm(workouts.filter(isRun));
  const walkKm = getTotalKm(workouts.filter(isWalk));
  const mealCount = meals.length;

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="w-full cursor-pointer p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">{day.label}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sleeps.length > 0 && <Badge icon="🌙" label="นอน" />}
              {workouts.some((w) => isRun(w)) && <Badge icon="🏃" label={runKm ? formatDistanceKm(runKm) : "วิ่ง"} color="green" />}
              {workouts.some((w) => isWalk(w)) && <Badge icon="🚶" label={walkKm ? formatDistanceKm(walkKm) : "เดิน"} />}
              {workouts.some((w) => !isRun(w) && !isWalk(w)) && <Badge icon="💪" label="เวท" color="blue" />}
              {mealCount > 0 && <Badge icon="🍱" label={`${mealCount} มื้อ`} color="orange" />}
              {bodies.length > 0 && <Badge icon="⚖️" label="ชั่งน้ำหนัก" />}
              {summaries.length > 0 && sleeps.length === 0 && workouts.length === 0 && <Badge icon="💬" label="บทสนทนา" />}
            </div>
          </div>

          <div className="shrink-0 text-right">
            {readiness !== null && (
              <div>
                <p className={`text-2xl font-bold ${readinessColor(readiness)}`}>{readiness}</p>
                <p className="text-xs text-slate-400">readiness</p>
              </div>
            )}
            {readiness === null && totalKm !== null && (
              <div>
                <p className="text-2xl font-bold text-[#42677f]">{formatDecimal(totalKm)}</p>
                <p className="text-xs text-slate-400">km</p>
              </div>
            )}
            {readiness === null && totalKm === null && mealCount > 0 && (
              <p className="text-sm text-slate-500">{mealCount} มื้อ</p>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 space-y-3 px-4 pb-4 pt-3">
          {sleeps.map((item) => <SleepDetail key={item.id} item={item} />)}
          {workouts.map((item) => <WorkoutDetail key={item.id} item={item} />)}
          {meals.map((item) => <MealDetail key={item.id} item={item} />)}
          {bodies.map((item) => <BodyDetail key={item.id} item={item} />)}
          {summaries.length > 0 && (sleeps.length + workouts.length + meals.length + bodies.length === 0) &&
            summaries.map((item) => <SummaryDetail key={item.id} item={item} />)}
          {summaries.length > 0 && (sleeps.length + workouts.length + meals.length + bodies.length > 0) && (
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500 mb-1">บันทึกโค้ช ({summaries.length})</p>
              {summaries.slice(0, 2).map((item) => (
                <p key={item.id} className="text-sm text-slate-700 leading-5 mt-1">
                  {truncate(getSummaryText(item), 120)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Detail panels ────────────────────────────────────────────────────────────

function SleepDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as SleepAnalysis;
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};

  return (
    <div className="rounded-2xl bg-[#e7efea] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#42677f] mb-2">🌙 การนอน</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {coach.readinessScore != null && (
          <Metric label="Readiness" value={formatScore(coach.readinessScore)} sub={coach.readinessLabel} />
        )}
        {ext.sleepScore != null && <Metric label="Sleep score" value={formatScore(ext.sleepScore)} />}
        {ext.sleepDuration && <Metric label="ระยะเวลา" value={formatDuration(ext.sleepDuration)} />}
        {ext.hrv != null && <Metric label="HRV" value={formatScore(ext.hrv)} sub="ms" />}
        {ext.restingHR != null && <Metric label="Resting HR" value={formatScore(ext.restingHR)} sub="bpm" />}
      </div>
      {coach.aiSummary && <p className="text-sm leading-6 text-slate-700">{coach.aiSummary}</p>}
      {coach.todayRecommendation && (
        <p className="mt-2 text-sm font-bold text-[#17201d]">→ {coach.todayRecommendation}</p>
      )}
    </div>
  );
}

function WorkoutDetail({ item }: { item: LocalHistoryItem }) {
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

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#42677f] mb-2">{icon} {kindLabel}</p>
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
      {coach.workoutSummary && (
        <p className="text-sm leading-6 text-slate-700">{truncate(formatSummaryText(coach.workoutSummary), 160)}</p>
      )}
    </div>
  );
}

function MealDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as MealAnalysis;
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};

  return (
    <div className="rounded-2xl bg-orange-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-orange-600 mb-1">🍱 มื้ออาหาร</p>
      {ext.detectedFood && (
        <p className="text-sm font-bold text-[#17201d] mb-2">{truncate(ext.detectedFood, 100)}</p>
      )}
      <div className="flex gap-2 flex-wrap mb-2">
        {ext.proteinLevel && <NutriBadge label="โปรตีน" level={ext.proteinLevel} />}
        {ext.carbLevel && <NutriBadge label="คาร์บ" level={ext.carbLevel} />}
        {ext.fatLevel && <NutriBadge label="ไขมัน" level={fatLevelMap(ext.fatLevel)} />}
      </div>
      {coach.aiSummary && (
        <p className="text-sm leading-6 text-slate-700">{truncate(coach.aiSummary, 140)}</p>
      )}
    </div>
  );
}

function BodyDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as { extracted?: Record<string, unknown>; coach?: Record<string, unknown> };
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#42677f] mb-2">⚖️ ส่วนประกอบร่างกาย</p>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {ext.weightKg != null && <Metric label="น้ำหนัก" value={`${formatDecimal(ext.weightKg)} kg`} />}
        {ext.bodyFatPercent != null && <Metric label="ไขมัน" value={formatPercent(ext.bodyFatPercent)} />}
        {ext.skeletalMuscleKg != null && <Metric label="กล้ามเนื้อ" value={`${formatDecimal(ext.skeletalMuscleKg)} kg`} />}
      </div>
      {typeof coach.bodySummary === "string" && coach.bodySummary && (
        <p className="text-sm leading-6 text-slate-700">{truncate(coach.bodySummary, 140)}</p>
      )}
    </div>
  );
}

function SummaryDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as DailySummary & { coachMessage?: string };

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#6f8fa6] mb-1">💬 บันทึกโค้ช</p>
      <p className="text-sm leading-6 text-slate-700 whitespace-pre-line">
        {truncate(d?.coachMessage ?? d?.overallSummary ?? "", 240)}
      </p>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function Badge({ icon, label, color }: { icon: string; label: string; color?: "green" | "blue" | "orange" }) {
  const bg =
    color === "green" ? "bg-[#e7efea] text-[#2a5a39]"
    : color === "blue" ? "bg-blue-50 text-blue-700"
    : color === "orange" ? "bg-orange-50 text-orange-700"
    : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${bg}`}>
      {icon} {label}
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

function NutriBadge({ label, level }: { label: string; level: string }) {
  const color =
    level === "good" ? "bg-green-100 text-green-700"
    : level === "high" ? "bg-red-100 text-red-700"
    : "bg-slate-100 text-slate-500";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${color}`}>
      {label} {level}
    </span>
  );
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

type DayGroup = { date: string; label: string; items: LocalHistoryItem[] };

type Dashboard = {
  runKm: number;
  runSessions: number;
  longestRunKm: number | null;
  avgReadiness: number | null;
  readinessTrend: string;
  avgSleepHours: number | null;
  sleepCount: number;
  latestBody: { weightKg: number | null; bodyFatPct: number | null; muscleKg: number | null } | null;
  coachNote: string;
};

function buildDashboard(items: LocalHistoryItem[]): Dashboard {
  const cutoff = dateKeyBefore(7);
  const recent = items.filter((item) => item.createdAt.slice(0, 10) >= cutoff);
  const runs = recent.filter((item) => item.type === "workout" && isRun(item));
  const sleeps = recent.filter((item) => item.type === "sleep");
  const bodies = items.filter((item) => item.type === "body");

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
    .map((item) => parseSleepHours((item.data as SleepAnalysis)?.extracted?.sleepDuration))
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
    coachNote: dashboardNote({ runKm, runSessions: runs.length, avgReadiness, avgSleepHours, longestRunKm }),
  };
}

function groupByDay(items: LocalHistoryItem[]): DayGroup[] {
  const map = new Map<string, LocalHistoryItem[]>();
  for (const item of items) {
    const date = item.createdAt.slice(0, 10);
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

function getTotalKm(workouts: LocalHistoryItem[]): number | null {
  let total = 0;
  let found = false;
  for (const item of workouts) {
    const km = Number((item.data as WorkoutAnalysis)?.extracted?.distanceKm);
    if (km > 0) { total += km; found = true; }
  }
  return found ? total : null;
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

function readinessColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 65) return "text-[#42677f]";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

function fatLevelMap(level: string): string {
  return level === "high" ? "high" : level === "moderate" ? "moderate" : "low";
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

function parseSleepHours(value: string | null | undefined): number | null {
  if (!value) return null;
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
  if (input.avgSleepHours != null) parts.push(`นอนเฉลี่ย ${input.avgSleepHours.toFixed(1)} ชม.`);
  return parts.join(" · ");
}
