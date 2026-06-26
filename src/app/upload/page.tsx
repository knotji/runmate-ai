"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ImageUploader } from "@/components/ImageUploader";
import { SleepResultCard } from "@/components/SleepResultCard";
import { WorkoutResultCard } from "@/components/WorkoutResultCard";
import { BodyResultCard } from "@/components/BodyResultCard";
import { DataQualityNote } from "@/components/DataQualityNote";
import { normalizeMealSlot, getMealSlotLabel, getMealSlotIcon, type MealSlot } from "@/lib/mealSlots";
import { PostRunAnalysisCard } from "@/components/PostRunAnalysisCard";
import { StrengthWorkoutCard } from "@/components/StrengthWorkoutCard";
import { LoadingButton } from "@/components/LoadingButton";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createHistoryItem, findMealSlotByDateAndType, saveHistoryItems } from "@/lib/cloudHistory";
import { buildMergedMeal, extractMealData, normalizeMealNutrition } from "@/lib/mealMerge";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import { buildRaceResultFromWorkout, detectRaceMatch, getWorkoutLocalDate, loadRaceResults, normalizeLocalDate, saveRaceResult, type RaceMatch } from "@/lib/raceResults";
import type { RaceResult } from "@/types/race";
import { loadActiveRaceGoalAndPlan, markRaceGoalCompleted } from "@/lib/raceStorage";
import { formatCalories, formatMacro, formatNutritionRange } from "@/lib/format";
import { buildNutritionTargetSummary } from "@/lib/nutritionTargets";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { BodyCompositionAnalysis, HealthCheckAnalysis, LabValue, MealAnalysis, MealType, SleepAnalysis, WorkoutAnalysis } from "@/types/logs";
import type { UserProfile } from "@/types/profile";
import { todayBangkokDateKey, yesterdayBangkokDateKey, dateKeyToRecordedAt } from "@/lib/date";

function formatThaiShortDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]) + 543;
  const month = parts[1];
  const day = parts[2];
  return `${day}/${month}/${year}`;
}

function SelectedDateBadge({ dateKey }: { dateKey: string }) {
  const isToday = dateKey === todayBangkokDateKey();
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-100 rounded-2xl px-3.5 py-2 my-2 w-fit">
      <span>จะบันทึกเป็นวันที่: {formatThaiShortDate(dateKey)}</span>
      {!isToday && (
        <span className="rounded-full bg-amber-50 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
          บันทึกย้อนหลัง
        </span>
      )}
    </div>
  );
}


const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1, "มกราคม": 1,
  "ก.พ.": 2, "กุมภาพันธ์": 2,
  "มี.ค.": 3, "มีนาคม": 3,
  "เม.ย.": 4, "เมษายน": 4,
  "พ.ค.": 5, "พฤษภาคม": 5,
  "มิ.ย.": 6, "มิถุนายน": 6,
  "ก.ค.": 7, "กรกฎาคม": 7,
  "ส.ค.": 8, "สิงหาคม": 8,
  "ก.ย.": 9, "กันยายน": 9,
  "ต.ค.": 10, "ตุลาคม": 10,
  "พ.ย.": 11, "พฤศจิกายน": 11,
  "ธ.ค.": 12, "ธันวาคม": 12,
};

function parseExtractedDate(extractedDate: string | null | undefined): string | null {
  if (!extractedDate) return null;
  const cleaned = extractedDate.trim();
  
  // Pattern 1: YYYY-MM-DD
  const yyyymmdd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]) - 1;
    const day = Number(yyyymmdd[3]);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return yyyymmdd[0];
    }
  }

  // Pattern 2: DD/MM/YYYY or DD/MM/BBBB
  const slashPattern = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashPattern) {
    const day = Number(slashPattern[1]);
    const month = Number(slashPattern[2]);
    let year = Number(slashPattern[3]);
    
    // Check if it is Buddhist Era (BE)
    if (year > 2400) {
      year = year - 543;
    }
    
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  // Pattern 3: Thai month names (e.g. 17 มิ.ย. 2569 or 17 มิถุนายน 2569)
  const parts = cleaned.split(/[\s,.-]+/);
  if (parts.length === 3) {
    const day = Number(parts[0]);
    const monthName = parts[1];
    let year = Number(parts[2]);
    const month = THAI_MONTHS[monthName];
    if (day && month && year) {
      if (year > 2400) {
        year = year - 543;
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  // Fallback: standard Date parsing
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  return null;
}

function extractDateFromResult(next: Record<string, unknown> | null | undefined): string | null {
  if (!next) return null;
  const data = (next.data as Record<string, unknown> | undefined) ?? next;
  const extracted = data.extracted as Record<string, unknown> | undefined;
  if (extracted?.date) return String(extracted.date);
  if (data.checkupDate) return String(data.checkupDate);
  if (data.date) return String(data.date);
  return null;
}

function formatDateKeyToThaiBE(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  const year = Number(parts[0]);
  const month = parts[1];
  const day = parts[2];
  const thaiYear = year + 543;
  return `${day}/${month}/${thaiYear}`;
}

type UploadType = "sleep" | "meal" | "workout" | "body" | "health_check";
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
  "rawText",
  "rawPdfText",
  "pdfText",
  "ocrText",
  "rawOcrText",
  "rawResponse",
  "rawHealthText",
  "fileData",
  "fileBuffer",
]);

const UPLOAD_LABELS: Record<UploadType, string> = {
  sleep: "นอน",
  meal: "อาหาร",
  workout: "ซ้อม",
  body: "ร่างกาย",
  health_check: "สุขภาพ",
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
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayBangkokDateKey());
  const [dateSelectionMode, setDateSelectionMode] = useState<"today" | "yesterday" | "custom">("today");
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
  const [strengthInputMode, setStrengthInputMode] = useState<"image" | "manual">("image");
  const [mealInputMode, setMealInputMode] = useState<MealInputMode>("image");
  const [manualMealText, setManualMealText] = useState("");
  const [manualMealNote, setManualMealNote] = useState("");
  const [manualMealError, setManualMealError] = useState("");
  const [manualMealLoading, setManualMealLoading] = useState(false);
  const [existingRaceResults, setExistingRaceResults] = useState<RaceResult[]>([]);
  const [raceDuplicateConfirm, setRaceDuplicateConfirm] = useState<{ workout: WorkoutAnalysis; match: RaceMatch } | null>(null);
  // Meal logs are additive; this ref blocks concurrent saves rather than deduping by day.
  const isSavingMealRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("type") ?? "";
    const aliasMap: Record<string, UploadType> = {
      sleep: "sleep", meal: "meal", workout: "workout", body: "body", health: "health_check", health_check: "health_check",
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
  const suggestedDateKey = result ? parseExtractedDate(extractDateFromResult(result as Record<string, unknown>)) : null;
  const isConfidenceLow = result ? ((((result as Record<string, unknown>)?.data as Record<string, unknown>)?.confidence === "low") || ((result as Record<string, unknown>)?.confidence === "low")) : false;

  useEffect(() => {
    Promise.all([loadProfileFromSupabase(), buildCoachContextFromSupabase(), loadRaceResults(20)]).then(([profileResult, context, raceResultsResult]) => {
      if (profileResult.ok) setProfile(profileResult.profile ?? null);
      setCoachContext(context);
      if (raceResultsResult.ok) setExistingRaceResults(raceResultsResult.results);
    });
  }, []);

  useEffect(() => {
    if (type === "workout" && result && !saveFeedback) {
      const data = (result as { data: WorkoutAnalysis }).data;
      if (data) {
        loadActiveRaceGoalAndPlan().then((raceResult) => {
          const raceGoalForMatch = raceResult.ok ? raceResult.goal : null;
          const match = detectRaceMatch(data, raceGoalForMatch, selectedDateKey);
          setRaceMatch(match);
        });
      }
    } else {
      queueMicrotask(() => setRaceMatch(null));
    }
  }, [selectedDateKey, result, type, saveFeedback]);

  const endpoint =
    type === "sleep"
      ? "/api/analyze-sleep"
      : type === "meal"
        ? "/api/analyze-meal"
        : type === "workout"
          ? "/api/analyze-workout"
          : type === "body"
            ? "/api/analyze-body"
            : "/api/analyze-health-check";

  async function store(next: unknown, overrideType: UploadType = type): Promise<LocalHistoryItem> {
    setSaveStatus("saving");
    if (overrideType === "body") setBodySaveError("");
    const data = sanitizeReportDataForSave((next as { data?: unknown }).data ?? next);
    
    // Always use actual save/upload time as createdAt
    const saveDate = new Date().toISOString();
    const saved = createHistoryItem(overrideType, data, saveDate);
    
    // Assign manual backdate keys based on the user's selection
    saved.recordedAt = dateKeyToRecordedAt(selectedDateKey);
    saved.dateKey = selectedDateKey;
    if (process.env.NODE_ENV === "development") {
      console.info("[upload-debug]", {
        uploadType: overrideType,
        saveTable: "history_items",
        historyItemId: saved.id,
        dateKey: saved.dateKey,
        recordedAt: saved.recordedAt,
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
    setRaceDuplicateConfirm(null);

    // If API/extraction returns date, suggest it to the user, but never auto-apply it without confirmation.
    const suggestedDate = parseExtractedDate(extractDateFromResult(next as Record<string, unknown>));
    if (suggestedDate) {
      if (type === "meal") {
        const data = ((next as { data?: MealAnalysis }).data ?? next) as MealAnalysis;
        const meal = normalizeMealAnalysis({ ...data, mealType });
        setResult({ data: meal });
      } else if (type === "workout") {
        const data = ((next as { data?: WorkoutAnalysis }).data ?? next) as WorkoutAnalysis;
        setResult({ data });
      } else {
        setResult(next);
      }
      setSaveStatus("idle");
      return;
    }

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
      const todayBangkok = selectedDateKey;
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
    if (isSavingMealRef.current) return;
    isSavingMealRef.current = true;
    try {
      const localDate = selectedDateKey;
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
    } finally {
      isSavingMealRef.current = false;
    }
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
    const localDate = selectedDateKey;

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
    updatedMeal.mealSlot = normalizeMealSlot(updatedMeal.mealType);

    // Store as direct MealAnalysis — same shape as initial save, so report page reads it correctly.
    const updatedItem = {
      ...existing,
      recordedAt: existing.recordedAt || dateKeyToRecordedAt(selectedDateKey),
      dateKey: existing.dateKey || selectedDateKey,
      data: sanitizeReportDataForSave(updatedMeal)
    };

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
    setStrengthInputMode("image");
    if (nextType !== "meal") setMealInputMode("image");
    setResult(null);
    setSaveStatus("idle");
    setRaceMatch(null);
    setRaceResultError("");
    setMealSlotConflict(null);
    setWorkoutSavedItem(null);
    setSaveFeedback("");
    setRaceDuplicateConfirm(null);
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
    // Warn if a race result with the same date + distance already exists.
    const duplicate = existingRaceResults.find(
      (r) => r.raceDate === match.workoutDate && r.raceDistance === match.goal.raceDistance,
    );
    if (duplicate) {
      setRaceDuplicateConfirm({ workout, match });
      return;
    }
    await performRaceResultSave(workout, match);
  }

  async function performRaceResultSave(workout: WorkoutAnalysis, match: RaceMatch) {
    setRaceDuplicateConfirm(null);
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
    <AppShell title="เพิ่มข้อมูล" subtitle="อัปโหลดหรือลงบันทึก เพื่อให้โค้ชเข้าใจวันนี้มากขึ้น">
      <section className="card space-y-3 p-5">
        <p className="text-xs leading-5 text-slate-500">
          เมื่อวิเคราะห์และกดบันทึก ข้อมูลจะเข้า Report เพื่อให้โค้ชตอบได้แม่นขึ้น
        </p>
        <div className="grid grid-cols-5 gap-2">
          {(["sleep", "meal", "workout", "body", "health_check"] as UploadType[]).map((item) => (
            <button key={item} className={`rounded-2xl px-3 py-3 text-sm font-bold ${type === item ? "bg-[var(--primary)] text-white shadow-sm" : "bg-[var(--surface-muted)] text-[var(--muted-text)]"}`} onClick={() => selectUploadType(item)}>
              {UPLOAD_LABELS[item]}
            </button>
          ))}
        </div>

        {/* Shared Date Selector */}
        <div className="space-y-2 pt-2 border-t border-slate-100/60">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">วันที่ของข้อมูลนี้</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-[var(--surface-muted)] p-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setDateSelectionMode("today");
                  setSelectedDateKey(todayBangkokDateKey());
                }}
                className={`rounded-lg px-3 py-1.5 transition-colors ${dateSelectionMode === "today" ? "bg-white text-[#17201d] shadow-sm" : "text-[var(--muted-text)]"}`}
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateSelectionMode("yesterday");
                  setSelectedDateKey(yesterdayBangkokDateKey());
                }}
                className={`rounded-lg px-3 py-1.5 transition-colors ${dateSelectionMode === "yesterday" ? "bg-white text-[#17201d] shadow-sm" : "text-[var(--muted-text)]"}`}
              >
                เมื่อวาน
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateSelectionMode("custom");
                }}
                className={`rounded-lg px-3 py-1.5 transition-colors ${dateSelectionMode === "custom" ? "bg-white text-[#17201d] shadow-sm" : "text-[var(--muted-text)]"}`}
              >
                เลือกวันที่
              </button>
            </div>
            {dateSelectionMode === "custom" && (
              <input
                type="date"
                className="control text-xs py-1.5 px-2.5 max-w-[140px]"
                value={selectedDateKey}
                onChange={(e) => setSelectedDateKey(e.target.value)}
                required
              />
            )}
          </div>
          <p className="text-[10px] text-slate-500">ถ้าอัปโหลดข้อมูลย้อนหลัง ให้เลือกวันที่จริงของข้อมูล</p>
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
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {(["run", "strength", "walk", "other"] as const).map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => {
                    setWorkoutSubtype(sub);
                    setStrengthInputMode("image");
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
            {/* Strength: image upload vs manual routine tabs */}
            {workoutSubtype === "strength" && (
              <div className="grid grid-cols-2 rounded-2xl bg-[var(--surface-muted)] p-1">
                {(["image", "manual"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setStrengthInputMode(mode);
                      setResult(null);
                      setSaveStatus("idle");
                      setSaveFeedback("");
                    }}
                    className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                      strengthInputMode === mode ? "bg-white text-[#17201d] shadow-sm" : "text-[var(--muted-text)]"
                    }`}
                  >
                    {mode === "image" ? "🖼️ อัปโหลดรูป" : "📝 บันทึกด้วยตัวเอง"}
                  </button>
                ))}
              </div>
            )}
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
        {type === "health_check" ? (
          <>
            <HealthCheckUploader
              saving={saveStatus === "saving"}
              onResult={(healthCheck) => {
                setResult({ data: healthCheck });
                setSaveStatus("idle");
              }}
            />
            {!result && saveStatus !== "saving" && <UploadEmptyGuide type={type} />}
          </>
        ) : null}
        {/* Image uploader: show for all types EXCEPT walk/other workout manual, manual meal, health_check, and strength-manual mode */}
        {!(type === "workout" && (workoutSubtype === "walk" || workoutSubtype === "other")) &&
         !(type === "workout" && workoutSubtype === "strength" && strengthInputMode === "manual") &&
         !(type === "meal" && mealInputMode === "text") &&
         type !== "health_check" ? (
          <>
            <ImageUploader
              key={type + (type === "workout" ? `-${workoutSubtype}-${strengthInputMode}` : "")}
              kind={type}
              endpoint={endpoint}
              maxFiles={type === "meal" ? 1 : type === "sleep" ? 3 : 4}
              extraFields={{
                ...(type === "meal" ? { mealType } : {}),
                ...(type === "workout" ? { workoutSubtype } : {}),
                profile,
                context: coachContext,
              }}
              onResult={handleAnalysisResult}
            />
            {saveStatus === "saving" && <p className="text-xs font-semibold text-slate-500">กำลังบันทึก...</p>}
            {saveStatus === "saved" && <p className="text-xs font-semibold text-[var(--status-ready)]">บันทึกเข้า Report แล้ว</p>}
            {saveStatus === "error" && <p className="text-xs font-semibold text-[var(--status-rest)]">บันทึกไม่สำเร็จ กรุณาลองใหม่</p>}
            {!result && saveStatus !== "saving" && <UploadEmptyGuide type={type} workoutSubtype={workoutSubtype === "strength" ? "strength" : undefined} />}
          </>
        ) : null}
      </section>

      {/* ── AI-Suggested Date Confirmation ── */}
      {suggestedDateKey && (
        <div className="card border border-amber-200 bg-amber-50/70 p-4 rounded-3xl space-y-2 mb-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-700 leading-relaxed font-semibold">
              📅 วันที่ที่อ่านได้จากไฟล์: {formatDateKeyToThaiBE(suggestedDateKey)}
            </p>
            {selectedDateKey !== suggestedDateKey ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedDateKey(suggestedDateKey);
                  setDateSelectionMode("custom");
                }}
                className="rounded-full bg-white border border-amber-300 px-3.5 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-100 transition shadow-sm"
              >
                ใช้วันที่นี้
              </button>
            ) : (
              <span className="rounded-full bg-amber-200/80 px-3 py-1.5 text-xs font-bold text-amber-800">
                จะบันทึกเป็นวันที่: {formatDateKeyToThaiBE(selectedDateKey)}
              </span>
            )}
          </div>
          {isConfidenceLow && (
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              ⚠️ วันที่ที่อ่านได้อาจคลาดเคลื่อน กรุณาตรวจทานก่อนใช้
            </p>
          )}
        </div>
      )}

      {/* Strength manual routine flow */}
      {type === "workout" && workoutSubtype === "strength" && strengthInputMode === "manual" && (
        <div className="space-y-4">
          <SelectedDateBadge dateKey={selectedDateKey} />
          <StrengthWorkoutCard
            context={coachContext}
            selectedDateKey={selectedDateKey}
            onLogCompleted={() => {
              setSaveStatus("saved");
              setTimeout(() => setSaveStatus("idle"), 3000);
            }}
          />
        </div>
      )}

      {type === "workout" && (workoutSubtype === "walk" || workoutSubtype === "other") && (
        <div className="space-y-4">
          <SelectedDateBadge dateKey={selectedDateKey} />
          <ManualWorkoutLogForm
            subtype={workoutSubtype}
            saving={saveStatus === "saving"}
            onSave={handleManualWorkoutSave}
            defaultDate={selectedDateKey}
          />
        </div>
      )}

      {result && type === "sleep" ? (
        <>
          <SelectedDateBadge dateKey={selectedDateKey} />
          <ReportSavedNote saveStatus={saveStatus} />
          <SleepResultCard result={(result as { data: SleepAnalysis }).data} />
          {saveStatus === "idle" && (
            <div className="card p-4 bg-slate-50 flex items-center justify-between gap-3 mt-4">
              <p className="text-sm font-semibold text-slate-600">กดยืนยันเพื่อบันทึก Sleep</p>
              <button
                type="button"
                onClick={() => void store(result)}
                className="rounded-full bg-[#17201d] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#2c3d38]"
              >
                บันทึกผลการนอน
              </button>
            </div>
          )}
        </>
      ) : null}
      {result && type === "meal" && !mealSlotConflict ? (
        <MealReviewCard
          initialMeal={(result as { data: MealAnalysis }).data}
          profile={profile}
          context={coachContext}
          saving={saveStatus === "saving"}
          selectedDateKey={selectedDateKey}
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
          <SelectedDateBadge dateKey={selectedDateKey} />
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
          {raceMatch && !saveFeedback && !raceDuplicateConfirm ? (
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
          {raceDuplicateConfirm ? (
            <RaceDuplicateWarnCard
              workout={raceDuplicateConfirm.workout}
              match={raceDuplicateConfirm.match}
              saving={saveStatus === "saving"}
              onConfirm={(w, m) => void performRaceResultSave(w, m)}
              onCancel={() => setRaceDuplicateConfirm(null)}
            />
          ) : null}
          {!raceMatch && <PostRunAnalysisCard workout={(result as { data: WorkoutAnalysis }).data} />}
          {!raceMatch && !saveFeedback && saveStatus !== "saved" && (
            <div className="card p-5 space-y-2 mt-4">
              <LoadingButton
                type="button"
                loading={saveStatus === "saving"}
                loadingText="กำลังบันทึก..."
                disabled={isWorkoutSaveDisabled((result as { data: WorkoutAnalysis }).data, saveStatus)}
                onClick={() => void saveWorkoutOnly((result as { data: WorkoutAnalysis }).data)}
                className="btn-primary w-full py-3 text-sm disabled:opacity-60"
              >
                {getWorkoutSaveBtnLabel((result as { data: WorkoutAnalysis }).data.extracted?.workoutKind)}
              </LoadingButton>
              {saveStatus === "error" && (
                <p className="text-center text-xs font-semibold text-[var(--status-rest)]">
                  บันทึกไม่สำเร็จ กรุณาลองใหม่
                </p>
              )}
            </div>
          )}
        </>
      ) : null}
      {result && type === "body" ? (
        <>
          <SelectedDateBadge dateKey={selectedDateKey} />
          <BodyResultCard result={(result as { data: BodyCompositionAnalysis }).data} />
          <BodySaveBar saveStatus={saveStatus} saveError={bodySaveError} onSave={() => void store(result)} />
        </>
      ) : null}
      {result && type === "health_check" ? (
        <HealthCheckReviewCard
          healthCheck={(result as { data: HealthCheckAnalysis }).data}
          saveStatus={saveStatus}
          saving={saveStatus === "saving"}
          selectedDateKey={selectedDateKey}
          onCancel={() => {
            setResult(null);
            setSaveStatus("idle");
          }}
          onSave={() => void store(result, "health_check")}
        />
      ) : null}
    </AppShell>
  );
}

function UploadEmptyGuide({
  type,
  workoutSubtype,
}: {
  type: UploadType;
  workoutSubtype?: string;
}) {
  if (type === "meal") {
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-bold text-[#17201d]">ลองอัปโหลดเพื่อสร้าง Report</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">บันทึกอาหารเพื่อวิเคราะห์โภชนาการและพลังงาน</p>
        <div className="mt-2 space-y-1.5 text-xs leading-5">
          <p><span className="font-semibold text-slate-700">รูปอาหาร</span> — กินไปกี่อย่าง / คร่าว ๆ ได้ไหม</p>
          <p><span className="font-semibold text-slate-700">ฉลากโภชนาการ</span> — kcal / โปรตีน / คาร์บ</p>
          <p><span className="font-semibold text-slate-700">เมนูหรือใบเสร็จ</span> — ช่วยประเมินมื้ออาหาร</p>
        </div>
      </div>
    );
  }
  if (type === "workout") {
    if (workoutSubtype === "strength") {
      return (
        <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
          <p className="font-bold text-[#17201d]">🏋️ อัปโหลดรูปผลเวทเทรนนิ่ง</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            AI จะอ่านข้อมูลจากรูป เช่น ระยะเวลา แคลอรี่ HR และท่าออกกำลังกาย (ถ้ามี)
          </p>
          <div className="mt-2 space-y-1.5 text-xs leading-5">
            <p><span className="font-semibold text-slate-700">รูปสรุป Strength session</span> — Garmin, Apple Watch, Polar</p>
            <p><span className="font-semibold text-slate-700">รูป Gym app</span> — Strong, Hevy, Fitbod หรือแอปอื่น ๆ</p>
            <p><span className="font-semibold text-slate-700">รูปสรุปทั่วไป</span> — ระยะเวลา / แคลอรี่ / HR ก็เพียงพอ</p>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            🛡️ ไม่จำเป็นต้องมีระยะทางหรือ pace — บันทึกเฉพาะ structured data ไม่บันทึกรูปต้นฉบับ
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-bold text-[#17201d]">🏃 อัปโหลดรูปผลการออกกำลังกาย</p>
        <p className="mt-1 text-xs leading-5 text-slate-500"> AI จะอ่านข้อมูลจากรูปวิ่งหรือกิจกรรมอื่น ๆ และประเมินความหนักเพื่อช่วยโค้ชวางแผน</p>
        <div className="mt-2 space-y-1.5 text-xs leading-5">
          <p><span className="font-semibold text-slate-700">รูปผลวิ่ง</span> — ระยะ / เวลา / pace / HR</p>
          <p><span className="font-semibold text-slate-700">รูปเวท</span> — ระยะเวลา / HR / calories / ท่าที่เล่น</p>
          <p><span className="font-semibold text-slate-700">รูปกิจกรรมอื่น</span> — สรุปเป็นบันทึกการออกกำลังกาย</p>
        </div>
      </div>
    );
  }
  if (type === "sleep") {
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-bold text-[#17201d]">😴 อัปโหลดข้อมูลการนอนเพื่อประเมินความพร้อม</p>
        <p className="mt-1 text-xs leading-5 text-slate-500"> AI จะอ่านข้อมูลสรุปการนอนและคะแนนฟื้นตัวเพื่อประเมินความพร้อมซ้อมวันนี้</p>
        <div className="mt-2 space-y-1.5 text-xs leading-5">
          <p><span className="font-semibold text-slate-700">รูปการนอน</span> — duration / sleep score / HRV</p>
          <p><span className="font-semibold text-slate-700">รูป Energy score</span> — readiness / recovery</p>
        </div>
      </div>
    );
  }
  if (type === "body") {
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-bold text-[#17201d]">⚖️ อัปโหลดค่าร่างกายเพื่อสร้าง Report</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">บันทึกแนวโน้มน้ำหนัก ไขมัน กล้ามเนื้อ เพื่อให้โค้ชวิเคราะห์ได้</p>
        <div className="mt-2 space-y-1.5 text-xs leading-5">
          <p><span className="font-semibold text-slate-700">รูปชั่งน้ำหนัก</span> — น้ำหนัก / ไขมัน / กล้ามเนื้อ</p>
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
  if (type === "health_check") {
    return (
      <div className="rounded-2xl bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        <p className="font-bold text-[#17201d]">🩺 อัปโหลด PDF ผลตรวจสุขภาพ</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          ระบบจะอ่านค่าเลือดที่เกี่ยวกับโภชนาการและ recovery และบันทึกเฉพาะค่าที่สรุปแล้ว
        </p>
        <div className="mt-2 space-y-1.5 text-xs leading-5">
          <p><span className="font-semibold text-slate-700">PDF/รูปผลตรวจ</span> — ใช้เป็นบริบทอาหารและไลฟ์สไตล์แบบระวัง</p>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-slate-400">
          🛡️ ระบบบันทึกเฉพาะค่าที่สรุปแล้ว ไม่บันทึกไฟล์ PDF ต้นฉบับหรือข้อความดิบ
        </p>
      </div>
    );
  }
  return null;
}


function ReportSavedNote({ saveStatus }: { saveStatus: "idle" | "saving" | "saved" | "error" }) {
  return (
    <section className="rounded-3xl border border-slate-100 bg-white/75 px-4 py-3 text-xs leading-5 text-slate-500 shadow-sm">
      {saveStatus === "saved" ? (
        <span className="font-bold text-green-700">บันทึกเข้า Report แล้ว</span>
      ) : (
        <span className="font-bold text-slate-700">ผลวิเคราะห์</span>
      )}
      <span> ข้อมูลนี้ถูกบันทึกเป็น structured data เท่านั้น รูปต้นฉบับไม่ถูกเก็บถาวร</span>
    </section>
  );
}

function getWorkoutSaveBtnLabel(kind?: string | null): string {
  if (kind === "strength") return "บันทึกเวทลง Report";
  if (kind === "outdoor_run" || kind === "treadmill") return "บันทึกผลวิ่งลง Report";
  return "บันทึกลง Report";
}

function isWorkoutSaveDisabled(workout: WorkoutAnalysis, saveStatus: string): boolean {
  if (saveStatus === "saving") return true;
  const ext = workout.extracted;
  if (!ext) return true;
  if (ext.workoutKind === "strength") {
    const hasDuration = !!ext.duration;
    const hasTitle = !!workout.coach?.workoutSummary;
    const hasCalories = ext.calories != null && ext.calories > 0;
    const hasAvgHR = ext.avgHR != null && ext.avgHR > 0;
    const hasExercises = Array.isArray(ext.exercises) && ext.exercises.length > 0;
    const hasMuscleGroups = Array.isArray(ext.muscleGroups) && ext.muscleGroups.length > 0;
    return !(hasDuration || hasTitle || hasCalories || hasAvgHR || hasExercises || hasMuscleGroups);
  }
  return false;
}

function HealthCheckUploader({
  saving,
  onResult,
}: {
  saving: boolean;
  onResult: (healthCheck: HealthCheckAnalysis) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function analyze() {
    if (!file) {
      setError("กรุณาเลือกไฟล์ PDF ผลตรวจสุขภาพก่อน");
      return;
    }
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("ไฟล์นี้ยังไม่รองรับ ลองเลือก PDF ผลตรวจสุขภาพอีกครั้ง");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("ไฟล์ใหญ่เกินไป กรุณาใช้ PDF ไม่เกิน 8 MB");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/analyze-health-check", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null) as { data?: HealthCheckAnalysis; message?: string } | null;
      if (!response.ok || !payload?.data) {
        setError(payload?.message || "อ่านผลตรวจสุขภาพไม่สำเร็จ ลองเลือกไฟล์ใหม่อีกครั้ง");
        return;
      }
      onResult(payload.data);
    } catch {
      setError("อ่านผลตรวจสุขภาพไม่สำเร็จ ลองเลือกไฟล์ใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl bg-slate-50/80 p-4">
      <div>
        <h3 className="text-base font-bold text-[#17201d]">Health Check PDF</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          อัปโหลดผลตรวจสุขภาพประจำปีเพื่อให้โค้ชใช้ประกอบคำแนะนำอาหารและ recovery
        </p>
        <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-xs leading-5 text-slate-500">
          ระบบจะอ่านเฉพาะค่าที่จำเป็น และบันทึกเฉพาะ structured summary
        </p>
      </div>

      <label
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors ${
          file
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--border-warm)] bg-[var(--surface-muted)] hover:border-[var(--primary)]/60 hover:bg-[var(--surface)]"
        }`}
        aria-label="อัปโหลดไฟล์ผลตรวจสุขภาพ"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="application/pdf,.pdf"
          disabled={loading || saving}
          onChange={(event) => {
            setError("");
            const selectedFile = event.target.files?.[0] ?? null;
            if (selectedFile) {
              if (!selectedFile.type.includes("pdf") && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
                setError("ไฟล์นี้ยังไม่รองรับ ลองเลือก PDF ผลตรวจสุขภาพอีกครั้ง");
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              } else {
                setFile(selectedFile);
              }
            }
          }}
        />
        {!file ? (
          <>
            <span className="text-3xl">📄</span>
            <p className="text-sm font-semibold text-[var(--foreground)]">กดเพื่อเลือกไฟล์ผลตรวจ</p>
            <p className="text-xs text-[var(--muted-text)]">รองรับ PDF ผลตรวจสุขภาพ</p>
          </>
        ) : (
          <>
            <span className="text-3xl">✅</span>
            <p className="text-sm font-semibold text-[var(--foreground)]">เลือกแล้ว: {file.name}</p>
            <p className="text-xs text-[var(--muted-text)]">{Math.round(file.size / 1024)} KB</p>
          </>
        )}
      </label>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600">{error}</p> : null}
      
      <LoadingButton
        type="button"
        className="btn-primary w-full py-3 text-sm"
        loading={loading}
        loadingText="กำลังอ่าน PDF..."
        onClick={() => void analyze()}
        disabled={saving}
      >
        วิเคราะห์ผลตรวจสุขภาพ
      </LoadingButton>
      <p className="text-xs leading-5 text-slate-400">
        คำแนะนำจากผลตรวจเป็นแนวทางทั่วไป ไม่ใช่การวินิจฉัยหรือการรักษา หากมีค่าผิดปกติควรปรึกษาแพทย์
      </p>
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

function HealthCheckReviewCard({
  healthCheck,
  saveStatus,
  saving,
  selectedDateKey,
  onSave,
  onCancel,
}: {
  healthCheck: HealthCheckAnalysis;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saving: boolean;
  selectedDateKey: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const allLabs = getVisibleHealthLabs(healthCheck);

  const warningLabs = allLabs.filter(([key, lab]) => {
    if (key === "hdl") return lab.status === "low";
    return lab.status === "high" || lab.status === "low" || lab.status === "borderline";
  });

  const normalLabs = allLabs.filter(([key, lab]) => {
    if (key === "hdl") return lab.status === "normal" || lab.status === "high";
    return lab.status === "normal";
  });

  const isMissingLabs = !healthCheck.labs?.hba1c || !healthCheck.labs?.egfr;

  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Health Check Review</p>
        <h2 className="mt-2 text-xl font-bold text-[#17201d]">ตรวจทานก่อนบันทึก</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          ระบบบันทึกเฉพาะค่าที่สรุปแล้ว ไม่บันทึกไฟล์ PDF ต้นฉบับหรือข้อความดิบ
        </p>
        <SelectedDateBadge dateKey={selectedDateKey} />
      </div>

      <div className="rounded-2xl bg-blue-50 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-[#17201d] text-base">ผลตรวจสุขภาพล่าสุด</h3>
            <p className="mt-0.5 text-xs text-[#42677f] font-semibold">ใช้เพื่อช่วยปรับคำแนะนำอาหารและไลฟ์สไตล์</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{healthCheck.checkupDate ?? "ไม่พบวันที่ตรวจ"}</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-[#42677f]">{healthCheck.confidence ?? "low"}</span>
        </div>

        <div className="mt-4 space-y-3">
          {/* ควรระวัง */}
          <div className="rounded-xl bg-white/70 p-3 ring-1 ring-slate-100">
            <p className="text-xs font-bold text-amber-800">⚠️ ควรระวัง</p>
            {warningLabs.length > 0 ? (
              <ul className="mt-1.5 list-disc pl-4 space-y-1 text-sm text-[#17201d]">
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
            <p className="text-xs font-bold text-[#42677f]">🥗 โภชนาการที่เหมาะ</p>
            {(healthCheck.foodGuidance?.prefer?.length || healthCheck.foodGuidance?.limit?.length) ? (
              <ul className="mt-1.5 list-disc pl-4 space-y-1 text-sm text-slate-700 font-medium">
                {healthCheck.foodGuidance.prefer?.map((item, idx) => (
                  <li key={`pref-${idx}`}>เพิ่ม/เน้น {item}</li>
                ))}
                {healthCheck.foodGuidance.limit?.map((item, idx) => (
                  <li key={`lim-${idx}`}>ลด/เลี่ยง {item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-slate-500 italic">ไม่มีข้อมูลคำแนะนำโภชนาการ</p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <DataQualityNote confidence={healthCheck.confidence} unclearFields={healthCheck.unclearFields} source="health_check" />
        </div>

        {isMissingLabs && (
          <div className="mt-3 rounded-2xl bg-blue-100/50 px-3 py-2 text-xs leading-5 text-slate-600">
            ℹ️ ยังไม่มีค่าบางรายการ เช่น HbA1c หรือ eGFR หากต้องการให้คำแนะนำแม่นขึ้น สามารถเพิ่มผลตรวจรอบถัดไปได้
          </div>
        )}

        {allLabs.length > 0 ? (
          <details className="mt-4 border-t border-slate-200/60 pt-3">
            <summary className="cursor-pointer text-xs font-bold text-[#42677f] hover:underline focus:outline-none select-none">
              ดูค่าตรวจทั้งหมด ({allLabs.length} รายการ)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {allLabs.map(([key, lab]) => (
                <HealthLabMetric key={key} lab={lab} />
              ))}
            </div>
          </details>
        ) : null}
      </div>

      <p className="rounded-2xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
        {healthCheck.disclaimer || "ข้อมูลนี้ใช้เพื่อช่วยปรับคำแนะนำอาหารและไลฟ์สไตล์ ไม่ใช่การวินิจฉัยโรค หากมีค่าผิดปกติควรปรึกษาแพทย์"}
      </p>

      {saveStatus === "saved" ? (
        <div className="space-y-2 text-center">
          <p className="text-sm font-bold text-[var(--status-ready)]">บันทึกเข้า Report แล้ว</p>
          <Link href="/logs" className="block text-xs font-semibold text-[var(--primary-strong)] underline underline-offset-2">
            ดูใน Report →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <LoadingButton type="button" className="btn-primary py-3 text-sm" loading={saving} loadingText="กำลังบันทึก..." onClick={onSave}>
            บันทึกเข้า Report
          </LoadingButton>
          <button type="button" disabled={saving} className="rounded-full bg-slate-50 py-3 text-sm font-bold text-slate-500 disabled:opacity-50" onClick={onCancel}>
            ยกเลิก
          </button>
        </div>
      )}
      {saveStatus === "error" ? <p className="text-center text-xs font-semibold text-[var(--status-rest)]">บันทึกไม่สำเร็จ กรุณาลองใหม่</p> : null}
    </section>
  );
}

function HealthLabMetric({ lab }: { lab: LabValue }) {
  const color =
    lab.status === "high" ? "text-amber-700" :
    lab.status === "low" ? "text-blue-700" :
    lab.status === "borderline" ? "text-amber-600" :
    "text-[#17201d]";
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{lab.label}</p>
      <p className={`mt-1 font-bold ${color}`}>{formatHealthLabValue(lab)}</p>
      {lab.ref ? <p className="mt-1 text-[11px] text-slate-400">ref {lab.ref}</p> : null}
    </div>
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
      <div className="my-2">
        <DataQualityNote source="race_result" />
      </div>
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

function RaceDuplicateWarnCard({
  workout,
  match,
  saving,
  onConfirm,
  onCancel,
}: {
  workout: WorkoutAnalysis;
  match: RaceMatch;
  saving: boolean;
  onConfirm: (workout: WorkoutAnalysis, match: RaceMatch) => void;
  onCancel: () => void;
}) {
  return (
    <section className="card space-y-3 border border-amber-200 bg-amber-50 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-600">บันทึกซ้ำ?</p>
        <h2 className="mt-2 text-xl font-bold text-[#17201d]">รายการนี้ดูเหมือนบันทึกแล้ว</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          มีผลแข่งระยะนี้ในวันเดียวกันอยู่แล้ว ต้องการบันทึกซ้ำอีกครั้งไหม?
        </p>
        <p className="mt-1 text-xs text-slate-500">{match.goal.raceName} · {match.goal.raceDistance} · {match.workoutDate}</p>
      </div>
      <div className="space-y-2">
        <LoadingButton
          className="btn-primary w-full py-3 text-sm"
          type="button"
          loading={saving}
          loadingText="กำลังบันทึก..."
          onClick={() => onConfirm(workout, match)}
        >
          บันทึกซ้ำ
        </LoadingButton>
        <button
          className="w-full rounded-full py-2.5 text-sm text-slate-400"
          type="button"
          disabled={saving}
          onClick={onCancel}
        >
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
  selectedDateKey,
  onSave,
  onCancel,
}: {
  initialMeal: MealAnalysis;
  profile: UserProfile | null;
  context: CoachContext | null;
  saving: boolean;
  selectedDateKey: string;
  onSave: (meal: MealAnalysis) => void;
  onCancel: () => void;
}) {
  const [editing, setEditing] = useState(initialMeal.needsReview);
  const [meal, setMeal] = useState<MealAnalysis>(initialMeal);
  const foodText = meal.detectedFoods.map((food) => food.name).join(", ");
  const cannotEstimateNutrition = meal.detectedFoods.length > 0 && !hasAnyNutrition(meal);
  const isTextEstimate = meal.inputMode === "text";
  const currentSlot = meal.mealSlot || normalizeMealSlot(meal.mealType || "meal", meal.createdAt || selectedDateKey);

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
        <SelectedDateBadge dateKey={selectedDateKey} />

        {/* ช่วงเวลาของมื้อนี้ */}
        <div className="space-y-1.5 my-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">ช่วงเวลาของมื้อนี้</span>
          <div className="flex flex-wrap gap-1.5">
            {(["breakfast", "lunch", "dinner", "snack", "other"] as MealSlot[]).map((slot) => {
              const label = getMealSlotLabel(slot);
              const icon = getMealSlotIcon(slot);
              const isSelected = currentSlot === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    setMeal((current) => ({
                      ...current,
                      mealSlot: slot,
                      mealType: label,
                    }));
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${
                    isSelected
                      ? "bg-[var(--primary)] text-white shadow-sm font-bold"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span>{icon}</span> <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-1 text-xs leading-5 text-amber-700">
          {isTextEstimate
            ? "ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากข้อความที่กรอก อาจคลาดเคลื่อนได้"
            : "ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากรูปอาหาร อาจคลาดเคลื่อนได้"}
        </p>
      </div>

      {editing ? (
        <div className="space-y-3">
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
              อ่านอาหารได้ แต่ประเมินโภชนาการไม่ได้ชัดเจน คุณกรอกเองได้
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
        <p className="text-xs font-semibold text-slate-400">
          {getMealSlotLabel(meal.mealSlot || normalizeMealSlot(meal.mealType, meal.createdAt))}
        </p>
        <p className="text-lg font-bold text-[#17201d]">{foods}</p>
        {isTextEstimate && meal.originalMealText ? (
          <p className="mt-1 text-xs leading-5 text-slate-500">จากข้อความ: {meal.originalMealText}</p>
        ) : null}
      </div>
      <DataQualityNote confidence={meal.confidence} unclearFields={meal.unclearFields} source="meal" compact />
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
          อ่านอาหารได้ แต่ประเมินโภชนาการไม่ได้ชัดเจน คุณกรอกเองได้
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
      <p className="text-center text-xs text-slate-400">บันทึกเฉพาะข้อมูลที่สรุปแล้ว รูปต้นฉบับไม่ถูกเก็บ</p>
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
  const inputMode = meal.inputMode || "image";
  const sourceType = inputMode === "text" ? "manual" : "image";
  const detectedFoods = normalizeDetectedFoods(meal.detectedFoods, legacyFood, meal.inputMode);
  const imageCount = inputMode === "text" ? 0 : (meal.imageCount ?? meal.entries?.length ?? 1);
  const itemCount = detectedFoods.length;

  return {
    mealType: meal.mealType || "meal",
    mealSlot: normalizeMealSlot(meal.mealSlot || meal.mealType, meal.createdAt),
    inputMode,
    sourceType,
    imageCount,
    itemCount,
    originalMealText: meal.originalMealText,
    note: meal.note,
    detectedFoods,
    nutrition,
    nutritionRange: ranges,
    trainingFit,
    confidence: meal.confidence ?? "low",
    unclearFields: Array.isArray(meal.unclearFields) ? meal.unclearFields : [],
    needsReview: meal.needsReview ?? true,
    errorLikeMessage: meal.errorLikeMessage ?? null,
    createdAt: meal.createdAt,
  } as MealAnalysis;
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

function getVisibleHealthLabs(healthCheck: HealthCheckAnalysis): [string, LabValue][] {
  const preferredOrder: (keyof HealthCheckAnalysis["labs"])[] = [
    "fbs",
    "hba1c",
    "totalCholesterol",
    "triglyceride",
    "ldl",
    "hdl",
    "uricAcid",
    "bun",
    "creatinine",
    "egfr",
    "sgotAst",
    "sgptAlt",
  ];
  const labs = healthCheck.labs ?? {};
  const ordered = preferredOrder
    .map((key) => [key, labs[key]] as [string, LabValue | undefined])
    .filter((entry): entry is [string, LabValue] => Boolean(entry[1]?.label || entry[1]?.value != null));
  const extra = Object.entries(labs)
    .filter(([key, lab]) => !preferredOrder.includes(key as keyof HealthCheckAnalysis["labs"]) && Boolean(lab?.label || lab?.value != null)) as [string, LabValue][];
  return [...ordered, ...extra].slice(0, 12);
}


function formatHealthLabValue(lab: LabValue): string {
  const value = lab.value == null || lab.value === "" ? "-" : String(lab.value);
  return lab.unit ? `${value} ${lab.unit}` : value;
}

// ── Meal slot helpers ───────────────────────────────────────────────────────


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
  saving,
  defaultDate
}: {
  subtype: "walk" | "other";
  onSave: (workout: WorkoutAnalysis) => void;
  saving: boolean;
  defaultDate: string;
}) {

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
        date: defaultDate,
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
        <input type="date" className="control" value={defaultDate} required disabled />
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
