"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ImageUploader } from "@/components/ImageUploader";
import { SleepResultCard } from "@/components/SleepResultCard";
import { MealResultCard } from "@/components/MealResultCard";
import { WorkoutResultCard } from "@/components/WorkoutResultCard";
import { BodyResultCard } from "@/components/BodyResultCard";
import { PostRunAnalysisCard } from "@/components/PostRunAnalysisCard";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import type { BodyCompositionAnalysis, MealAnalysis, MealType, SleepAnalysis, WorkoutAnalysis } from "@/types/logs";
import type { UserProfile } from "@/types/profile";

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
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coachContext, setCoachContext] = useState<CoachContext | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("type") as UploadType;
    if (t && ["sleep", "meal", "workout", "body"].includes(t)) {
      queueMicrotask(() => setType(t));
    }
  }, []);
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [result, setResult] = useState<unknown>(null);

  useEffect(() => {
    Promise.all([loadProfileFromSupabase(), buildCoachContextFromSupabase()]).then(([profileResult, context]) => {
      if (profileResult.ok) setProfile(profileResult.profile ?? null);
      setCoachContext(context);
    });
  }, []);

  const endpoint =
    type === "sleep"
      ? "/api/analyze-sleep"
      : type === "meal"
        ? "/api/analyze-meal"
        : type === "workout"
          ? "/api/analyze-workout"
          : "/api/analyze-body";

  async function store(next: unknown) {
    setSaveStatus("saving");
    const data = (next as { data?: unknown }).data ?? next;
    const extractedDate = (data as { extracted?: { date?: string | null } }).extracted?.date;
    const saved = createHistoryItem(type, data, extractedDate ?? undefined);
    if (process.env.NODE_ENV === "development") {
      console.info("[upload-debug]", { uploadType: type, saveTable: "history_items", historyItemId: saved.id });
    }
    const saveResult = await saveHistoryItems([saved]);
    if (!saveResult.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload-debug]", { uploadType: type, saveError: saveResult.error });
      }
      setSaveStatus("error");
      throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    }
    setResult(next);
    setSaveStatus("saved");
    invalidateCoachCache();
  }

  function selectUploadType(nextType: UploadType) {
    setType(nextType);
    setResult(null);
    setSaveStatus("idle");
  }

  return (
    <AppShell title="Upload" subtitle="อัปโหลดภาพ แล้วให้โค้ชอ่านข้อมูลให้">
      <section className="card space-y-3 p-5">
        <div className="grid grid-cols-4 gap-2">
          {(["sleep", "meal", "workout", "body"] as UploadType[]).map((item) => (
            <button key={item} className={`rounded-2xl px-3 py-3 text-sm font-bold ${type === item ? "bg-[#17201d] text-white" : "bg-slate-50 text-slate-600"}`} onClick={() => selectUploadType(item)}>
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
          key={type}
          kind={type}
          endpoint={endpoint}
          maxFiles={type === "meal" ? 1 : type === "sleep" ? 3 : 4}
          extraFields={{ ...(type === "meal" ? { mealType } : {}), profile, context: coachContext }}
          onResult={store}
        />
        {saveStatus === "saving" && <p className="text-xs font-semibold text-slate-500">กำลังบันทึก...</p>}
        {saveStatus === "saved" && <p className="text-xs font-semibold text-green-600">บันทึกแล้ว</p>}
        {saveStatus === "error" && <p className="text-xs font-semibold text-red-500">บันทึกไม่สำเร็จ กรุณาลองใหม่</p>}
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
