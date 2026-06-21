"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ImageUploader } from "@/components/ImageUploader";
import { SleepResultCard } from "@/components/SleepResultCard";
import { WorkoutResultCard } from "@/components/WorkoutResultCard";
import { BodyResultCard } from "@/components/BodyResultCard";
import { PostRunAnalysisCard } from "@/components/PostRunAnalysisCard";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import { buildRaceResultFromWorkout, detectRaceMatch, saveRaceResult, type RaceMatch } from "@/lib/raceResults";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
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
      const raceResult = await loadActiveRaceGoalAndPlan();
      const match = detectRaceMatch(data, raceResult.ok ? raceResult.goal : null);
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
    await store({ data: nextMeal }, "meal");
    setResult(null);
  }

  function selectUploadType(nextType: UploadType) {
    setType(nextType);
    setResult(null);
    setSaveStatus("idle");
    setRaceMatch(null);
    setRaceResultError("");
  }

  async function saveWorkoutOnly(workout: WorkoutAnalysis) {
    setRaceMatch(null);
    setRaceResultError("");
    await store({ data: workout }, "workout");
  }

  async function saveAsRaceResult(workout: WorkoutAnalysis, match: RaceMatch) {
    setRaceResultError("");
    const saved = await store({ data: workout }, "workout");
    const racePayload = buildRaceResultFromWorkout({
      workout,
      goal: match.goal,
      linkedHistoryItemId: saved.id,
    });
    const raceSave = await saveRaceResult(racePayload);
    if (!raceSave.ok) {
      setRaceResultError("บันทึก workout แล้ว แต่บันทึก Race Result ไม่สำเร็จ");
      return;
    }
    setRaceMatch(null);
    setSaveStatus("saved");
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
          onResult={handleAnalysisResult}
        />
        {saveStatus === "saving" && <p className="text-xs font-semibold text-slate-500">กำลังบันทึก...</p>}
        {saveStatus === "saved" && <p className="text-xs font-semibold text-green-600">บันทึกแล้ว</p>}
        {saveStatus === "error" && <p className="text-xs font-semibold text-red-500">บันทึกไม่สำเร็จ กรุณาลองใหม่</p>}
      </section>
      {result && type === "sleep" ? <SleepResultCard result={(result as { data: SleepAnalysis }).data} /> : null}
      {result && type === "meal" ? (
        <MealReviewCard
          initialMeal={(result as { data: MealAnalysis }).data}
          profile={profile}
          context={coachContext}
          onCancel={() => { setResult(null); setSaveStatus("idle"); }}
          onSave={(meal) => void saveMeal(meal)}
        />
      ) : null}
      {result && type === "workout" ? (
        <>
          <WorkoutResultCard result={(result as { data: WorkoutAnalysis }).data} />
          {raceMatch ? (
            <RaceResultConfirmCard
              match={raceMatch}
              workout={(result as { data: WorkoutAnalysis }).data}
              error={raceResultError}
              saving={saveStatus === "saving"}
              onSaveRace={(workout) => void saveAsRaceResult(workout, raceMatch)}
              onWorkoutOnly={(workout) => void saveWorkoutOnly(workout)}
            />
          ) : null}
          <PostRunAnalysisCard workout={(result as { data: WorkoutAnalysis }).data} />
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
}: {
  match: RaceMatch;
  workout: WorkoutAnalysis;
  error: string;
  saving: boolean;
  onSaveRace: (workout: WorkoutAnalysis) => void;
  onWorkoutOnly: (workout: WorkoutAnalysis) => void;
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
      <p className="text-sm font-semibold text-[#17201d]">ต้องการบันทึกเป็น Race Result ไหม?</p>
      {!match.distanceMatches ? (
        <p className="rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-700">
          ระยะทางอาจไม่ตรงกับระยะ race แบบเป๊ะ ๆ ระบบยังให้บันทึกได้ แต่แนะนำตรวจผลก่อนกดบันทึก
        </p>
      ) : null}
      {error ? <p className="rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-600">{error}</p> : null}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button className="btn-primary py-3 text-sm" type="button" disabled={saving} onClick={() => onSaveRace(workout)}>
          บันทึกเป็น Race Result
        </button>
        <button className="btn-secondary py-3 text-sm" type="button" disabled={saving} onClick={() => onWorkoutOnly(workout)}>
          เก็บเป็น Workout ปกติ
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
          <select className="control" value={meal.mealType} onChange={(event) => setMeal((current) => ({ ...current, mealType: event.target.value }))}>
            {(["breakfast", "lunch", "dinner", "snack", "pre-run", "post-run"] as const).map((item) => (
              <option key={item} value={item}>{MEAL_TYPE_LABELS[item]}</option>
            ))}
          </select>
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
