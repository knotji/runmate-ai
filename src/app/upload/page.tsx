"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ImageUploader } from "@/components/ImageUploader";
import { SleepResultCard } from "@/components/SleepResultCard";
import { WorkoutResultCard } from "@/components/WorkoutResultCard";
import { BodyResultCard } from "@/components/BodyResultCard";
import { PostRunAnalysisCard } from "@/components/PostRunAnalysisCard";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createHistoryItem, findMealSlotByDateAndType, saveHistoryItems } from "@/lib/cloudHistory";
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
  const [raceMatch, setRaceMatch] = useState<RaceMatch | null>(null);
  const [raceResultError, setRaceResultError] = useState("");
  const [workoutSavedItem, setWorkoutSavedItem] = useState<import("@/lib/localHistory").LocalHistoryItem | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<"" | "workout" | "race_result">("");
  const [mealSlotConflict, setMealSlotConflict] = useState<{
    existing: import("@/lib/localHistory").LocalHistoryItem;
    newMeal: MealAnalysis;
  } | null>(null);

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
    if (resolved) queueMicrotask(() => setType(resolved));
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

  async function store(next: unknown, overrideType: UploadType = type): Promise<LocalHistoryItem> {
    setSaveStatus("saving");
    const data = (next as { data?: unknown }).data ?? next;
    const extractedDate = (data as { extracted?: { date?: string | null } }).extracted?.date;
    const saved = createHistoryItem(overrideType, data, extractedDate ?? undefined);
    if (process.env.NODE_ENV === "development") {
      console.info("[upload-debug]", { uploadType: overrideType, saveTable: "history_items", historyItemId: saved.id });
    }
    const saveResult = await saveHistoryItems([saved]);
    if (!saveResult.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[upload-debug]", { uploadType: overrideType, saveError: saveResult.error });
      }
      setSaveStatus("error");
      throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    }
    setResult(next);
    setSaveStatus("saved");
    invalidateCoachCache();
    return saved;
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
      const imageUrl = (next as { imageUrl?: string | null }).imageUrl ?? data.imageUrl ?? null;
      const meal = normalizeMealAnalysis({ ...data, imageUrl, mealType });
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
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.warn("[race-match-debug] loadActiveRaceGoalAndPlan error", e);
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

    const existingMeal = (existing.data as { data?: MealAnalysis }).data ?? (existing.data as MealAnalysis);
    const updatedMeal = action === "merge" ? mergeMealData(existingMeal, newMeal) : newMeal;
    const updatedItem = { ...existing, data: { data: updatedMeal } };

    setSaveStatus("saving");
    const saveResult = await saveHistoryItems([updatedItem]);
    if (!saveResult.ok) { setSaveStatus("error"); return; }

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
    setResult(null);
    setSaveStatus("idle");
    setRaceMatch(null);
    setRaceResultError("");
    setMealSlotConflict(null);
    setWorkoutSavedItem(null);
    setSaveFeedback("");
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
          <div className="flex flex-wrap gap-1.5">
            {(["breakfast", "lunch", "dinner", "snack", "pre-run", "post-run"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMealType(m)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${mealType === m ? "bg-[#17201d] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {MEAL_TYPE_LABELS[m]}
              </button>
            ))}
          </div>
        ) : null}
        <ImageUploader
          key={type}
          kind={type}
          endpoint={endpoint}
          maxFiles={type === "meal" ? 1 : type === "sleep" ? 3 : 4}
          extraFields={{ ...(type === "meal" ? { mealType } : {}), profile, context: coachContext }}
          onResult={handleAnalysisResult}
        />
        {saveStatus === "saving" && <p className="text-xs font-semibold text-slate-500">กำลังบันทึก...</p>}
        {saveStatus === "saved" && <p className="text-xs font-semibold text-green-600">บันทึกแล้ว</p>}
        {saveStatus === "error" && <p className="text-xs font-semibold text-red-500">บันทึกไม่สำเร็จ กรุณาลองใหม่</p>}
      </section>
      {result && type === "sleep" ? <SleepResultCard result={(result as { data: SleepAnalysis }).data} /> : null}
      {result && type === "meal" && !mealSlotConflict ? (
        <MealReviewCard
          initialMeal={(result as { data: MealAnalysis }).data}
          profile={profile}
          context={coachContext}
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
          <WorkoutResultCard result={(result as { data: WorkoutAnalysis }).data} />
          {saveFeedback === "race_result" && (
            <div className="card flex items-center gap-3 px-5 py-4">
              <span className="text-green-600 text-lg">🏁</span>
              <p className="text-sm font-bold text-[#17201d]">บันทึก Race Result แล้ว</p>
            </div>
          )}
          {saveFeedback === "workout" && (
            <div className="card flex items-center gap-3 px-5 py-4">
              <span className="text-[#42677f] text-lg">✓</span>
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
      {result && type === "body" ? <BodyResultCard result={(result as { data: BodyCompositionAnalysis }).data} /> : null}
    </AppShell>
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
        <button className="btn-primary w-full py-3 text-sm" type="button" disabled={saving} onClick={() => onSaveRace(workout)}>
          บันทึกเป็น Race Result
        </button>
        <button className="btn-secondary w-full py-3 text-sm" type="button" disabled={saving} onClick={() => onWorkoutOnly(workout)}>
          เก็บเป็น Workout ปกติ
        </button>
        <button className="w-full rounded-full py-2.5 text-sm text-slate-400" type="button" disabled={saving} onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </section>
  );
}

function MealReviewCard({
  initialMeal,
  profile,
  context,
  onSave,
  onCancel,
}: {
  initialMeal: MealAnalysis;
  profile: UserProfile | null;
  context: CoachContext | null;
  onSave: (meal: MealAnalysis) => void;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(initialMeal.needsReview);
  const [meal, setMeal] = useState<MealAnalysis>(initialMeal);
  const foodText = meal.detectedFoods.map((food) => food.name).join(", ");
  const cannotEstimateNutrition = meal.detectedFoods.length > 0 && !hasAnyNutrition(meal);

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
        <p className="mt-1 text-xs leading-5 text-amber-700">
          ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากรูปอาหาร อาจคลาดเคลื่อนได้
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
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${meal.mealType === m ? "bg-[#17201d] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
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
        <button type="button" className="btn-primary py-3 text-sm" onClick={() => onSave(meal)}>
          บันทึก
        </button>
        <button type="button" className="btn-secondary py-3 text-sm" onClick={() => setEditing((value) => !value)}>
          แก้ไข
        </button>
        <button type="button" className="rounded-full bg-slate-50 py-3 text-sm font-bold text-slate-500" onClick={onCancel}>
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
  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
      <div>
        <p className="text-xs font-semibold text-slate-400">{meal.mealType}</p>
        <p className="text-lg font-bold text-[#17201d]">{foods}</p>
      </div>
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
      <p className="text-xs text-slate-500">Confidence: {meal.confidence}</p>
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
    detectedFoods: normalizeDetectedFoods(meal.detectedFoods, legacyFood),
    nutrition,
    nutritionRange: ranges,
    trainingFit,
    confidence: meal.confidence ?? "low",
    needsReview: meal.needsReview ?? true,
    errorLikeMessage: meal.errorLikeMessage ?? null,
    imageUrl: meal.imageUrl ?? null,
    createdAt: meal.createdAt,
  };
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function midpointFromRange(range?: { min: number; max: number } | null): number | null {
  if (!range) return null;
  const min = cleanNumber(range.min);
  const max = cleanNumber(range.max);
  if (min == null || max == null) return null;
  return Math.round((min + max) / 2);
}

function normalizeDetectedFoods(foods: MealAnalysis["detectedFoods"] | undefined, legacyFood?: string): MealAnalysis["detectedFoods"] {
  if (Array.isArray(foods) && foods.length) {
    return foods
      .map((food) => ({
        name: typeof food.name === "string" ? food.name.trim() : "",
        portionEstimate: food.portionEstimate ?? "จากภาพ",
        confidence: food.confidence ?? "low",
      }))
      .filter((food) => food.name);
  }
  return legacyFood ? [{ name: legacyFood, portionEstimate: "จากภาพ", confidence: "low" }] : [];
}

function hasAnyNutrition(meal: MealAnalysis) {
  return Object.values(meal.nutrition ?? {}).some((value) => value !== null && value !== undefined);
}

// ── Meal slot helpers ───────────────────────────────────────────────────────

function toBangkokDate(date: Date): string {
  const bangkokMs = date.getTime() + 7 * 60 * 60 * 1000;
  return new Date(bangkokMs).toISOString().slice(0, 10);
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return Math.round(((a ?? 0) + (b ?? 0)) * 10) / 10;
}

function mergeMealData(existing: MealAnalysis, incoming: MealAnalysis): MealAnalysis {
  const seen = new Set<string>();
  const mergedFoods = [...(existing.detectedFoods ?? []), ...(incoming.detectedFoods ?? [])].filter((f) => {
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    return true;
  });
  return {
    ...incoming,
    detectedFoods: mergedFoods,
    nutrition: {
      caloriesKcal: sumNullable(existing.nutrition.caloriesKcal, incoming.nutrition.caloriesKcal),
      proteinG: sumNullable(existing.nutrition.proteinG, incoming.nutrition.proteinG),
      carbsG: sumNullable(existing.nutrition.carbsG, incoming.nutrition.carbsG),
      fatG: sumNullable(existing.nutrition.fatG, incoming.nutrition.fatG),
      fiberG: sumNullable(existing.nutrition.fiberG, incoming.nutrition.fiberG),
    },
    imageUrl: existing.imageUrl ?? incoming.imageUrl,
    needsReview: false,
  };
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
        <button type="button" className="btn-primary w-full py-3 text-sm" onClick={onMerge} disabled={saving}>
          เพิ่มเข้าเมื้อเดิม
        </button>
        <p className="text-center text-[11px] text-slate-400">รวมอาหารและโภชนาการเข้าด้วยกัน</p>
        <button type="button" className="btn-secondary w-full py-3 text-sm" onClick={onReplace} disabled={saving}>
          แทนที่ข้อมูลเดิม
        </button>
        <button type="button" className="w-full rounded-full bg-slate-50 py-3 text-sm font-bold text-slate-600" onClick={onSeparate} disabled={saving}>
          บันทึกเป็นมื้อใหม่
        </button>
        <button type="button" className="w-full pt-1 text-xs text-slate-400" onClick={onCancel} disabled={saving}>
          ยกเลิก
        </button>
      </div>
    </section>
  );
}
