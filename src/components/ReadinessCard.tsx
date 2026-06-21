"use client";

import { useEffect, useState } from "react";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import { calculateReadiness } from "@/lib/readiness";
import type { UserProfile } from "@/types/profile";

const colorMap = {
  green: {
    bg: "bg-emerald-500",
    text: "text-emerald-700",
    textLight: "text-emerald-600",
    bgLight: "bg-emerald-50/50 border-emerald-100",
  },
  yellow: {
    bg: "bg-amber-400",
    text: "text-amber-700",
    textLight: "text-amber-600",
    bgLight: "bg-amber-50/50 border-amber-100",
  },
  red: {
    bg: "bg-rose-500",
    text: "text-rose-700",
    textLight: "text-rose-600",
    bgLight: "bg-rose-50/50 border-rose-100",
  },
};

export function ReadinessCard() {
  const [context, setContext] = useState<CoachContext | null>(null);
  const [loading, setLoading] = useState(true);

  // User override states
  const [sleepScore, setSleepScore] = useState<number | null>(null);
  const [energyScore, setEnergyScore] = useState<number | null>(null);
  const [yesterdayLoad, setYesterdayLoad] = useState<"none" | "light" | "heavy">("none");
  const [muscleSoreness, setMuscleSoreness] = useState<"none" | "light" | "sore">("none");
  const [injuryFlag, setInjuryFlag] = useState(false);
  
  const [showConfig, setShowConfig] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const next = await buildCoachContextFromSupabase();
        if (alive) {
          setContext(next);

          // Extract defaults from latest sleep log
          const latestSleep = next.sleep7d[0];
          setSleepScore(latestSleep?.score ?? 75);
          setEnergyScore(latestSleep?.energyScore ?? 70);

          // Pain logs override (if there's a recent medium/high risk or high level pain log)
          const hasRecentPain = next.recentPainLogs && next.recentPainLogs.some(
            (p) => p.painLevel >= 3
          );
          setInjuryFlag(hasRecentPain);

          // Yesterday load check
          let loadVal: "none" | "light" | "heavy" = "none";
          const lastWorkout = next.workouts7d[0];
          if (lastWorkout) {
            const yesterdayStr = new Date(Date.now() - 86400000 + 7 * 3600000).toISOString().slice(0, 10);
            if (lastWorkout.date === yesterdayStr) {
              const hasHeavy = lastWorkout.runs.some((r) => r.km >= 12) || lastWorkout.other.some((o) => o.durationMin >= 60);
              loadVal = hasHeavy ? "heavy" : "light";
            }
          }
          setYesterdayLoad(loadVal);
        }
      } catch (err) {
        console.error("Failed to load coach context for readiness", err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    window.addEventListener("runmate:cloud-data-updated", load);
    return () => {
      alive = false;
      window.removeEventListener("runmate:cloud-data-updated", load);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center rounded-3xl bg-slate-50 border border-slate-100 p-5">
        <div className="flex flex-col items-center gap-2">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
          <p className="text-xs text-slate-400">กำลังประเมินความพร้อมร่างกาย...</p>
        </div>
      </div>
    );
  }

  // Calculate deltas from actual context data
  const profile = context?.profile as UserProfile | null;
  const normalRestingHr = profile?.normalRestingHr ? Number(profile.normalRestingHr) : null;
  const normalHrv = profile?.normalHrv ? Number(profile.normalHrv) : null;
  const latestSleep = context?.sleep7d[0];

  const restingHrDelta = (latestSleep?.restingHR && normalRestingHr)
    ? latestSleep.restingHR - normalRestingHr
    : null;

  const hrvDelta = (latestSleep?.hrv && normalHrv)
    ? latestSleep.hrv - normalHrv
    : null;

  const result = calculateReadiness({
    sleepScore,
    restingHrDelta,
    hrvDelta,
    yesterdayLoad,
    muscleSoreness,
    injuryFlag,
    energyScore,
  });

  const colors = colorMap[result.level];

  return (
    <section className="card rounded-3xl bg-white/80 border border-slate-100 p-5 shadow-sm transition-all duration-300">
      {/* Header Info */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#6f8fa6]">
              ประเมินความพร้อมวันนี้
            </span>
            {restingHrDelta !== null && (
              <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                ชีพจร {(restingHrDelta >= 0 ? "+" : "") + restingHrDelta} bpm
              </span>
            )}
            {hrvDelta !== null && (
              <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                HRV {(hrvDelta >= 0 ? "+" : "") + hrvDelta} ms
              </span>
            )}
          </div>
          <h2 className={`mt-1.5 text-lg font-extrabold ${colors.text}`}>
            {result.label}
          </h2>
          <p className="mt-1 text-sm font-semibold text-[#17201d]">
            {result.summary}
          </p>
        </div>

        {/* Readiness Circular Score */}
        <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full text-white ${colors.bg} shadow-sm transition-colors duration-300`}>
          <span className="text-xl font-black leading-none">{result.score}</span>
          <span className="text-[9px] font-bold tracking-wider opacity-90 mt-0.5">คะแนน</span>
        </div>
      </div>

      {/* Dynamic Recommendation Box */}
      <div className={`mt-4 rounded-2xl border p-4 ${colors.bgLight}`}>
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">คำแนะนำการซ้อม</p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-slate-700">
          {result.recommendation}
        </p>

        {/* Reasons list */}
        {result.reasons.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <p className="text-[11px] font-bold text-slate-400">ปัจจัยวิเคราะห์:</p>
            <ul className="mt-1 space-y-1">
              {result.reasons.map((reason, idx) => (
                <li key={idx} className="text-xs text-slate-500 flex items-start gap-1.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors.bg}`} />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Adjust Factors Panel */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowConfig(!showConfig)}
          className="flex w-full items-center justify-between gap-3 text-left text-xs font-bold text-slate-500 transition-colors hover:text-slate-700"
        >
          <span>ปรับปัจจัยการฟื้นตัววันนี้</span>
          <span className="text-slate-400">{showConfig ? "⌃" : "⌄"}</span>
        </button>
        {injuryFlag && (
          <p className="mt-2 text-xs leading-5 text-rose-500">
            ตอนนี้มีอาการเจ็บ ระบบจึงให้พักฟื้นเป็นหลัก
          </p>
        )}

        {showConfig && (
          <div className="mt-3 space-y-4 rounded-2xl bg-slate-50/50 p-4 border border-slate-100">
            {/* Slide: Sleep Score */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>คะแนนการนอนเมื่อคืน</span>
                <span className="text-[#42677f]">{sleepScore !== null ? `${sleepScore}/100` : "ไม่มีข้อมูล"}</span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                value={sleepScore ?? 70}
                onChange={(e) => setSleepScore(Number(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#42677f]"
              />
            </div>

            {/* Slide: Energy Score */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                <span>ระดับพลังงาน (Energy Level)</span>
                <span className="text-[#42677f]">{energyScore !== null ? `${energyScore}/100` : "ไม่มีข้อมูล"}</span>
              </div>
              <input
                type="range"
                min="30"
                max="100"
                value={energyScore ?? 70}
                onChange={(e) => setEnergyScore(Number(e.target.value))}
                className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#42677f]"
              />
            </div>

            {/* Chips: Yesterday's Load */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600">ความหนักของการซ้อมเมื่อวาน</label>
              <div className="flex gap-2">
                {(
                  [
                    { key: "none", label: "ไม่มี/พักซ้อม" },
                    { key: "light", label: "ซ้อมเบา/ปกติ" },
                    { key: "heavy", label: "ซ้อมหนัก/วิ่งยาว" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setYesterdayLoad(item.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                      yesterdayLoad === item.key
                        ? "bg-[#17201d] text-white border-[#17201d]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Chips: Muscle Soreness */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-600">ความตึงล้ากล้ามเนื้อวันนี้</label>
              <div className="flex gap-2">
                {(
                  [
                    { key: "none", label: "ไม่มี/ปกติ" },
                    { key: "light", label: "ตึงเล็กน้อย" },
                    { key: "sore", label: "ตึง/ระบมมาก" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMuscleSoreness(item.key)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition-all ${
                      muscleSoreness === item.key
                        ? "bg-[#17201d] text-white border-[#17201d]"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Injury Toggle */}
            <div className="flex items-center justify-between border-t border-slate-200/60 pt-3">
              <div className="space-y-0.5">
                <span className="block text-xs font-bold text-slate-700">แจ้งอาการบาดเจ็บ</span>
                <span className="block text-[10px] text-slate-400">ข้ามปัจจัยอื่นและปรับเป็นสีแดง (ควรพักฟื้น) ทันที</span>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={injuryFlag}
                  onChange={(e) => setInjuryFlag(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-rose-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none" />
              </label>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
