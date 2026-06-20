"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ImageUploader } from "@/components/ImageUploader";
import { SleepResultCard } from "@/components/SleepResultCard";
import { MealResultCard } from "@/components/MealResultCard";
import { WorkoutResultCard } from "@/components/WorkoutResultCard";
import { BodyResultCard } from "@/components/BodyResultCard";
import { PostRunAnalysisCard } from "@/components/PostRunAnalysisCard";
import { appendHistory, type HistoryType } from "@/lib/localHistory";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { pushHistoryItems } from "@/lib/historySync";
import { readLocalProfile } from "@/lib/profileStorage";
import type { BodyCompositionAnalysis, MealAnalysis, MealType, SleepAnalysis, WorkoutAnalysis } from "@/types/logs";

type UploadType = "sleep" | "meal" | "workout" | "body";

const UPLOAD_LABELS: Record<UploadType, string> = {
  sleep: "นอน",
  meal: "อาหาร",
  workout: "ซ้อม",
  body: "ร่างกาย",
};

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "เช้า",
  lunch: "กลางวัน",
  dinner: "เย็น",
  snack: "ของว่าง",
  "pre-run": "ก่อนวิ่ง",
  "post-run": "หลังวิ่ง",
};

export default function UploadPage() {
  const [type, setType] = useState<UploadType>("sleep");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("type") as UploadType;
    if (t && ["sleep", "meal", "workout", "body"].includes(t)) {
      queueMicrotask(() => setType(t));
    }
  }, []);
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [result, setResult] = useState<unknown>(null);

  const endpoint =
    type === "sleep"
      ? "/api/analyze-sleep"
      : type === "meal"
        ? "/api/analyze-meal"
        : type === "workout"
          ? "/api/analyze-workout"
          : "/api/analyze-body";

  function store(next: unknown) {
    setResult(next);
    const key =
      type === "sleep"
        ? "runmate.latestSleep"
        : type === "meal"
          ? "runmate.latestMeal"
          : type === "workout"
            ? "runmate.latestWorkout"
            : "runmate.latestBody";
    const data = (next as { data?: unknown }).data ?? next;
    localStorage.setItem(key, JSON.stringify(data));
    const extractedDate = (data as { extracted?: { date?: string | null } }).extracted?.date;
    const saved = appendHistory(type as HistoryType, data, extractedDate ?? undefined);
    if (saved) pushHistoryItems([saved]).catch(() => {});
    invalidateCoachCache();
  }

  return (
    <AppShell title="Upload" subtitle="อัปโหลดภาพ แล้วให้โค้ชอ่านข้อมูลให้">
      <section className="card space-y-3 p-5">
        <div className="grid grid-cols-4 gap-2">
          {(["sleep", "meal", "workout", "body"] as UploadType[]).map((item) => (
            <button key={item} className={`rounded-2xl px-3 py-3 text-sm font-bold ${type === item ? "bg-[#17201d] text-white" : "bg-slate-50 text-slate-600"}`} onClick={() => { setType(item); setResult(null); }}>
              {UPLOAD_LABELS[item]}
            </button>
          ))}
        </div>
        {type === "meal" ? (
          <select className="control" value={mealType} onChange={(event) => setMealType(event.target.value as MealType)}>
            {(["breakfast", "lunch", "dinner", "snack", "pre-run", "post-run"] as const).map((item) => (
              <option key={item} value={item}>{MEAL_TYPE_LABELS[item]}</option>
            ))}
          </select>
        ) : null}
        <ImageUploader
          kind={type}
          endpoint={endpoint}
          maxFiles={type === "meal" ? 1 : type === "sleep" ? 3 : 4}
          extraFields={{ ...(type === "meal" ? { mealType } : {}), profile: readLocalProfile() }}
          onResult={store}
        />
      </section>
      {result && type === "sleep" ? <SleepResultCard result={(result as { data: SleepAnalysis }).data} /> : null}
      {result && type === "meal" ? <MealResultCard result={(result as { data: MealAnalysis }).data} /> : null}
      {result && type === "workout" ? (
        <>
          <WorkoutResultCard result={(result as { data: WorkoutAnalysis }).data} />
          <PostRunAnalysisCard workout={(result as { data: WorkoutAnalysis }).data} />
        </>
      ) : null}
      {result && type === "body" ? <BodyResultCard result={(result as { data: BodyCompositionAnalysis }).data} /> : null}
    </AppShell>
  );
}
