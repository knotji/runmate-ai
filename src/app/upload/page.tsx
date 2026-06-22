"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ImageUploader } from "@/components/ImageUploader";
import { SleepResultCard } from "@/components/SleepResultCard";
import { WorkoutResultCard } from "@/components/WorkoutResultCard";
import { BodyResultCard } from "@/components/BodyResultCard";
import { AIReadQualityNote } from "@/components/AIReadQualityNote";
import { PostRunAnalysisCard } from "@/components/PostRunAnalysisCard";
import { StrengthWorkoutCard } from "@/components/StrengthWorkoutCard";
import { LoadingButton } from "@/components/LoadingButton";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createHistoryItem, findMealSlotByDateAndType, saveHistoryItems } from "@/lib/cloudHistory";
import { buildMergedMeal, extractMealData, normalizeMealNutrition } from "@/lib/mealMerge";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import { buildRaceResultFromWorkout, detectRaceMatch, getWorkoutLocalDate, normalizeLocalDate, saveRaceResult, type RaceMatch } from "@/lib/raceResults";
import { loadActiveRaceGoalAndPlan, markRaceGoalCompleted } from "@/lib/raceStorage";
import { formatCalories, formatMacro, formatNutritionRange } from "@/lib/format";
import { buildNutritionTargetSummary } from "@/lib/nutritionTargets";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { BodyCompositionAnalysis, MealAnalysis, MealType, SleepAnalysis, WorkoutAnalysis } from "@/types/logs";
import type { UserProfile } from "@/types/profile";

type UploadType = "sleep" | "meal" | "workout" | "body";
type WorkoutSubtype = "run" | "strength" | "walk" | "other";
type MealInputMode = "image" | "text";

const IMAGE_REPORT_KEYS = new Set([
  "imageUrl",
  "imageUrls",
  "imagePath",
  "imagePaths",
  "storagePath",
  "storagePaths",
  "thumbnailUrl",
  "thumbnailUrls",
  "base64",
  "imageDataUrl",
  "imageDataUrls",
]);

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

const CONFIDENCE_LABELS = {
  high: "ความมั่นใจสูง",
  medium: "ความมั่นใจปานกลาง",
  low: "ความมั่นใจต่ำ",
} as const;

export default function UploadPage() {
  const [type, setType] = useState<UploadType>("sleep");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [coachContext, setCoachContext] = useState<CoachContext | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [bodySaveError, setBodySaveError] = useState("");
  const [raceMatch, setRaceMatch] = useState<RaceMatch | null>(null);
  const [raceResultError, setRaceResultError] = useState("");
  const [workoutSavedItem, setWorkoutSavedItem] = useState<import("@/lib/localHistory").LocalHistoryItem | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<"" | "workout" | "race_result">("");
  const [mealSlotConflict, setMealSlotConflict] = useState<{
    existing: import("@/lib/localHistory").LocalHistoryItem;
    newMeal: MealAnalysis;
  } | null>(null);
  const [workoutSubtype, setWorkoutSubtype] = useState<WorkoutSubtype>("run");
  const [mealInputMode, setMealInputMode] = useState<MealInputMode>("image");
  const [manualMealText, setManualMealText] = useState("");
  const [manualMealNote, setManualMealNote] = useState("");
  const [manualMealError, setManualMealError] = useState("");
  const [manualMealLoading, setManualMealLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("type") ?? "";
    const aliasMap: Record<string, UploadType> = {
      sleep: "sleep", meal: "meal", workout: "workout", body: "body",
      run: "workout", วิ่ง: "workout",
    };
    const resolved: UploadType | undefined = aliasMap[raw.toLowerCase()];
    if (process.env.NODE_ENV === "development") {
      console.info("[upload-type-debug]", { queryType: raw, resolvedType: resolved ?? "(none — keeping default)" });
    }
    if (resolved) {
      queueMicrotask(() => setType(resolved));
      if (resolved === "workout") {
        const sub = params.get("subtype") ?? "";
        if (isWorkoutSubtype(sub)) {
          queueMicrotask(() => setWorkoutSubtype(sub));
        }
      }
    }
  }, []);
  const [mealType, setMealType] = useState<MealType>(() => inferMealTypeFromBangkokTime());
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

  async function store(next: unknown, overrideType: UploadType = type): Promise<LocalHistoryItem> {
    setSaveStatus("saving");
    if (overrideType === "body") setBodySaveError("");
    const data = sanitizeReportDataForSave((next as { data?: unknown }).data ?? next);
    const extractedDate = (data as { extracted?: { date?: string | null } }).extracted?.date;
    // Body items always use upload time as createdAt — using the measurement date from the image
    // would file the item under that day in Report, not today, making it hard to find.
    const saveDate = overrideType === "body" ? undefined : (extractedDate ?? undefined);
    const saved = createHistoryItem(overrideType, data, saveDate);
    if (process.env.NODE_ENV === "development") {
      console.info("[upload-debug]", {
        uploadType: overrideType,
        saveTable: "history_items",
        historyItemId: saved.id,
        extractedDate,
        savedCreatedAt: saved.createdAt,
        dataKeys: typeof data === "object" && data !== null ? Object.keys(data) : [],
      });
    }
    const saveResult = await saveHistoryItems([saved]);
    if (!saveResult.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload-debug]", { uploadType: overrideType, saveError: saveResult.error });
      }
      if (overrideType === "body") setBodySaveError(saveResult.error ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setSaveStatus("error");
      throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    }
    setResult(next);
    setSaveStatus("saved");
    invalidateCoachCache();
    if (overrideType === "sleep") {
      void buildCoachContextFromSupabase().then((context) => setCoachContext(context));
    }
    return saved;
  }

  async function handleManualWorkoutSave(workout: WorkoutAnalysis) {
    try {
      const savedItem = await store({ data: workout }, "workout");
      setResult({ data: workout });
      setWorkoutSavedItem(savedItem);
    } catch {
      // error is set inside store()
    }
  }

  async function handleAnalysisResult(next: unknown) {
    setRaceMatch(null);
    setRaceResultError("");
    setWorkoutSavedItem(null);
    setSaveFeedback("");
    if (type === "meal") {
      const data = ((next as { data?: MealAnalysis }).data ?? next) as MealAnalysis;
      if (process.env.NODE_ENV === "development") {
        console.info("[meal-analysis-result]", {
          hasDetectedFoods: Array.isArray(data.detectedFoods) && data.detectedFoods.length > 0,
          detectedFoodsCount: Array.isArray(data.detectedFoods) ? data.detectedFoods.length : 0,
          nutritionObjectKeys: data.nutrition ? Object.keys(data.nutrition) : [],
          nutritionRangeObjectKeys: data.nutritionRange ? Object.keys(data.nutritionRange) : [],
          confidence: data.confidence,
          needsReview: data.needsReview,
        });
      }
      const meal = normalizeMealAnalysis({ ...data, mealType });
      setResult({ data: meal });
      setSaveStatus("idle");
      return;
    }
    if (type === "workout") {
      const data = ((next as { data?: WorkoutAnalysis }).data ?? next) as WorkoutAnalysis;
      const todayBangkok = toBangkokDate(new Date());
      const workoutLocalDate = getWorkoutLocalDate(data, todayBangkok);

      let raceGoalForMatch = null;
      try {
        const raceResult = await loadActiveRaceGoalAndPlan();
        if (raceResult.ok) raceGoalForMatch = raceResult.goal;
      } catch (error) {
        if (process.env.NODE_ENV === "development") console.warn("[race-match-debug] loadActiveRaceGoalAndPlan error", error);
      }

      if (process.env.NODE_ENV === "development") {
        const ext = data.extracted as Record<string, unknown>;
        console.info("[race-match-debug]", {
          rawDateFields: {
            date: ext?.date,
            workoutDate: ext?.workoutDate,
            activityDate: ext?.activityDate,
            startTime: ext?.startTime,
          },
          workoutLocalDate,
          todayBangkok,
          raceGoalId: raceGoalForMatch?.id ?? null,
          raceGoalName: raceGoalForMatch?.raceName ?? null,
          raceGoalDate: raceGoalForMatch?.raceDate ?? null,
          raceLocalDate: normalizeLocalDate(raceGoalForMatch?.raceDate),
          matched: !!(raceGoalForMatch && workoutLocalDate === normalizeLocalDate(raceGoalForMatch.raceDate)),
        });
      }

      const match = detectRaceMatch(data, raceGoalForMatch, todayBangkok);
      if (match) {
        setResult({ data });
        setRaceMatch(match);
        setSaveStatus("idle");
        return;
      }
    }
    if (type === "body") {
      setResult(next);
      setSaveStatus("idle");
      return;
    }
    await store(next);
  }

  async function saveMeal(nextMeal: MealAnalysis) {
    const localDate = toBangkokDate(new Date());
    const existing = await findMealSlotByDateAndType(localDate, nextMeal.mealType);
    if (process.env.NODE_ENV === "development") {
      console.info("[meal-slot-debug]", {
        localDate,
        mealType: nextMeal.mealType,
        existingMealCount: existing ? 1 : 0,
        action: existing ? "conflict-detected" : "new-save",
        existingId: existing?.id ?? null,
      });
    }
    if (existing) {
      setMealSlotConflict({ existing, newMeal: nextMeal });
      return;
    }
    await store({ data: nextMeal }, "meal");
    setResult(null);
  }

  async function analyzeManualMeal() {
    const mealText = manualMealText.trim();
    if (mealText.length < 2) {
      setManualMealError("พิมพ์เมนูที่กินก่อนครับ");
      return;
    }

    setManualMealError("");
    setManualMealLoading(true);
    setSaveStatus("idle");
    try {
      const response = await fetch("/api/analyze-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meal",
          inputMode: "text",
          mealText,
          mealType,
          mealSlot: mealType,
          note: manualMealNote.trim(),
          profile,
          context: coachContext,
        }),
      });
      const payload = await response.json() as { data?: MealAnalysis; message?: string };
      if (!response.ok || !payload.data) {
        throw new Error(payload.message || "วิเคราะห์เมนูไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง");
      }
      const meal = normalizeMealAnalysis({
        ...payload.data,
        mealType,
        inputMode: "text",
        originalMealText: mealText,
        note: manualMealNote.trim(),
      });
      setResult({ data: meal });
    } catch (error) {
      const message = error instanceof Error ? error.message : "วิเคราะห์เมนูไม่สำเร็จ ลองพิมพ์ใหม่อีกครั้ง";
      setManualMealError(message);
    } finally {
      setManualMealLoading(false);
    }
  }

  async function saveMealWithAction(
    action: "merge" | "replace" | "separate",
    existing: import("@/lib/localHistory").LocalHistoryItem,
    newMeal: MealAnalysis,
  ) {
    setMealSlotConflict(null);
    const localDate = toBangkokDate(new Date());

    if (action === "separate") {
      const separateMeal = { ...newMeal, isSeparateMeal: true };
      const saved = await store({ data: separateMeal }, "meal");
      if (process.env.NODE_ENV === "development") {
        console.info("[meal-slot-debug]", {
          localDate, mealType: newMeal.mealType, chosenAction: "separate", savedHistoryItemId: saved.id,
        });
      }
      setResult(null);
      return;
    }

    const existingMeal = extractMealData(existing);
    const updatedMeal = action === "merge" ? buildMergedMeal(existingMeal, newMeal) : newMeal;

    // Store as direct MealAnalysis — same shape as initial save, so report page reads it correctly.
    const updatedItem = { ...existing, data: sanitizeReportDataForSave(updatedMeal) };

    if (process.env.NODE_ENV === "development") {
      const existNutr = normalizeMealNutrition(existingMeal as unknown as Record<string, unknown>);
      const newNutr   = normalizeMealNutrition(newMeal     as unknown as Record<string, unknown>);
      console.info("[meal-merge-debug]", {
        existingMealId: existing.id,
        existingNutrition: existNutr,
        newNutrition: newNutr,
        mergedNutrition: updatedMeal.nutrition,
        entriesCountBefore: existingMeal.entries?.length ?? 1,
        entriesCountAfter: updatedMeal.entries?.length ?? 1,
        updatePayloadKeys: Object.keys(updatedMeal),
        action,
      });
    }

    setSaveStatus("saving");
    const saveResult = await saveHistoryItems([updatedItem]);
    if (!saveResult.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[meal-merge-debug] Supabase update error:", saveResult.error);
      }
      setSaveStatus("error");
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.info("[meal-slot-debug]", {
        localDate, mealType: newMeal.mealType, chosenAction: action,
        savedHistoryItemId: existing.id,
        mergedFoodCount: action === "merge" ? updatedMeal.detectedFoods.length : null,
      });
    }
    setSaveStatus("saved");
    setResult(null);
    invalidateCoachCache();
  }

  function selectUploadType(nextType: UploadType) {
    setType(nextType);
    setWorkoutSubtype("run");
    if (nextType !== "meal") setMealInputMode("image");
    setResult(null);
    setSaveStatus("idle");
    setRaceMatch(null);
    setRaceResultError("");
    setMealSlotConflict(null);
    setWorkoutSavedItem(null);
    setSaveFeedback("");
    setManualMealError("");
  }

  async function saveWorkoutOnce(workout: WorkoutAnalysis): Promise<import("@/lib/localHistory").LocalHistoryItem> {
    if (workoutSavedItem) {
      if (process.env.NODE_ENV === "development") {
        console.info("[race-result-flow]", { alreadySavedWorkout: true, historyItemId: workoutSavedItem.id });
      }
      return workoutSavedItem;
    }
    const saved = await store({ data: workout }, "workout");
    setWorkoutSavedItem(saved);
    return saved;
  }

  async function saveWorkoutOnly(workout: WorkoutAnalysis) {
    setRaceResultError("");
    if (process.env.NODE_ENV === "development") {
      console.info("[race-result-flow]", { chosenAction: "workout_only", alreadySavedWorkout: !!workoutSavedItem });
    }
    await saveWorkoutOnce(workout);
    setRaceMatch(null);
    setSaveFeedback("workout");
  }

  async function saveAsRaceResult(workout: WorkoutAnalysis, match: RaceMatch) {
    setRaceResultError("");
    if (process.env.NODE_ENV === "development") {
      console.info("[race-result-flow]", { chosenAction: "race_result", raceGoalId: match.goal.id, workoutDate: match.workoutDate, alreadySavedWorkout: !!workoutSavedItem });
    }
    const saved = await saveWorkoutOnce(workout);
    const racePayload = buildRaceResultFromWorkout({ workout, goal: match.goal, linkedHistoryItemId: saved.id });
    const raceSave = await saveRaceResult(racePayload);
    if (process.env.NODE_ENV === "development") {
      if (raceSave.ok) {
        console.info("[race-result-flow] race_result insert ok", { raceResultId: raceSave.result.id });
      } else {
        console.warn("[race-result-flow] race_result insert error", { error: raceSave.error });
      }
    }
    if (!raceSave.ok) {
      setRaceResultError("บันทึก workout แล้ว แต่บันทึก Race Result ไม่สำเร็จ");
      return;
    }
    if (match.goal.id) {
      const goalUpdate = await markRaceGoalCompleted(match.goal.id);
      if (process.env.NODE_ENV === "development") {
        console.info("[race-result-flow] race_goal completed update", { goalId: match.goal.id, ok: goalUpdate.ok, error: goalUpdate.error });
      }
    }
    setRaceMatch(null);
    setSaveFeedback("race_result");
    invalidateCoachCache({ clearChat: true });
  }

  return (
    <AppShell title="Upload" subtitle="อัปโหลดภาพเพื่อสร้างบันทึกใน Report ให้โค้ชใช้เป็นบริบท">
      <section className="card space-y-3 p-5">
        <p className="text-xs leading-5 text-slate-500">
          เมื่อวิเคราะห์และกดบันทึก ข้อมูลจะเข้า Report และถูกใช้เป็นบริบทให้ Coach Chat
        </p>
        <div className="grid grid-cols-4 gap-2">
          {(["sleep", "meal", "workout", "body"] as UploadType[]).map((item) => (
            <button key={item} className={`rounded-2xl px-3 py-3 text-sm font-bold ${type === item ? "bg-[var(--primary)] text-white shadow-sm" : "bg-[var(--surface-muted)] text-[var(--muted-text)]"}`} onClick={() => selectUploadType(item)}>
              {UPLOAD_LABELS[item]}
            </button>
          ))}
        </div>
        {type === "meal" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 rounded-2xl bg-[var(--surface-muted)] p-1">
              {([
                ["image", "อัปโหลดรูป"],
                ["text", "พิมพ์เอง"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setMealInputMode(mode);
                    setResult(null);
                    setSaveStatus("idle");
                    setMealSlotConflict(null);
                    setManualMealError("");
                  }}
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${mealInputMode === mode ? "bg-white text-[#17201d] shadow-sm" : "text-[var(--muted-text)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["breakfast", "lunch", "dinner", "snack", "pre-run", "post-run"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMealType(m)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${mealType === m ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-muted)] text-[var(--muted-text)] hover:bg-[var(--primary-soft)]"}`}
                >
                  {MEAL_TYPE_LABELS[m]}
                </button>
              ))}
            </div>
          </div>
        )}
        {type === "workout" && (
          <div className="flex flex-wrap gap-1.5">
            {(["run", "strength", "walk", "other"] as const).map((sub) => (
              <button
                key={sub}
                type="button"
                onClick={() => {
                  setWorkoutSubtype(sub);
                  setResult(null);
                  setSaveStatus("idle");
                  setSaveFeedback("");
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${workoutSubtype === sub ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-muted)] text-[var(--muted-text)] hover:bg-[var(--primary-soft)]"}`}
              >
                {sub === "run" ? "วิ่ง" : sub === "strength" ? "เวท" : sub === "walk" ? "เดิน" : "อื่น ๆ"}
              </button>
            ))}
          </div>
        )}
        {type === "meal" && mealInputMode === "text" ? (
          <ManualMealLogForm
            mealText={manualMealText}
            note={manualMealNote}
            error={manualMealError}
            loading={manualMealLoading}
            onMealTextChange={setManualMealText}
            onNoteChange={setManualMealNote}
            onAnalyze={() => void analyzeManualMeal()}
          />
        ) : null}
        {!(type === "workout" && (workoutSubtype === "strength" || workoutSubtype === "walk" || workoutSubtype === "other")) && !(type === "meal" && mealInputMode === "text") ? (
          <>
            <ImageUploader
              key={type + (type === "workout" ? `-${workoutSubtype}` : "")}
              kind={type}
              endpoint={endpoint}
              maxFiles={type === "meal" ? 1 : type === "sleep" ? 3 : 4}
              extraFields={{ ...(type === "meal" ? { mealType } : {}), profile, context: coachContext }}
              onResult={handleAnalysisResult}
            />
            {saveStatus === "saving" && <p className="text-xs font-semibold text-slate-500">กำลังบันทึก...</p>}
            {saveStatus === "saved" && <p className="text-xs font-semibold text-[var(--status-ready)]">บันทึกเข้า Report แล้ว</p>}
            {saveStatus === "error" && <p className="text-xs font-semibold text-[var(--status-rest)]">บันทึกไม่สำเร็จ กรุณาลองใหม่</p>}
            {!result && saveStatus !== "saving" && <UploadEmptyGuide type={type} />}
          </>
        ) : null}
      </section>

      {type === "workout" && workoutSubtype === "strength" && (
        <StrengthWorkoutCard
          context={coachContext}
          onLogCompleted={() => {
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 3000);
          }}
        />
      )}

      {type === "workout" && (workoutSubtype === "walk" || workoutSubtype === "other") && (
        <ManualWorkoutLogForm
          subtype={workoutSubtype}
          saving={saveStatus === "saving"}
          onSave={handleManualWorkoutSave}
        />
      )}

      {result && type === "sleep" ? (
        <>
          <ReportSavedNote saveStatus={saveStatus} />
          <SleepResultCard result={(result as { data: SleepAnalysis }).data} />
        </>
      ) : null}
      {result && type === "meal" && !mealSlotConflict ? (
        <MealReviewCard
          initialMeal={(result as { data: MealAnalysis }).data}
          profile={profile}
          context={coachContext}
          saving={saveStatus === "saving"}
          onCancel={() => { setResult(null); setSaveStatus("idle"); }}
          onSave={(meal) => void saveMeal(meal)}
        />
      ) : null}
      {mealSlotConflict && type === "meal" ? (
        <MealSlotConflictCard
          existing={mealSlotConflict.existing}
          newMeal={mealSlotConflict.newMeal}
          saving={saveStatus === "saving"}
          onMerge={() => void saveMealWithAction("merge", mealSlotConflict.existing, mealSlotConflict.newMeal)}
          onReplace={() => void saveMealWithAction("replace", mealSlotConflict.existing, mealSlotConflict.newMeal)}
          onSeparate={() => void saveMealWithAction("separate", mealSlotConflict.existing, mealSlotConflict.newMeal)}
          onCancel={() => setMealSlotConflict(null)}
        />
      ) : null}
      {result && type === "workout" ? (
        <>
          <ReportSavedNote saveStatus={saveStatus} />
          <WorkoutResultCard result={(result as { data: WorkoutAnalysis }).data} />
          {saveFeedback === "race_result" && (
            <div className="card flex items-center gap-3 px-5 py-4">
              <span className="text-[var(--status-ready)] text-lg">🏁</span>
              <p className="text-sm font-bold text-[#17201d]">บันทึก Race Result แล้ว</p>
            </div>
          )}
          {saveFeedback === "workout" && (
            <div className="card flex items-center gap-3 px-5 py-4">
              <span className="text-[var(--primary-strong)] text-lg">✓</span>
              <p className="text-sm font-bold text-[#17201d]">บันทึกเป็น Workout แล้ว</p>
            </div>
          )}
          {raceMatch && !saveFeedback ? (
            <RaceResultConfirmCard
              match={raceMatch}
              workout={(result as { data: WorkoutAnalysis }).data}
              error={raceResultError}
              saving={saveStatus === "saving"}
              onSaveRace={(workout) => void saveAsRaceResult(workout, raceMatch)}
              onWorkoutOnly={(workout) => void saveWorkoutOnly(workout)}
              onCancel={() => { setRaceMatch(null); }}
            />
          ) : null}
          {!raceMatch && <PostRunAnalysisCard workout={(result as { data: WorkoutAnalysis }).data} />}
        </>
      ) : null}
      {result && type === "body" ? (
        <>
          <BodyResultCard result={(result as { data: BodyCompositionAnalysis }).data} />
          <BodySaveBar saveStatus={saveStatus} saveError={bodySaveError} onSave={() => void store(result)} />
        </>
      ) : null}
    </AppShell>
  );
}

function UploadEmptyGuide({ type }: { type: UploadType }) {
  if (type === "body") {
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-bold text-[#17201d]">อัปโหลดค่าร่างกายเพื่อสร้าง Report</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">บันทึกแนวโน้มน้ำหนัก ไขมัน กล้ามเนื้อ เพื่อให้โค้ชวิเคราะห์ได้</p>
        <div className="mt-2 space-y-1.5 text-xs leading-5">
          <p><span className="font-semibold text-slate-700">รูปค่าร่างกาย</span> — น้ำหนัก / ไขมัน / กล้ามเนื้อ</p>
          <p><span className="font-semibold text-slate-700">รูป Smart scale</span> — ดูแนวโน้มรูปร่างและพลังงาน</p>
          <p><span className="font-semibold text-slate-700">รูป Body composition</span> — ใช้ปรับเป้าหมายซ้อมและโภชนาการ</p>
        </div>
        <Link
          href="/pain"
          className="mt-3 flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200"
        >
          <span>🩹</span>
          <span>มีอาการเจ็บ? บันทึกที่หน้า &ldquo;เจ็บ&rdquo;</span>
        </Link>
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
      <p className="font-bold text-[#17201d]">ลองอัปโหลดเพื่อสร้าง Report</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">รายการที่บันทึกไว้จะช่วยให้โค้ชตอบได้แม่นขึ้นใน Coach Chat</p>
      <div className="mt-2 space-y-1.5 text-xs leading-5">
        <p><span className="font-semibold text-slate-700">รูปอาหาร</span> — กินได้มั้ย / ก่อนวิ่งได้ไหม</p>
        <p><span className="font-semibold text-slate-700">รูปผลวิ่ง</span> — HR สูงไปไหม / รอบหน้าซ้อมอะไร</p>
        <p><span className="font-semibold text-slate-700">รูปค่าร่างกาย</span> — น้ำหนัก ไขมัน กล้ามเนื้อ</p>
      </div>
    </div>
  );
}

function ReportSavedNote({ saveStatus }: { saveStatus: "idle" | "saving" | "saved" | "error" }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white/75 px-4 py-3 text-xs leading-5 text-slate-500 shadow-sm">
      {saveStatus === "saved" ? (
        <span className="font-bold text-green-700">บันทึกเข้า Report แล้ว</span>
      ) : (
        <span className="font-bold text-slate-700">ผลวิเคราะห์จาก AI</span>
      )}
      <span> ข้อมูลนี้ถูกบันทึกเป็น structured data เท่านั้น รูปต้นฉบับไม่ถูกเก็บถาวร</span>
    </section>
  );
}

function RaceResultConfirmCard({
  match,
  workout,
  error,
  saving,
  onSaveRace,
  onWorkoutOnly,
  onCancel,
}: {
  match: RaceMatch;
  workout: WorkoutAnalysis;
  error: string;
  saving: boolean;
  onSaveRace: (workout: WorkoutAnalysis) => void;
  onWorkoutOnly: (workout: WorkoutAnalysis) => void;
  onCancel: () => void;
}) {
  return (
    <section className="card space-y-3 border border-[#d9e8df] bg-[#f5faf7] p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Race Result</p>
        <h2 className="mt-2 text-xl font-bold text-[#17201d]">ผลวิ่งนี้ตรงกับวัน Race Goal</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {match.goal.raceName} · {match.goal.raceDistance} · {match.workoutDate}
        </p>
      </div>
      <p className="text-sm text-slate-600">ต้องการบันทึกผลวิ่งนี้เป็น Race Result หรือเก็บเป็น Workout ปกติ?</p>
      {!match.distanceMatches ? (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-700">
          ระยะทางอาจไม่ตรงกับระยะ race แบบเป๊ะ ๆ ระบบยังให้บันทึกได้ แต่แนะนำตรวจผลก่อนกดบันทึก
        </p>
      ) : null}
      {error ? <p className="rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-600">{error}</p> : null}
      <div className="space-y-2">
        <LoadingButton className="btn-primary w-full py-3 text-sm" type="button" loading={saving} loadingText="กำลังบันทึก..." onClick={() => onSaveRace(workout)}>
          บันทึกเป็น Race Result
        </LoadingButton>
        <LoadingButton className="btn-secondary w-full py-3 text-sm" type="button" loading={saving} loadingText="กำลังบันทึก..." onClick={() => onWorkoutOnly(workout)}>
          เก็บเป็น Workout ปกติ
        </LoadingButton>
        <button className="w-full rounded-full py-2.5 text-sm text-slate-400" type="button" disabled={saving} onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </section>
  );
}

function ManualMealLogForm({
  mealText,
  note,
  error,
  loading,
  onMealTextChange,
  onNoteChange,
  onAnalyze,
}: {
  mealText: string;
  note: string;
  error: string;
  loading: boolean;
  onMealTextChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl bg-slate-50/80 p-4">
      <div>
        <h3 className="text-base font-bold text-[#17201d]">พิมพ์เมนูเอง</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">ประเมินจากข้อความที่กรอก อาจคลาดเคลื่อนได้</p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">กินอะไร?</span>
        <textarea
          className="control min-h-[96px]"
          placeholder="เช่น ข้าวต้มปลา 1 ชาม + ไข่ลวก 1 ฟอง"
          value={mealText}
          onChange={(event) => onMealTextChange(event.target.value)}
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-400">หมายเหตุ (ไม่บังคับ)</span>
        <textarea
          className="control min-h-[72px]"
          placeholder="เช่น หลังวิ่ง, หิวมาก, ไม่ใส่น้ำตาล, กินครึ่งจาน"
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </label>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">{error}</p> : null}

      <LoadingButton
        type="button"
        loading={loading}
        loadingText="กำลังประเมิน..."
        onClick={onAnalyze}
        className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-60"
      >
        ให้โค้ชประเมิน
      </LoadingButton>
    </div>
  );
}

function MealReviewCard({
  initialMeal,
  profile,
  context,
  saving,
  onSave,
  onCancel,
}: {
  initialMeal: MealAnalysis;
  profile: UserProfile | null;
  context: CoachContext | null;
  saving: boolean;
  onSave: (meal: MealAnalysis) => void;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(initialMeal.needsReview);
  const [meal, setMeal] = useState<MealAnalysis>(initialMeal);
  const foodText = meal.detectedFoods.map((food) => food.name).join(", ");
  const cannotEstimateNutrition = meal.detectedFoods.length > 0 && !hasAnyNutrition(meal);
  const isTextEstimate = meal.inputMode === "text";

  function updateNutrition(key: keyof MealAnalysis["nutrition"], value: string) {
    const numberValue = value === "" ? null : Number(value);
    setMeal((current) => ({
      ...current,
      nutrition: {
        ...current.nutrition,
        [key]: Number.isFinite(numberValue) ? numberValue : null,
      },
      needsReview: false,
    }));
  }

  function updateFoods(value: string) {
    const foods = value.split(",").map((name) => name.trim()).filter(Boolean);
    setMeal((current) => ({
      ...current,
      detectedFoods: foods.map((name) => ({ name, portionEstimate: "แก้ไขโดยผู้ใช้", confidence: "medium" as const })),
      needsReview: false,
    }));
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Meal Review</p>
        <h2 className="mt-2 text-xl font-bold text-[#17201d]">ตรวจโภชนาการก่อนบันทึก</h2>
        {isTextEstimate ? (
          <span className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
            กรอกจากข้อความ
          </span>
        ) : null}
        <p className="mt-1 text-xs leading-5 text-amber-700">
          {isTextEstimate
            ? "ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากข้อความที่กรอก อาจคลาดเคลื่อนได้"
            : "ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากรูปอาหาร อาจคลาดเคลื่อนได้"}
        </p>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {(["breakfast", "lunch", "dinner", "snack", "pre-run", "post-run"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMeal((current) => ({ ...current, mealType: m }))}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${meal.mealType === m ? "bg-[var(--primary)] text-white" : "bg-[var(--surface-muted)] text-[var(--muted-text)] hover:bg-[var(--primary-soft)]"}`}
              >
                {MEAL_TYPE_LABELS[m]}
              </button>
            ))}
          </div>
          <input className="control" value={foodText} onChange={(event) => updateFoods(event.target.value)} placeholder="อาหารที่พบ เช่น ข้าว, ไข่, ไก่" />
          <div className="grid grid-cols-2 gap-2">
            <NutritionInput label="Calories" placeholder="เช่น 550" value={meal.nutrition.caloriesKcal} range={meal.nutritionRange?.caloriesKcal} unit="kcal" onChange={(value) => updateNutrition("caloriesKcal", value)} />
            <NutritionInput label="Protein g" placeholder="เช่น 30" value={meal.nutrition.proteinG} range={meal.nutritionRange?.proteinG} onChange={(value) => updateNutrition("proteinG", value)} />
            <NutritionInput label="Carbs g" placeholder="เช่น 70" value={meal.nutrition.carbsG} range={meal.nutritionRange?.carbsG} onChange={(value) => updateNutrition("carbsG", value)} />
            <NutritionInput label="Fat g" placeholder="เช่น 20" value={meal.nutrition.fatG} range={meal.nutritionRange?.fatG} onChange={(value) => updateNutrition("fatG", value)} />
            <NutritionInput label="Fiber g" placeholder="เช่น 5" value={meal.nutrition.fiberG} onChange={(value) => updateNutrition("fiberG", value)} />
          </div>
          {cannotEstimateNutrition ? (
            <p className="rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-700">
              AI อ่านอาหารได้ แต่ประเมินโภชนาการไม่ได้ชัดเจน คุณกรอกเองได้
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <MealReviewSummary meal={meal} profile={profile} context={context} />
        </>
      )}

      <div className="grid grid-cols-3 gap-2">
        <LoadingButton type="button" className="btn-primary py-3 text-sm" loading={saving} loadingText="กำลังบันทึก..." onClick={() => onSave(meal)}>
          บันทึก
        </LoadingButton>
        <button type="button" className="btn-secondary py-3 text-sm" onClick={() => setEditing((value) => !value)}>
          แก้ไข
        </button>
        <button type="button" disabled={saving} className="rounded-full bg-slate-50 py-3 text-sm font-bold text-slate-500 disabled:opacity-50" onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </section>
  );
}

function NutritionInput({
  label,
  value,
  range,
  unit = "g",
  placeholder,
  onChange,
}: {
  label: string;
  value: number | null;
  range?: { min: number; max: number } | null;
  unit?: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      <input className="control" type="number" inputMode="decimal" placeholder={placeholder} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      {range ? (
        <span className="mt-1 block text-[11px] leading-4 text-slate-400">
          ประเมินจากช่วง {formatNutritionRange(range.min, range.max, unit)}
        </span>
      ) : null}
    </label>
  );
}

function MealReviewSummary({ meal, profile, context }: { meal: MealAnalysis; profile: UserProfile | null; context: CoachContext | null }) {
  const foods = meal.detectedFoods.map((food) => food.name).join(", ") || "มื้ออาหาร";
  const target = buildNutritionTargetSummary({ profile, context, meal });
  const isTextEstimate = meal.inputMode === "text";
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
      <div>
        <p className="text-xs font-semibold text-slate-400">{meal.mealType}</p>
        <p className="text-lg font-bold text-[#17201d]">{foods}</p>
        {isTextEstimate && meal.originalMealText ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">จากข้อความ: {meal.originalMealText}</p>
        ) : null}
      </div>
      <AIReadQualityNote confidence={meal.confidence} unclearFields={meal.unclearFields} compact />
      {meal.errorLikeMessage ? (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-700">{meal.errorLikeMessage}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <ReviewMetric label="Calories" value={formatCalories(meal.nutrition.caloriesKcal)} />
        <ReviewMetric label="Protein" value={formatMacro(meal.nutrition.proteinG)} />
        <ReviewMetric label="Carbs" value={formatMacro(meal.nutrition.carbsG)} />
        <ReviewMetric label="Fat" value={formatMacro(meal.nutrition.fatG)} />
      </div>
      <div className="rounded-2xl bg-white p-3 text-xs leading-5 text-slate-600">
        <p className="font-bold text-[#17201d]">Runner fuel check</p>
        <p>Protein progress: {target.proteinProgressPct != null ? `${target.proteinProgressPct}%` : "-"}{target.proteinTargetG != null ? ` / target ${target.proteinTargetG} g` : ""}</p>
        <p>Carb adequacy ({target.dayType} day): {target.carbAdequacy}{target.carbTargetG != null ? ` / target ${target.carbTargetG} g` : ""}</p>
        <p>{target.recoveryFuelNote}</p>
      </div>
      {!hasAnyNutrition(meal) && meal.detectedFoods.length > 0 ? (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-700">
          AI อ่านอาหารได้ แต่ประเมินโภชนาการไม่ได้ชัดเจน คุณกรอกเองได้
        </p>
      ) : null}
      <p className="text-sm leading-6 text-slate-700">{meal.trainingFit?.coachNote ?? ""}</p>
      <p className="text-xs text-slate-500">
        {CONFIDENCE_LABELS[meal.confidence ?? "low"]} · ตัวเลขเป็นการประเมินคร่าว ๆ จาก{isTextEstimate ? "ข้อความที่กรอก" : "รูปอาหาร"}
      </p>
    </div>
  );
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-[#17201d]">{value}</p>
    </div>
  );
}

function BodySaveBar({
  saveStatus,
  saveError,
  onSave,
}: {
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError?: string;
  onSave: () => void;
}) {
  return (
    <section className="card space-y-2 p-5">
      {saveStatus === "saved" ? (
        <div className="space-y-2 text-center">
          <p className="text-sm font-bold text-[var(--status-ready)]">บันทึกเข้า Report แล้ว</p>
          <Link href="/logs" className="block text-xs font-semibold text-[var(--primary-strong)] underline underline-offset-2">
            ดูใน Report →
          </Link>
        </div>
      ) : (
        <>
          <LoadingButton
            type="button"
            loading={saveStatus === "saving"}
            loadingText="กำลังบันทึก..."
            onClick={onSave}
            className="btn-primary w-full py-3 text-sm disabled:opacity-60"
          >
            {saveStatus === "error" ? "ลองบันทึกอีกครั้ง" : "บันทึกเข้า Report"}
          </LoadingButton>
          {saveStatus === "error" && (
            <p className="text-center text-xs font-semibold text-[var(--status-rest)]">
              {saveError || "บันทึกไม่สำเร็จ กรุณาลองใหม่"}
            </p>
          )}
        </>
      )}
      <p className="text-center text-xs text-slate-400">ข้อมูล structured data เท่านั้น รูปต้นฉบับไม่ถูกเก็บ</p>
    </section>
  );
}

function sanitizeReportDataForSave<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeReportDataForSave(item)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (IMAGE_REPORT_KEYS.has(key)) continue;
    cleaned[key] = sanitizeReportDataForSave(nestedValue);
  }
  return cleaned as T;
}

function normalizeMealAnalysis(meal: MealAnalysis): MealAnalysis {
  const legacyFood = meal.extracted?.detectedFood;
  const ranges = meal.nutritionRange ?? { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null };
  const nutrition = {
    caloriesKcal: cleanNumber(meal.nutrition?.caloriesKcal) ?? midpointFromRange(ranges.caloriesKcal),
    proteinG: cleanNumber(meal.nutrition?.proteinG) ?? midpointFromRange(ranges.proteinG),
    carbsG: cleanNumber(meal.nutrition?.carbsG) ?? midpointFromRange(ranges.carbsG),
    fatG: cleanNumber(meal.nutrition?.fatG) ?? midpointFromRange(ranges.fatG),
    fiberG: cleanNumber(meal.nutrition?.fiberG),
  };
  const trainingFit = meal.trainingFit ?? {
    bestFor: [],
    carbAdequacy: "unknown" as const,
    proteinAdequacy: "unknown" as const,
    fatLoad: "unknown" as const,
    hydrationNote: meal.extracted?.hydrationSuggestion ?? "",
    coachNote: meal.coach?.suggestion ?? meal.coach?.aiSummary ?? "",
  };
  return {
    mealType: meal.mealType || "meal",
    inputMode: meal.inputMode,
    originalMealText: meal.originalMealText,
    note: meal.note,
    detectedFoods: normalizeDetectedFoods(meal.detectedFoods, legacyFood, meal.inputMode),
    nutrition,
    nutritionRange: ranges,
    trainingFit,
    confidence: meal.confidence ?? "low",
    unclearFields: Array.isArray(meal.unclearFields) ? meal.unclearFields : [],
    needsReview: meal.needsReview ?? true,
    errorLikeMessage: meal.errorLikeMessage ?? null,
    createdAt: meal.createdAt,
  };
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function isWorkoutSubtype(value: string): value is WorkoutSubtype {
  return value === "run" || value === "strength" || value === "walk" || value === "other";
}

function midpointFromRange(range?: { min: number; max: number } | null): number | null {
  if (!range) return null;
  const min = cleanNumber(range.min);
  const max = cleanNumber(range.max);
  if (min == null || max == null) return null;
  return Math.round((min + max) / 2);
}

function normalizeDetectedFoods(foods: MealAnalysis["detectedFoods"] | undefined, legacyFood?: string, inputMode?: MealAnalysis["inputMode"]): MealAnalysis["detectedFoods"] {
  const portionFallback = inputMode === "text" ? "จากข้อความ" : "จากภาพ";
  if (Array.isArray(foods) && foods.length) {
    return foods
      .map((food) => ({
        name: typeof food.name === "string" ? food.name.trim() : "",
        portionEstimate: food.portionEstimate ?? portionFallback,
        confidence: food.confidence ?? "low",
      }))
      .filter((food) => food.name);
  }
  return legacyFood ? [{ name: legacyFood, portionEstimate: portionFallback, confidence: "low" }] : [];
}

function hasAnyNutrition(meal: MealAnalysis) {
  return Object.values(meal.nutrition ?? {}).some((value) => value !== null && value !== undefined);
}

// ── Meal slot helpers ───────────────────────────────────────────────────────

function toBangkokDate(date: Date): string {
  const bangkokMs = date.getTime() + 7 * 60 * 60 * 1000;
  return new Date(bangkokMs).toISOString().slice(0, 10);
}

function inferMealTypeFromBangkokTime(): MealType {
  const hour = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCHours();
  if (hour >= 5 && hour <= 10) return "breakfast";
  if (hour >= 11 && hour <= 15) return "lunch";
  if (hour >= 16 && hour <= 20) return "dinner";
  return "snack";
}

function MealSlotConflictCard({
  existing,
  newMeal,
  saving,
  onMerge,
  onReplace,
  onSeparate,
  onCancel,
}: {
  existing: import("@/lib/localHistory").LocalHistoryItem;
  newMeal: MealAnalysis;
  saving: boolean;
  onMerge: () => void;
  onReplace: () => void;
  onSeparate: () => void;
  onCancel: () => void;
}) {
  const existingMeal = (existing.data as { data?: MealAnalysis }).data ?? (existing.data as MealAnalysis);
  const mealLabel = MEAL_TYPE_LABELS[newMeal.mealType] ?? newMeal.mealType;
  const existingFoods = existingMeal.detectedFoods?.map((f) => f.name).join(", ") || `มื้อ${mealLabel}`;

  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-500">มื้อซ้ำ</p>
        <h2 className="mt-2 text-xl font-bold text-[#17201d]">วันนี้มีมื้อ{mealLabel}อยู่แล้ว</h2>
        <p className="mt-1 text-sm text-slate-500">ต้องการทำอะไรกับรูปนี้?</p>
      </div>
      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
        <p className="text-[11px] text-slate-400 mb-0.5">ที่บันทึกไว้</p>
        <p className="text-sm font-semibold text-[#17201d]">{existingFoods}</p>
      </div>
      <div className="space-y-2">
        <LoadingButton type="button" className="btn-primary w-full py-3 text-sm" onClick={onMerge} loading={saving} loadingText="กำลังบันทึก...">
          เพิ่มเข้าเมื้อเดิม
        </LoadingButton>
        <p className="text-center text-[11px] text-slate-400">รวมอาหารและโภชนาการเข้าด้วยกัน</p>
        <LoadingButton type="button" className="btn-secondary w-full py-3 text-sm" onClick={onReplace} loading={saving} loadingText="กำลังบันทึก...">
          แทนที่ข้อมูลเดิม
        </LoadingButton>
        <LoadingButton type="button" className="w-full rounded-full bg-slate-50 py-3 text-sm font-bold text-slate-600" onClick={onSeparate} loading={saving} loadingText="กำลังบันทึก...">
          บันทึกเป็นมื้อใหม่
        </LoadingButton>
        <button type="button" className="w-full pt-1 text-xs text-slate-400" onClick={onCancel} disabled={saving}>
          ยกเลิก
        </button>
      </div>
    </section>
  );
}

function ManualWorkoutLogForm({
  subtype,
  onSave,
  saving
}: {
  subtype: "walk" | "other";
  onSave: (workout: WorkoutAnalysis) => void;
  saving: boolean;
}) {
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [avgHR, setAvgHR] = useState("");
  const [calories, setCalories] = useState("");
  const [workoutType, setWorkoutType] = useState(subtype === "walk" ? "เดิน" : "ปั่นจักรยาน");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!duration || Number(duration) <= 0) {
      setError("กรุณากรอกระยะเวลา (นาที)");
      return;
    }
    setError("");

    const h = Math.floor(Number(duration) / 60);
    const m = Math.floor(Number(duration) % 60);
    const durationStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:00`;

    const workoutKind = subtype === "walk" ? "walk" as const : "other" as const;

    const data: WorkoutAnalysis = {
      extracted: {
        workoutKind,
        date,
        distanceKm: distance ? Number(distance) : null,
        duration: durationStr,
        avgPace: null,
        avgSpeedKmh: null,
        avgHR: avgHR ? Number(avgHR) : null,
        maxHR: null,
        cadence: null,
        calories: calories ? Number(calories) : null,
        elevationGain: null,
        vo2Max: null,
        sweatLossMl: null,
        visibleMetrics: []
      },
      coach: {
        workoutSummary: subtype === "walk" ? "เดินออกกำลังกาย / Active Recovery" : workoutType,
        intensityAssessment: "เบา",
        trainingLoadNote: notes || "บันทึกการฝึกซ้อมด้วยตนเอง",
        wasTooHard: false,
        recoveryAdvice: "พักผ่อน ดื่มน้ำให้เพียงพอ",
        nutritionAfterWorkout: "เติมพลังงานด้วยสารอาหารที่มีประโยชน์",
        nextWorkoutSuggestion: "ซ้อมตามแผนปกติ",
        coachNote: notes || "บันทึกการฝึกซ้อมด้วยตนเอง"
      }
    };
    onSave(data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2 card p-5 bg-white">
      <div>
        <h3 className="text-lg font-bold text-[#17201d]">
          {subtype === "walk" ? "บันทึกกิจกรรมเดิน" : "บันทึกกิจกรรมอื่น ๆ"}
        </h3>
        <p className="text-xs text-slate-500">กรอกข้อมูลการซ้อมและบันทึกตรงเข้า Supabase</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-400">วันที่</label>
        <input type="date" className="control" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>

      {subtype === "other" && (
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">ประเภทการออกกำลังกาย</label>
          <input
            type="text"
            className="control"
            placeholder="เช่น ปั่นจักรยาน, ว่ายน้ำ, โยคะ"
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            required
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">เวลา (นาที)</label>
          <input
            type="number"
            className="control"
            placeholder="เช่น 30"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            min="1"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">ระยะทาง (กม. ถ้ามี)</label>
          <input
            type="number"
            step="0.01"
            className="control"
            placeholder="เช่น 3.5"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            min="0"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">HR เฉลี่ย (bpm ถ้ามี)</label>
          <input
            type="number"
            className="control"
            placeholder="เช่น 120"
            value={avgHR}
            onChange={(e) => setAvgHR(e.target.value)}
            min="30"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">แคลอรี (kcal ถ้ามี)</label>
          <input
            type="number"
            className="control"
            placeholder="เช่น 250"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            min="0"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-400">บันทึกเพิ่มเติม</label>
        <textarea
          className="control min-h-[80px]"
          placeholder="เช่น รู้สึกสดชื่นดี, เหนื่อยปานกลาง"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-xl">{error}</p>}

      <LoadingButton type="submit" loading={saving} loadingText="กำลังบันทึก..." className="btn-primary w-full py-3 text-sm font-bold">
        บันทึกกิจกรรม
      </LoadingButton>
    </form>
  );
}
