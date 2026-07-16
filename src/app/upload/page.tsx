"use client";

import { useState, useEffect, useRef, type FormEvent } from "react";
import { useRouter } from "next/navigation";
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
import { fileToDataUrl } from "@/lib/storage";
import { compressImage } from "@/lib/images/compressImage";
import { DRAFT_MEAL_KEY, type DraftMeal } from "@/components/NextMealCard";
import type { UploadType, WorkoutSubtype, MealInputMode } from "@/lib/upload/uploadTypes";
import { classifyIntake, type IntakeCategory, type IntakeClassification } from "@/lib/upload/classifyIntake";
import { DRAFT_INTAKE_NOTE_KEY } from "@/lib/upload/draftIntakeNote";
import { normalizeMealFoodQuantities } from "@/lib/upload/normalizeMealFoodQuantities";
import {
  formatThaiShortDate,
  formatDateKeyToThaiBE,
  parseExtractedDate,
  extractDateFromResult,
  IMAGE_REPORT_KEYS,
  UPLOAD_LABELS,
  UPLOAD_DASHBOARD_META,
  WORKOUT_SUBTYPE_HELPER,
  MEAL_TYPE_LABELS,
  CONFIDENCE_LABELS,
} from "@/lib/upload/uploadConstants";
import { StatusHero } from "@/components/ui/StatusHero";
import { DetailAccordion } from "@/components/ui/DetailAccordion";
import { PrimaryCTA, SecondaryCTA } from "@/components/ui/ActionButton";
import { cn } from "@/lib/cn";

function SelectedDateBadge({ dateKey }: { dateKey: string }) {
  const isToday = dateKey === todayBangkokDateKey();
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-[var(--muted-text)] bg-[var(--surface-muted)] border border-[var(--color-border-soft)] rounded-2xl px-3.5 py-2 my-2 w-fit">
      <span>จะบันทึกเป็นวันที่: {formatThaiShortDate(dateKey)}</span>
      {!isToday && (
        <span className="rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning)] px-2 py-0.5 text-[10px] font-bold">
          บันทึกย้อนหลัง
        </span>
      )}
    </div>
  );
}

/** The single "one upload button" entry widget: pick a file or type text, RunMate classifies it. */
function UniversalIntakeUploader({
  loading,
  error,
  onSubmit,
}: {
  loading: boolean;
  error: string;
  onSubmit: (input: { file: File | null; text: string }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [inputKey, setInputKey] = useState(0);

  function handleFile(picked: File | null) {
    setFile(picked);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return picked && picked.type.startsWith("image/") ? URL.createObjectURL(picked) : null;
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit({ file, text });
  }

  const canSubmit = (Boolean(file) || text.trim().length > 0) && !loading;

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-4" data-testid="universal-intake-uploader">
      <label
        className={cn(
          "flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[22px] border border-dashed px-4 py-4 text-center transition-colors",
          file ? "border-rm-primary-strong bg-rm-primary-soft/20" : "border-rm-border bg-rm-surface/70 hover:border-rm-primary/60",
        )}
      >
        <input
          key={inputKey}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,.csv,text/csv"
          data-testid="universal-intake-file-input"
          onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
        />
        {file ? (
          <>
            {preview ? (
              <img src={preview} alt="ตัวอย่างไฟล์ที่เลือก" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <span className="text-2xl">📄</span>
            )}
            <p className="text-sm font-semibold text-rm-text">{file.name}</p>
            <p className="text-xs text-rm-primary-strong underline underline-offset-2">เปลี่ยนไฟล์</p>
          </>
        ) : (
          <>
            <span className="text-2xl">📎</span>
            <p className="text-sm font-bold text-rm-text">แตะเพื่อเลือกรูปหรือไฟล์</p>
            <p className="text-xs text-rm-muted">รองรับรูปภาพ, PDF, CSV — ไม่ต้องเลือกประเภทก่อน</p>
          </>
        )}
      </label>

      <textarea
        className="control min-h-[64px]"
        placeholder="หรือพิมพ์อธิบายสั้น ๆ เช่น ไข่ต้ม 2 ฟอง, วิ่ง 5 กม., เจ็บเข่าซ้าย"
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-testid="universal-intake-text-input"
      />

      <LoadingButton
        className="btn-primary w-full"
        type="submit"
        loading={loading}
        loadingText="กำลังจำแนกข้อมูล..."
        disabled={!canSubmit}
        data-testid="universal-intake-submit"
      >
        วิเคราะห์
      </LoadingButton>
      {error ? <p className="text-xs font-semibold text-[var(--status-rest)]">{error}</p> : null}

      {file && (
        <button
          type="button"
          onClick={() => {
            handleFile(null);
            setInputKey((k) => k + 1);
          }}
          className="text-xs font-semibold text-rm-muted underline underline-offset-2"
        >
          เอาไฟล์ออก
        </button>
      )}
    </form>
  );
}

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
  // Two-step flow: false = default entry/chooser screen, true = focused single-type form.
  const [hasChosenType, setHasChosenType] = useState(false);
  const inputPanelRef = useRef<HTMLDivElement>(null);
  const [manualMealText, setManualMealText] = useState("");
  const [imageMealText, setImageMealText] = useState("");
  const [manualMealError, setManualMealError] = useState("");
  const [manualMealLoading, setManualMealLoading] = useState(false);
  const [existingRaceResults, setExistingRaceResults] = useState<RaceResult[]>([]);
  const [raceDuplicateConfirm, setRaceDuplicateConfirm] = useState<{ workout: WorkoutAnalysis; match: RaceMatch } | null>(null);
  // Meal logs are additive; this ref blocks concurrent saves rather than deduping by day.
  const isSavingMealRef = useRef(false);
  // Increment to force-remount form components after a successful save, resetting their internal state.
  const [walkResetKey, setWalkResetKey] = useState(0);
  const [healthCheckResetKey, setHealthCheckResetKey] = useState(0);

  // ── Universal intake classifier (v0.2.4) ──────────────────────────────────────
  // A file/text captured from the single "one upload button" entry widget, carried
  // forward so the focused-mode uploader can auto-submit without asking the user
  // to pick it again — whether we auto-routed it (high/medium confidence) or the
  // user picked the type themselves after a low-confidence fallback.
  const [pendingIntakeFile, setPendingIntakeFile] = useState<File | null>(null);
  const [pendingIntakeText, setPendingIntakeText] = useState("");
  const [classifiedAs, setClassifiedAs] = useState<UploadType | null>(null);
  const [classificationConfidence, setClassificationConfidence] = useState<"low" | "medium" | "high" | null>(null);
  const [intakeFallbackNotice, setIntakeFallbackNotice] = useState(false);
  const [pendingIntakeRedirect, setPendingIntakeRedirect] = useState<{ kind: "pain" | "sick"; text: string } | null>(null);
  const [universalIntakeLoading, setUniversalIntakeLoading] = useState(false);
  const [universalIntakeError, setUniversalIntakeError] = useState("");

  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("type") ?? "";
    const mode = params.get("mode") ?? "";

    if (mode === "csv") {
      let importParam = "sleep-csv";
      if (raw.toLowerCase() === "workout" || raw.toLowerCase() === "run" || raw.toLowerCase() === "วิ่ง") {
        importParam = "workout-csv";
      }
      router.replace(`/settings?tab=data&import=${importParam}`);
      return;
    }

    const aliasMap: Record<string, UploadType> = {
      sleep: "sleep", meal: "meal", workout: "workout", body: "body", health: "health_check", health_check: "health_check",
      run: "workout", วิ่ง: "workout",
    };
    const resolved: UploadType | undefined = aliasMap[raw.toLowerCase()];
    if (process.env.NODE_ENV === "development") {
      console.info("[upload-type-debug]", { queryType: raw, resolvedType: resolved ?? "(none — keeping default)", mode });
    }

    queueMicrotask(() => {
      if (resolved) {
        setType(resolved);
        setHasChosenType(true);
        if (resolved === "workout") {
          const sub = params.get("subtype") ?? "";
          if (isWorkoutSubtype(sub)) {
            setWorkoutSubtype(sub);
          }
        }
      }
    });
  }, [router]);
  const [draftMealBadge, setDraftMealBadge] = useState(false);

  // Read next-meal draft from sessionStorage (written by NextMealCard "ใช้เมนูนี้เป็นร่างบันทึก")
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_MEAL_KEY);
      if (!raw) return;
      sessionStorage.removeItem(DRAFT_MEAL_KEY);
      const draft = JSON.parse(raw) as DraftMeal;
      if (draft.source !== "next-meal" || !draft.text) return;
      queueMicrotask(() => {
        setType("meal");
        setMealInputMode("text");
        setManualMealText(draft.text);
        setDraftMealBadge(true);
        setHasChosenType(true);
        // Map slot to MealType
        const slotMap: Record<string, MealType> = {
          breakfast: "breakfast", lunch: "lunch", dinner: "dinner",
          snack: "snack", recovery: "post-run",
        };
        const mapped = slotMap[draft.suggestedMealSlot];
        if (mapped) setMealType(mapped);
      });
    } catch {
      // sessionStorage unavailable or malformed — ignore
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
      if (overrideType === "body") setBodySaveError(saveResult.error ?? "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้งอีกครั้ง");
      setSaveStatus("error");
      throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้งอีกครั้ง");
    }
    setResult(next);
    setSaveStatus("saved");
    setPendingIntakeFile(null);
    setPendingIntakeText("");
    setClassifiedAs(null);
    setClassificationConfidence(null);
    setIntakeFallbackNotice(false);
    invalidateCoachCache();
    if (overrideType === "sleep") {
      void buildCoachContextFromSupabase().then((context) => setCoachContext(context));
    }
    if (overrideType === "health_check") {
      setHealthCheckResetKey((k) => k + 1);
    }
    return saved;
  }

  async function handleManualWorkoutSave(workout: WorkoutAnalysis) {
    try {
      const savedItem = await store({ data: workout }, "workout");
      setResult({ data: workout });
      setWorkoutSavedItem(savedItem);
      setWalkResetKey((k) => k + 1);
    } catch {
      // error is set inside store(); form data preserved for retry
    }
  }

  async function handleAnalysisResult(next: unknown) {
    // The captured file (if any) has now been consumed by the analyzer it was routed to.
    setPendingIntakeFile(null);
    setRaceMatch(null);
    setRaceResultError("");
    setWorkoutSavedItem(null);
    setSaveFeedback("");
    setRaceDuplicateConfirm(null);
    setImageMealText("");

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
      setManualMealText("");
      setImageMealText("");
    } finally {
      isSavingMealRef.current = false;
    }
  }

  async function analyzeManualMeal(textOverride?: string) {
    const mealText = (textOverride ?? manualMealText).trim();
    if (mealText.length < 2) {
      setManualMealError("พิมพ์เมนูที่กินก่อนครับ");
      return;
    }

    setPendingIntakeText("");
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
          note: "",
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
        note: "",
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
      setManualMealText("");
      setImageMealText("");
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
    setManualMealText("");
    setImageMealText("");
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
    setHasChosenType(true);

    // A pending classified/preserved text capture with no image only has an existing
    // auto-submit path for meal (text-only analysis) — reuse it here so tapping a
    // type chip after a low-confidence classification doesn't force a re-type.
    if (nextType === "meal" && !pendingIntakeFile && pendingIntakeText) {
      setMealInputMode("text");
      setManualMealText(pendingIntakeText);
      void analyzeManualMeal(pendingIntakeText);
    }
  }

  /** Back to the default entry/chooser screen. Keeps current form state so re-entering the same type resumes it. */
  function returnToEntryScreen() {
    setHasChosenType(false);
  }

  const CLASSIFIED_TYPE_MAP: Partial<Record<IntakeCategory, UploadType>> = {
    meal: "meal",
    workout: "workout",
    sleep: "sleep",
    body: "body",
    health_pdf: "health_check",
  };

  function isCsvFile(file: File): boolean {
    return file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv");
  }

  /** Single "one upload button" entry point on the default screen. Classifies, then routes — never saves anything itself. */
  async function handleUniversalIntakeSubmit({ file, text }: { file: File | null; text: string }) {
    setUniversalIntakeError("");

    if (file && isCsvFile(file)) {
      // CSV is a deterministic file-type routing decision, not an AI classification.
      router.push("/settings?tab=data&import=sleep-csv");
      return;
    }

    if (!file && !text.trim()) return;

    setUniversalIntakeLoading(true);
    try {
      let imageDataUrl: string | undefined;
      if (file) {
        const compressed = await compressImage(file).catch(() => null);
        imageDataUrl = await fileToDataUrl(compressed?.file ?? file);
      }
      const classification = await classifyIntake({ imageDataUrl, text: text.trim() || undefined });
      applyClassification(classification, { file, text: text.trim() });
    } catch {
      setUniversalIntakeError("จำแนกข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง หรือเลือกประเภทเอง");
      applyClassification({ type: "unknown", confidence: "low" }, { file, text: text.trim() });
    } finally {
      setUniversalIntakeLoading(false);
    }
  }

  function applyClassification(
    classification: IntakeClassification,
    captured: { file: File | null; text: string },
  ) {
    const { type: category, confidence } = classification;

    if (category === "pain" || category === "sick") {
      setPendingIntakeRedirect({ kind: category, text: captured.text });
      return;
    }

    const mappedType = CLASSIFIED_TYPE_MAP[category];
    if (mappedType && confidence !== "low") {
      setIntakeFallbackNotice(false);
      setClassifiedAs(mappedType);
      setClassificationConfidence(confidence);
      setPendingIntakeFile(captured.file);
      if (mappedType === "meal" && captured.file && captured.text) {
        setImageMealText(captured.text);
      }
      selectUploadType(mappedType);
      if (mappedType === "meal" && !captured.file && captured.text) {
        setMealInputMode("text");
        setManualMealText(captured.text);
        void analyzeManualMeal(captured.text);
      }
      return;
    }

    // Low confidence, or a type we can't safely auto-route yet — never guess, ask the user.
    setClassifiedAs(null);
    setClassificationConfidence(null);
    setIntakeFallbackNotice(true);
    setPendingIntakeFile(captured.file);
    setPendingIntakeText(captured.text);
  }

  function confirmIntakeRedirect() {
    if (!pendingIntakeRedirect) return;
    try {
      sessionStorage.setItem(
        DRAFT_INTAKE_NOTE_KEY,
        JSON.stringify({ type: pendingIntakeRedirect.kind, text: pendingIntakeRedirect.text }),
      );
    } catch {
      // sessionStorage unavailable — destination page just opens blank, still fine
    }
    router.push(pendingIntakeRedirect.kind === "pain" ? "/pain" : "/sick");
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

  const selectedMeta = UPLOAD_DASHBOARD_META[type];

  return (
    <AppShell title="เพิ่มข้อมูล" subtitle="อัปโหลดรูป ไฟล์ หรือบันทึกข้อความ เพื่อให้ RunMate แนะนำได้แม่นขึ้น">
      <section className="space-y-3 pb-[calc(96px+env(safe-area-inset-bottom))]" data-testid="upload-dashboard">
        {!hasChosenType && (
          <>
            <StatusHero
              tone="ready"
              title="วันนี้จะเพิ่มข้อมูลอะไร?"
              subtitle="วางรูป ไฟล์ หรือพิมพ์ข้อความ RunMate จะจำแนกให้เอง"
              data-testid="universal-intake-hero"
            >
              <p className="inline-flex items-start gap-1.5 rounded-2xl bg-rm-recovery-soft px-3 py-2 text-xs leading-5 text-rm-text/80">
                <span aria-hidden="true">🔎</span>
                <span>RunMate จะสรุปให้ก่อนบันทึก คุณยืนยันหรือแก้ไขได้ทุกครั้ง</span>
              </p>
            </StatusHero>

            <UniversalIntakeUploader
              loading={universalIntakeLoading}
              error={universalIntakeError}
              onSubmit={handleUniversalIntakeSubmit}
            />

            {pendingIntakeRedirect && (
              <div className="card-soft flex items-start gap-3 px-4 py-3" data-testid="intake-redirect-confirm">
                <span className="text-xl">{pendingIntakeRedirect.kind === "pain" ? "🩹" : "🤒"}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-rm-text">
                    ดูเหมือนเกี่ยวกับ{pendingIntakeRedirect.kind === "pain" ? "อาการเจ็บ" : "อาการไม่สบาย"} — ไปหน้าบันทึก{pendingIntakeRedirect.kind === "pain" ? "อาการเจ็บ" : "อาการป่วย"}?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <PrimaryCTA type="button" data-testid="intake-redirect-confirm-cta" onClick={confirmIntakeRedirect}>
                      ไปหน้านั้นเลย
                    </PrimaryCTA>
                    <SecondaryCTA type="button" onClick={() => setPendingIntakeRedirect(null)}>
                      ไม่ใช่ เลือกเอง
                    </SecondaryCTA>
                  </div>
                </div>
              </div>
            )}

            {intakeFallbackNotice && (
              <p
                className="rounded-2xl bg-[var(--color-warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-warning)]"
                data-testid="intake-fallback-notice"
              >
                ไม่แน่ใจว่าเป็นข้อมูลประเภทไหน กรุณาเลือกประเภทเอง — ไฟล์/ข้อความที่ใส่ไว้จะถูกใช้ต่อ ไม่ต้องอัปโหลดใหม่
              </p>
            )}

            <div className="space-y-2.5" data-testid="upload-type-selector">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-rm-text">หรือเลือกประเภทเอง</p>
                <p className="rm-caption">ถ้ารู้ว่าข้อมูลคืออะไร เลือกตรงนี้ได้เลย</p>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-rm-muted">บันทึกประจำวัน</p>
                <div className="flex flex-wrap gap-1.5">
                  {(["sleep", "meal", "workout", "body"] as UploadType[]).map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-rm-primary",
                        type === item
                          ? "border-rm-primary-strong bg-rm-primary text-rm-surface shadow-sm"
                          : "border-rm-border bg-rm-surface/70 text-rm-text hover:bg-rm-primary-soft/60",
                      )}
                      onClick={() => selectUploadType(item)}
                    >
                      <span className="text-sm leading-none">{UPLOAD_DASHBOARD_META[item].icon}</span>
                      <span>{UPLOAD_LABELS[item]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-rm-muted">อาการวันนี้</p>
                <div className="flex flex-wrap gap-1.5">
                  <Link
                    href="/pain"
                    className="flex items-center gap-1.5 rounded-full border border-rm-border bg-rm-surface/70 px-3 py-2 text-[12px] font-bold text-rm-text transition-all hover:bg-rm-primary-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rm-primary"
                  >
                    <span className="text-sm leading-none">🩹</span>
                    <span>อาการเจ็บ</span>
                  </Link>
                  <Link
                    href="/sick"
                    className="flex items-center gap-1.5 rounded-full border border-rm-border bg-rm-surface/70 px-3 py-2 text-[12px] font-bold text-rm-text transition-all hover:bg-rm-primary-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rm-primary"
                  >
                    <span className="text-sm leading-none">🤒</span>
                    <span>อาการป่วย</span>
                  </Link>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-bold text-rm-muted">อื่น ๆ</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-bold transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-rm-primary",
                      type === "health_check"
                        ? "border-rm-primary-strong bg-rm-primary text-rm-surface shadow-sm"
                        : "border-rm-border bg-rm-surface/70 text-rm-text hover:bg-rm-primary-soft/60",
                    )}
                    onClick={() => selectUploadType("health_check")}
                  >
                    <span className="text-sm leading-none">{UPLOAD_DASHBOARD_META.health_check.icon}</span>
                    <span>{UPLOAD_LABELS.health_check}</span>
                  </button>
                  <Link
                    href="/settings?tab=data"
                    className="flex items-center gap-1.5 rounded-full border border-rm-border bg-rm-surface/70 px-3 py-2 text-[12px] font-bold text-rm-text transition-all hover:bg-rm-primary-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rm-primary"
                  >
                    <span className="text-sm leading-none">📥</span>
                    <span>นำเข้าประวัติ</span>
                  </Link>
                </div>
              </div>
            </div>

            <DetailAccordion title="ข้อมูลแต่ละแบบช่วยอะไร?" className="text-xs">
              <ul className="space-y-1">
                <li>· นอน: ใช้ประเมิน readiness</li>
                <li>· ซ้อม: ใช้คำนวณ load และ pace/HR</li>
                <li>· อาหาร: ใช้ดูพลังงานก่อน/หลังซ้อม</li>
                <li>· เจ็บ/ป่วย: ใช้ปรับแผนไม่ให้ฝืน</li>
              </ul>
            </DetailAccordion>
          </>
        )}

        {hasChosenType && (
        <>
        <button
          type="button"
          onClick={returnToEntryScreen}
          data-testid="upload-change-type"
          className="inline-flex items-center gap-1 text-xs font-bold text-rm-muted hover:text-rm-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-rm-primary rounded-full px-1 py-1 -ml-1"
        >
          ← เลือกข้อมูลอื่น
        </button>

        {classifiedAs === type && classificationConfidence && (
          <p
            className="rounded-2xl bg-rm-recovery-soft px-3 py-2 text-xs font-semibold text-rm-text/80"
            data-testid="intake-classification-banner"
          >
            🔎 RunMate จัดประเภทเป็น: {UPLOAD_LABELS[type]}
            {classificationConfidence === "medium" ? " (ไม่แน่ใจเต็มที่ — ตรวจสอบก่อนบันทึก)" : ""}
          </p>
        )}

        <div className="card-soft flex items-start gap-3 px-4 py-3" data-testid="upload-type-summary">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-xl shadow-sm">
            {selectedMeta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-[var(--foreground)]">{selectedMeta.title}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-text)]">{selectedMeta.copy}</p>
            {selectedMeta.caution ? (
              <p className="mt-2 inline-flex rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-warning)]">
                {selectedMeta.caution}
              </p>
            ) : null}
          </div>
        </div>

        <div className="soft-panel px-3 py-3" data-testid="upload-date-selector">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-soft)]">วันที่ของข้อมูล</p>
              <p className="mt-0.5 text-xs text-[var(--muted-text)]">{formatThaiShortDate(selectedDateKey)}</p>
            </div>
            <div className="flex shrink-0 rounded-2xl bg-[var(--surface)]/80 p-1 text-xs font-bold shadow-sm">
              <button
                type="button"
                onClick={() => {
                  setDateSelectionMode("today");
                  setSelectedDateKey(todayBangkokDateKey());
                }}
                className={`rounded-xl px-2.5 py-1.5 transition-colors ${dateSelectionMode === "today" ? "bg-[var(--primary)] text-[#f5f8ff]" : "text-[var(--muted-text)]"}`}
              >
                วันนี้
              </button>
              <button
                type="button"
                onClick={() => {
                  setDateSelectionMode("yesterday");
                  setSelectedDateKey(yesterdayBangkokDateKey());
                }}
                className={`rounded-xl px-2.5 py-1.5 transition-colors ${dateSelectionMode === "yesterday" ? "bg-[var(--primary)] text-[#f5f8ff]" : "text-[var(--muted-text)]"}`}
              >
                เมื่อวาน
              </button>
              <button
                type="button"
                onClick={() => setDateSelectionMode("custom")}
                className={`rounded-xl px-2.5 py-1.5 transition-colors ${dateSelectionMode === "custom" ? "bg-[var(--primary)] text-[#f5f8ff]" : "text-[var(--muted-text)]"}`}
              >
                เลือกวันที่
              </button>
            </div>
          </div>
          {dateSelectionMode === "custom" && (
            <input
              type="date"
              aria-label="เลือกวันที่"
              className="control mt-3 w-full text-sm"
              value={selectedDateKey}
              onChange={(e) => setSelectedDateKey(e.target.value)}
              required
            />
          )}
        </div>

        {/* sleep/body have no type-specific header content (unlike meal's meal-type tabs or
            workout's subtype chips) — once a result exists their only content (ImageUploader)
            hides, so the panel would render as an empty card. Skip it entirely in that case. */}
        {!((type === "sleep" || type === "body") && result) && (
        <div ref={inputPanelRef} className="card space-y-3 p-3.5" data-testid="upload-input-panel">
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
                  className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${mealInputMode === mode ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-text)]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMealType(m)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${mealType === m ? "bg-[var(--primary)] text-[#f5f8ff]" : "bg-[var(--surface-muted)] text-[var(--muted-text)] hover:bg-[var(--primary-soft)]"}`}
                >
                  {MEAL_TYPE_LABELS[m]}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-5 text-[var(--muted-text)]">
              เลือกช่วงมื้อเพื่อให้ Report รวมพลังงานและคำแนะนำมื้อถัดไปได้ตรงขึ้น
            </p>
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
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${workoutSubtype === sub ? "bg-[var(--primary)] text-[#f5f8ff]" : "bg-[var(--surface-muted)] text-[var(--muted-text)] hover:bg-[var(--primary-soft)]"}`}
                >
                  {sub === "run" ? "วิ่ง" : sub === "strength" ? "เวท" : sub === "walk" ? "เดิน" : "อื่น ๆ"}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-5 text-[var(--muted-text)]">{WORKOUT_SUBTYPE_HELPER[workoutSubtype]}</p>
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
                      strengthInputMode === mode ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-text)]"
                    }`}
                  >
                    {mode === "image" ? "🖼️ อัปโหลดรูป" : "📝 บันทึกด้วยตัวเอง"}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {type === "meal" && mealInputMode === "text" && draftMealBadge ? (
          <div className="rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-xs font-medium text-[var(--primary-strong)]">
            ร่างจากคำแนะนำมื้อต่อไป — แก้ไขได้ก่อนบันทึก
          </div>
        ) : null}
        {type === "meal" && mealInputMode === "text" ? (
          <ManualMealLogForm
            mealText={manualMealText}
            error={manualMealError}
            loading={manualMealLoading}
            onMealTextChange={setManualMealText}
            onAnalyze={() => void analyzeManualMeal()}
          />
        ) : null}
        {type === "health_check" ? (
          <>
            <HealthCheckUploader
              key={healthCheckResetKey}
              saving={saveStatus === "saving"}
              onResult={(healthCheck) => {
                setResult({ data: healthCheck });
                setSaveStatus("idle");
              }}
            />
            {!result && saveStatus !== "saving" && <UploadEmptyGuide type={type} />}
          </>
        ) : null}

        {/* Image uploader: show for all types EXCEPT walk/other workout manual, manual meal, health_check, and
            strength-manual mode. Hidden once a result exists — ImageUploader clears its own file/preview state
            right after a successful analyze, so leaving it mounted left an empty dropzone sitting above the
            review card with a large gap between them. The review card's own "ยกเลิก" already routes back here. */}
        {!(type === "workout" && (workoutSubtype === "walk" || workoutSubtype === "other")) &&
         !(type === "workout" && workoutSubtype === "strength" && strengthInputMode === "manual") &&
         !(type === "meal" && mealInputMode === "text") &&
         type !== "health_check" &&
         !result ? (
          <>
            <ImageUploader
              key={type + (type === "workout" ? `-${workoutSubtype}-${strengthInputMode}` : "")}
              kind={type}
              endpoint={endpoint}
              maxFiles={type === "meal" ? 4 : type === "sleep" ? 3 : 4}
              ctaLabel={selectedMeta.ctaLabel}
              noFileCtaLabel={selectedMeta.noFileCtaLabel}
              compressImages={type === "meal"}
              extraFields={{
                ...(type === "meal" ? { mealType, mealText: imageMealText } : {}),
                ...(type === "workout" ? { workoutSubtype } : {}),
                profile,
                context: coachContext,
              }}
              onResult={handleAnalysisResult}
              initialFile={pendingIntakeFile ?? undefined}
              autoSubmit={Boolean(pendingIntakeFile)}
            >
              {type === "meal" && (
                <div className="space-y-1.5 my-3" data-testid="meal-image-text-container">
                  <label htmlFor="meal-image-text" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">เพิ่มเติม</label>
                  <textarea
                    id="meal-image-text"
                    className="control min-h-[80px]"
                    placeholder="เช่น กินข้าวครึ่งจาน, ไก่แดง 2 ไม้, ไม่ได้กินน้ำจิ้ม, มีชาไม่หวาน 1 แก้ว"
                    value={imageMealText}
                    onChange={(e) => setImageMealText(e.target.value)}
                  />
                </div>
              )}
            </ImageUploader>
            {saveStatus === "saving" && <p className="text-xs font-semibold text-[var(--color-text-soft)]">กำลังบันทึก...</p>}
            {saveStatus === "saved" && <p className="text-xs font-semibold text-[var(--status-ready)]">บันทึกเข้า Report แล้ว</p>}
            {saveStatus === "error" && <p className="text-xs font-semibold text-[var(--status-rest)]">บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p>}
            {!result && saveStatus !== "saving" && <UploadEmptyGuide type={type} workoutSubtype={workoutSubtype === "strength" ? "strength" : undefined} />}
          </>
        ) : null}
        </div>
        )}

        {/* ── Workout manual-entry forms (inside section so nav-pad doesn't create a gap above them) ── */}
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

        {type === "workout" && workoutSubtype === "walk" && (
          <div className="space-y-4">
            <SelectedDateBadge dateKey={selectedDateKey} />
            <ManualWorkoutLogForm
              key={walkResetKey}
              subtype="walk"
              saving={saveStatus === "saving"}
              onSave={handleManualWorkoutSave}
              defaultDate={selectedDateKey}
            />
          </div>
        )}

        {type === "workout" && workoutSubtype === "other" && (
          <div className="space-y-4" data-testid="other-workout-section">
            <SelectedDateBadge dateKey={selectedDateKey} />
            <OtherWorkoutForm
              saving={saveStatus === "saving"}
              onResult={handleAnalysisResult}
              onSave={handleManualWorkoutSave}
              defaultDate={selectedDateKey}
              coachContext={coachContext}
              profile={profile}
            />
          </div>
        )}
        {/* ── AI-Suggested Date Confirmation ── */}
        {suggestedDateKey && (
        <div className="card-warning p-4 space-y-2 mb-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--foreground)] leading-relaxed font-semibold">
              📅 วันที่ที่อ่านได้จากไฟล์: {formatDateKeyToThaiBE(suggestedDateKey)}
            </p>
            {selectedDateKey !== suggestedDateKey ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedDateKey(suggestedDateKey);
                  setDateSelectionMode("custom");
                }}
                className="rounded-full bg-[var(--surface)] border border-[var(--color-warning-border)] px-3.5 py-1.5 text-xs font-bold text-[var(--color-warning)] hover:bg-[var(--color-warning-soft)] transition shadow-sm"
              >
                ใช้วันที่นี้
              </button>
            ) : (
              // Matches the already-selected date — SelectedDateBadge right below already
              // says "จะบันทึกเป็นวันที่: ..." so this only needs a short confirmation, not
              // the same date string repeated a third time on screen.
              <span className="rounded-full bg-[var(--color-warning-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-warning)]">
                ✓ ตรงกับวันที่เลือกไว้
              </span>
            )}
          </div>
          {isConfidenceLow && (
            <p className="text-xs text-[var(--color-warning)] leading-relaxed font-medium">
              ⚠️ วันที่ที่อ่านได้อาจคลาดเคลื่อน กรุณาตรวจทานก่อนใช้
            </p>
          )}
        </div>
      )}

      {result && type === "sleep" ? (
        <>
          <SelectedDateBadge dateKey={selectedDateKey} />
          <ReportSavedNote saveStatus={saveStatus} />
          <SleepResultCard result={(result as { data: SleepAnalysis }).data} />
          {(saveStatus === "idle" || saveStatus === "saving") && (
            <div className="card p-4 flex items-center justify-between gap-3 mt-4">
              <p className="text-sm font-semibold text-[var(--muted-text)]">กดยืนยันเพื่อบันทึก Sleep</p>
              <LoadingButton
                type="button"
                loading={saveStatus === "saving"}
                loadingText="กำลังบันทึก..."
                disabled={saveStatus === "saving"}
                onClick={() => void store(result)}
                className="rounded-full bg-[var(--primary)] px-5 py-2.5 text-sm font-bold text-[#f5f8ff] transition hover:bg-[var(--primary-strong)] disabled:opacity-60"
              >
                บันทึกผลการนอน
              </LoadingButton>
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
              <p className="text-sm font-bold text-[var(--foreground)]">บันทึก Race Result แล้ว</p>
            </div>
          )}
          {saveFeedback === "workout" && (
            <div className="card flex items-center gap-3 px-5 py-4">
              <span className="text-[var(--primary-strong)] text-lg">✓</span>
              <p className="text-sm font-bold text-[var(--foreground)]">บันทึกเป็น Workout แล้ว</p>
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
                  บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง
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
      </>
      )}
      </section>
    </AppShell>
  );
}

const UPLOAD_TYPE_HELPER_COPY: Record<UploadType, string> = {
  sleep: "อ่านได้จาก Samsung Health หรือแอปนอนหลับ เช่น เวลานอน, sleep score, HRV และคุณภาพการนอน",
  meal: "อ่านได้จากรูปจานอาหาร ฉลากโภชนาการ เมนู หรือข้อความที่พิมพ์เอง",
  workout: "อ่านได้จากสรุปการวิ่งหรือเวท เช่น ระยะ เวลา pace HR หรือ calories",
  body: "อ่านได้จากรูปเครื่องชั่ง หรือหน้าสรุป body composition ใน Samsung Health",
  health_check: "ระบบจะอ่านเฉพาะค่าที่จำเป็น และบันทึกเป็นสรุปสำหรับโค้ช ไม่ใช่การวินิจฉัย",
};

function UploadEmptyGuide({
  type,
  workoutSubtype,
}: {
  type: UploadType;
  workoutSubtype?: string;
}) {
  const items: Record<UploadType, string[]> = {
    sleep: [
      "รูปหน้าสรุปการนอน Samsung Health — duration / sleep score / HRV",
      "รูป Energy score — readiness / recovery signal",
      "รูปสรุปการนอนจากแอปอื่น เช่น Garmin, Polar หรือ Apple Health",
    ],
    meal: [
      "รูปจานอาหาร — ระบุรายการและ portion คร่าว ๆ ได้",
      "ฉลากโภชนาการ — อ่าน kcal / โปรตีน / คาร์บ / ไขมัน",
      "เมนูหรือใบเสร็จ — ช่วยประเมินแคลอรี่มื้ออาหาร",
      "พิมพ์เองได้ เช่น: ข้าวต้มปลา 1 ชาม + ไข่ 2 ฟอง",
    ],
    workout: workoutSubtype === "strength"
      ? [
          "รูปสรุป Strength session — Garmin, Apple Watch, Polar",
          "รูป Gym app — Strong, Hevy, Fitbod หรือแอปอื่น ๆ",
          "รูปสรุปทั่วไป — ระยะเวลา / แคลอรี่ / HR ก็เพียงพอ",
        ]
      : [
          "รูปผลวิ่ง — ระยะ / เวลา / pace / HR (Strava, Garmin, Nike Run)",
          "รูปสรุปกิจกรรมจาก Samsung Health, Apple Watch, Polar",
          "รูปหน้าสรุปการแข่ง — ผล race, split time, pace",
        ],
    body: [
      "รูปหน้าชั่งน้ำหนัก Samsung Health — น้ำหนัก / ไขมัน / กล้ามเนื้อ",
      "รูปเครื่องชั่งอัจฉริยะ — อ่าน body composition ได้",
      "พิมพ์ค่าน้ำหนักเองได้ เช่น \"62.5 kg, ไขมัน 18%\"",
    ],
    health_check: [
      "PDF ผลตรวจสุขภาพประจำปี — อ่านค่าสำคัญเป็นบริบท",
      "รูปผลเจาะเลือด / ผลตรวจจากโรงพยาบาล",
    ],
  };

  return (
    <div className="rounded-2xl border border-rm-border bg-rm-surface/60 px-3 py-2.5 text-xs text-rm-muted" data-testid="upload-help">
      <p className="mb-2 text-[11px] leading-5 text-rm-muted">{UPLOAD_TYPE_HELPER_COPY[type]}</p>
      <DetailAccordion title="อ่านอะไรได้บ้าง?" className="border-0 bg-transparent p-0 shadow-none">
        <div className="space-y-2 leading-5">
          {items[type].map((item) => (
            <p key={item}>· {item}</p>
          ))}
          <p className="rounded-xl bg-rm-surface-soft px-3 py-2 text-[11px] leading-5 text-rm-muted">
            ไฟล์ต้นฉบับใช้เพื่อวิเคราะห์ครั้งนี้เท่านั้น Report จะเก็บเฉพาะข้อมูลที่สรุปแล้ว และ Coach Chat ใช้ Report เป็นบริบท
          </p>
          {type === "body" ? (
            <div className="flex flex-wrap gap-2">
              <Link href="/pain" className="inline-flex rounded-full bg-rm-surface px-3 py-1.5 text-[11px] font-bold text-rm-primary shadow-sm">
                มีอาการเจ็บ? บันทึกที่หน้า &quot;เจ็บ&quot;
              </Link>
              <Link href="/sick" className="inline-flex rounded-full bg-rm-surface px-3 py-1.5 text-[11px] font-bold text-rm-primary shadow-sm">
                ไม่สบาย? บันทึกอาการ
              </Link>
            </div>
          ) : null}
        </div>
      </DetailAccordion>
    </div>
  );
}


function ReportSavedNote({ saveStatus }: { saveStatus: "idle" | "saving" | "saved" | "error" }) {
  return (
    <section className="soft-panel px-4 py-3 text-xs leading-5 text-[var(--muted-text)]">
      {saveStatus === "saved" ? (
        <span className="font-bold text-[var(--color-success)]">บันทึกเข้า Report แล้ว</span>
      ) : (
        <span className="font-bold text-[var(--foreground)]">ผลวิเคราะห์</span>
      )}
      <span> ระบบจะอ่านรูปเพื่อสรุปข้อมูลเท่านั้น และบันทึกเฉพาะผลลัพธ์เข้า Report รูปต้นฉบับไม่ถูกเก็บถาวร</span>
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
    <div className="space-y-3 rounded-[22px] bg-[var(--surface-muted)]/70 p-3">
      <p className="rounded-2xl bg-[var(--surface)]/75 px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
        ระบบจะอ่านเฉพาะค่าที่จำเป็น และบันทึกเป็นสรุปสำหรับโค้ช
      </p>

      <label
        className={`flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed px-4 py-5 text-center transition-colors ${
          file
            ? "border-[var(--primary)] bg-[var(--primary-soft)]"
            : "border-[var(--border-warm)] bg-[var(--surface)]/70 hover:border-[var(--primary)]/60 hover:bg-[var(--surface)]"
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
          aria-label="เลือกไฟล์ผลตรวจสุขภาพ PDF"
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
            <span className="text-2xl">📄</span>
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

      {error ? <p className="rounded-xl bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">{error}</p> : null}
      
      <LoadingButton
        type="button"
        className="btn-primary w-full py-3 text-sm disabled:cursor-not-allowed disabled:opacity-45"
        loading={loading}
        loadingText="กำลังอ่าน PDF..."
        onClick={() => void analyze()}
        disabled={saving || loading || !file}
      >
        {file ? "วิเคราะห์ผลตรวจสุขภาพ" : "เลือก PDF ก่อนวิเคราะห์"}
      </LoadingButton>
      <p className="text-xs leading-5 text-[var(--color-text-soft)]">
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
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--label-color)]">Health Check Review</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">ตรวจทานก่อนบันทึก</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
          ระบบบันทึกเฉพาะค่าที่สรุปแล้ว ไม่บันทึกไฟล์ PDF ต้นฉบับหรือข้อความดิบ
        </p>
        <SelectedDateBadge dateKey={selectedDateKey} />
      </div>

      <div className="rounded-2xl bg-[var(--color-info-soft)] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-[var(--foreground)] text-base">ผลตรวจสุขภาพล่าสุด</h3>
            <p className="mt-0.5 text-xs text-[var(--recovery-blue)] font-semibold">ใช้เพื่อช่วยปรับคำแนะนำอาหารและไลฟ์สไตล์</p>
            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{healthCheck.checkupDate ?? "ไม่พบวันที่ตรวจ"}</p>
          </div>
          <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--recovery-blue)]">{healthCheck.confidence ?? "low"}</span>
        </div>

        <div className="mt-4 space-y-3">
          {/* ควรระวัง */}
          <div className="rounded-xl bg-[var(--surface)]/70 p-3 ring-1 ring-[var(--border-warm)]">
            <p className="text-xs font-bold text-[var(--color-warning)]">⚠️ ควรระวัง</p>
            {warningLabs.length > 0 ? (
              <ul className="mt-1.5 list-disc pl-4 space-y-1 text-sm text-[var(--foreground)]">
                {warningLabs.map(([key, lab]) => (
                  <li key={key}>{formatLabWarning(key, lab)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-[var(--color-text-muted)] font-medium">ยังไม่พบค่าที่ต้องระวังเด่น ๆ จากข้อมูลที่อ่านได้</p>
            )}
          </div>

          {/* อยู่ในเกณฑ์ */}
          <div className="rounded-xl bg-[var(--surface)]/70 p-3 ring-1 ring-[var(--border-warm)]">
            <p className="text-xs font-bold text-[var(--color-success)]">✅ อยู่ในเกณฑ์</p>
            {normalLabs.length > 0 ? (
              <p className="mt-1.5 text-sm text-[var(--foreground)] leading-relaxed font-medium">
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
              <p className="mt-1.5 text-sm text-[var(--color-text-muted)] italic">ไม่มีข้อมูลค่าอ้างอิงที่เป็นปกติ</p>
            )}
          </div>

          {/* โภชนาการที่เหมาะ */}
          <div className="rounded-xl bg-[var(--surface)]/70 p-3 ring-1 ring-[var(--border-warm)]">
            <p className="text-xs font-bold text-[var(--recovery-blue)]">🥗 โภชนาการที่เหมาะ</p>
            {(healthCheck.foodGuidance?.prefer?.length || healthCheck.foodGuidance?.limit?.length) ? (
              <ul className="mt-1.5 list-disc pl-4 space-y-1 text-sm text-[var(--foreground)] font-medium">
                {healthCheck.foodGuidance.prefer?.map((item, idx) => (
                  <li key={`pref-${idx}`}>เพิ่ม/เน้น {item}</li>
                ))}
                {healthCheck.foodGuidance.limit?.map((item, idx) => (
                  <li key={`lim-${idx}`}>ลด/เลี่ยง {item}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1.5 text-sm text-[var(--color-text-muted)] italic">ไม่มีข้อมูลคำแนะนำโภชนาการ</p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <DataQualityNote confidence={healthCheck.confidence} unclearFields={healthCheck.unclearFields} source="health_check" />
        </div>

        {isMissingLabs && (
          <div className="mt-3 rounded-2xl bg-[var(--color-info-soft)] px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
            ℹ️ ยังไม่มีค่าบางรายการ เช่น HbA1c หรือ eGFR หากต้องการให้คำแนะนำแม่นขึ้น สามารถเพิ่มผลตรวจรอบถัดไปได้
          </div>
        )}

        {allLabs.length > 0 ? (
          <details className="mt-4 border-t border-[var(--border-warm)] pt-3">
            <summary className="cursor-pointer text-xs font-bold text-[var(--recovery-blue)] hover:underline focus:outline-none select-none">
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

      <p className="rounded-2xl bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
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
          <button type="button" disabled={saving} className="rounded-full bg-[var(--surface-muted)] py-3 text-sm font-bold text-[var(--color-text-muted)] disabled:opacity-50" onClick={onCancel}>
            ยกเลิก
          </button>
        </div>
      )}
      {saveStatus === "error" ? <p className="text-center text-xs font-semibold text-[var(--status-rest)]">บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง</p> : null}
    </section>
  );
}

function HealthLabMetric({ lab }: { lab: LabValue }) {
  const color =
    lab.status === "high" ? "text-[var(--color-warning)]" :
    lab.status === "low" ? "text-[var(--color-info)]" :
    lab.status === "borderline" ? "text-[var(--color-warning)]" :
    "text-[var(--foreground)]";
  return (
    <div className="rounded-2xl bg-[var(--surface-muted)] p-3">
      <p className="text-xs text-[var(--color-text-soft)]">{lab.label}</p>
      <p className={`mt-1 font-bold ${color}`}>{formatHealthLabValue(lab)}</p>
      {lab.ref ? <p className="mt-1 text-[11px] text-[var(--color-text-soft)]">ref {lab.ref}</p> : null}
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
    <section className="card space-y-3 border border-[var(--color-success-border)] bg-[var(--color-success-soft)] p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--label-color)]">Race Result</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">ผลวิ่งนี้ตรงกับวัน Race Goal</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          {match.goal.raceName} · {match.goal.raceDistance} · {match.workoutDate}
        </p>
      </div>
      <p className="text-sm text-[var(--color-text-muted)]">ต้องการบันทึกผลวิ่งนี้เป็น Race Result หรือเก็บเป็น Workout ปกติ?</p>
      <div className="my-2">
        <DataQualityNote source="race_result" />
      </div>
      {!match.distanceMatches ? (
        <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs leading-5 text-[var(--color-warning)]">
          ระยะทางอาจไม่ตรงกับระยะ race แบบเป๊ะ ๆ ระบบยังให้บันทึกได้ แต่แนะนำตรวจผลก่อนกดบันทึก
        </p>
      ) : null}
      {error ? <p className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">{error}</p> : null}
      <div className="space-y-2">
        <LoadingButton className="btn-primary w-full py-3 text-sm" type="button" loading={saving} loadingText="กำลังบันทึก..." onClick={() => onSaveRace(workout)}>
          บันทึกเป็น Race Result
        </LoadingButton>
        <LoadingButton className="btn-secondary w-full py-3 text-sm" type="button" loading={saving} loadingText="กำลังบันทึก..." onClick={() => onWorkoutOnly(workout)}>
          เก็บเป็น Workout ปกติ
        </LoadingButton>
        <button className="w-full rounded-full py-2.5 text-sm text-[var(--color-text-soft)]" type="button" disabled={saving} onClick={onCancel}>
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
    <section className="card space-y-3 border border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--color-warning)]">บันทึกซ้ำ?</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">รายการนี้ดูเหมือนบันทึกแล้ว</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
          มีผลแข่งระยะนี้ในวันเดียวกันอยู่แล้ว ต้องการบันทึกซ้ำอีกครั้งไหม?
        </p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{match.goal.raceName} · {match.goal.raceDistance} · {match.workoutDate}</p>
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
          className="w-full rounded-full py-2.5 text-sm text-[var(--color-text-soft)]"
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
  error,
  loading,
  onMealTextChange,
  onAnalyze,
}: {
  mealText: string;
  error: string;
  loading: boolean;
  onMealTextChange: (value: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="space-y-4 rounded-2xl bg-[var(--surface-muted)] p-4">
      <div>
        <h3 className="text-base font-bold text-[var(--foreground)]">พิมพ์เมนูเอง</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">ประเมินจากข้อความที่กรอก อาจคลาดเคลื่อนได้</p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">พิมพ์เมนูของมื้อนี้</span>
        <textarea
          className="control min-h-[96px]"
          placeholder="เช่น ข้าวเหนียว 1 ห่อ + ไก่แดง 2 ไม้ + กาแฟดำไม่หวาน"
          value={mealText}
          onChange={(event) => onMealTextChange(event.target.value)}
        />
      </label>

      {error ? <p className="rounded-xl bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">{error}</p> : null}

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

  function updateFoodName(index: number, name: string) {
    setMeal((current) => ({
      ...current,
      detectedFoods: current.detectedFoods.map((food, i) => (i === index ? { ...food, name } : food)),
      needsReview: false,
    }));
  }

  function updateFoodQuantity(index: number, delta: number) {
    setMeal((current) => ({
      ...current,
      detectedFoods: current.detectedFoods.map((food, i) =>
        i === index ? { ...food, quantity: Math.max(1, (food.quantity ?? 1) + delta) } : food,
      ),
      needsReview: false,
    }));
  }

  function removeFoodItem(index: number) {
    setMeal((current) => ({
      ...current,
      detectedFoods: current.detectedFoods.filter((_, i) => i !== index),
      needsReview: false,
    }));
  }

  function addFoodItem() {
    setMeal((current) => ({
      ...current,
      detectedFoods: [...current.detectedFoods, { name: "", quantity: 1, unit: "", confidence: "medium" as const }],
      needsReview: false,
    }));
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--label-color)]">Meal Review</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">ตรวจโภชนาการก่อนบันทึก</h2>
        {isTextEstimate ? (
          <span className="mt-2 inline-flex rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[11px] font-bold text-[var(--color-text-muted)]">
            กรอกจากข้อความ
          </span>
        ) : null}
        <SelectedDateBadge dateKey={selectedDateKey} />

        {/* ช่วงเวลาของมื้อนี้ */}
        <div className="space-y-1.5 my-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-soft)]">ช่วงเวลาของมื้อนี้</span>
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
                      ? "bg-[var(--primary)] text-[#f5f8ff] shadow-sm font-bold"
                      : "bg-[var(--surface-muted)] text-[var(--color-text-muted)] hover:bg-[var(--surface-muted)]"
                  }`}
                >
                  <span>{icon}</span> <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <p className="mt-1 text-xs leading-5 text-[var(--color-warning)]">
          {isTextEstimate
            ? "ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากข้อความที่กรอก อาจคลาดเคลื่อนได้"
            : "ตัวเลขโภชนาการเป็นการประเมินคร่าว ๆ จากรูปอาหาร อาจคลาดเคลื่อนได้"}
        </p>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="space-y-2" data-testid="meal-food-list">
            {meal.detectedFoods.map((food, index) => (
              <div key={index} className="flex items-center gap-2" data-testid={`meal-food-row-${index}`}>
                <input
                  className="control flex-1"
                  value={food.name}
                  onChange={(event) => updateFoodName(index, event.target.value)}
                  placeholder="เช่น ไข่ต้ม"
                />
                <div className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-[var(--surface-muted)] px-1.5 py-1">
                  <button
                    type="button"
                    aria-label="ลดจำนวน"
                    data-testid={`meal-food-qty-minus-${index}`}
                    onClick={() => updateFoodQuantity(index, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--color-text-muted)] shadow-sm"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-[var(--foreground)]" data-testid={`meal-food-qty-${index}`}>
                    {food.quantity ?? 1}
                  </span>
                  <button
                    type="button"
                    aria-label="เพิ่มจำนวน"
                    data-testid={`meal-food-qty-plus-${index}`}
                    onClick={() => updateFoodQuantity(index, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)] text-sm font-bold text-[var(--color-text-muted)] shadow-sm"
                  >
                    +
                  </button>
                </div>
                {food.unit ? <span className="shrink-0 text-xs font-semibold text-[var(--color-text-muted)]">{food.unit}</span> : null}
                <button
                  type="button"
                  aria-label="ลบรายการนี้"
                  data-testid={`meal-food-remove-${index}`}
                  onClick={() => removeFoodItem(index)}
                  className="shrink-0 text-xs font-bold text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)]"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addFoodItem}
              className="text-xs font-bold text-[var(--primary-strong)] underline underline-offset-2"
            >
              + เพิ่มรายการอาหาร
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NutritionInput label="Calories" placeholder="เช่น 550" value={meal.nutrition.caloriesKcal} range={meal.nutritionRange?.caloriesKcal} unit="kcal" onChange={(value) => updateNutrition("caloriesKcal", value)} />
            <NutritionInput label="Protein g" placeholder="เช่น 30" value={meal.nutrition.proteinG} range={meal.nutritionRange?.proteinG} onChange={(value) => updateNutrition("proteinG", value)} />
            <NutritionInput label="Carbs g" placeholder="เช่น 70" value={meal.nutrition.carbsG} range={meal.nutritionRange?.carbsG} onChange={(value) => updateNutrition("carbsG", value)} />
            <NutritionInput label="Fat g" placeholder="เช่น 20" value={meal.nutrition.fatG} range={meal.nutritionRange?.fatG} onChange={(value) => updateNutrition("fatG", value)} />
            <NutritionInput label="Fiber g" placeholder="เช่น 5" value={meal.nutrition.fiberG} onChange={(value) => updateNutrition("fiberG", value)} />
          </div>
          {cannotEstimateNutrition ? (
            <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs font-semibold leading-5 text-[var(--color-warning)]">
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
        <button type="button" disabled={saving} className="rounded-full bg-[var(--surface-muted)] py-3 text-sm font-bold text-[var(--color-text-muted)] disabled:opacity-50" onClick={onCancel}>
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
      <span className="mb-1 block text-xs font-semibold text-[var(--color-text-muted)]">{label}</span>
      <input className="control" type="number" inputMode="decimal" placeholder={placeholder} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      {range ? (
        <span className="mt-1 block text-[11px] leading-4 text-[var(--color-text-soft)]">
          ประเมินจากช่วง {formatNutritionRange(range.min, range.max, unit)}
        </span>
      ) : null}
    </label>
  );
}

function MealReviewSummary({ meal, profile, context }: { meal: MealAnalysis; profile: UserProfile | null; context: CoachContext | null }) {
  const foods = meal.detectedFoods
    .map((food) => (food.quantity && food.quantity > 1 ? `${food.name} × ${food.quantity}${food.unit ? ` ${food.unit}` : ""}` : food.name))
    .join(", ") || "มื้ออาหาร";
  const target = buildNutritionTargetSummary({ profile, context, meal });
  const isTextEstimate = meal.inputMode === "text";
  return (
    <div className="space-y-3 rounded-2xl bg-[var(--surface-muted)] p-4">
      <div>
        <p className="text-xs font-semibold text-[var(--color-text-soft)]">
          {getMealSlotLabel(meal.mealSlot || normalizeMealSlot(meal.mealType, meal.createdAt))}
        </p>
        <p className="text-lg font-bold text-[var(--foreground)]">{foods}</p>
        {isTextEstimate && meal.originalMealText ? (
          <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">จากข้อความ: {meal.originalMealText}</p>
        ) : null}
      </div>
      <DataQualityNote confidence={meal.confidence} unclearFields={meal.unclearFields} source="meal" compact />
      {meal.errorLikeMessage ? (
        <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs font-semibold leading-5 text-[var(--color-warning)]">{meal.errorLikeMessage}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <ReviewMetric label="Calories" value={formatCalories(meal.nutrition.caloriesKcal)} />
        <ReviewMetric label="Protein" value={formatMacro(meal.nutrition.proteinG)} />
        <ReviewMetric label="Carbs" value={formatMacro(meal.nutrition.carbsG)} />
        <ReviewMetric label="Fat" value={formatMacro(meal.nutrition.fatG)} />
      </div>
      <div className="rounded-2xl bg-[var(--surface)] p-3 text-xs leading-5 text-[var(--color-text-muted)]">
        <p className="font-bold text-[var(--foreground)]">Runner fuel check</p>
        <p>Protein progress: {target.proteinProgressPct != null ? `${target.proteinProgressPct}%` : "-"}{target.proteinTargetG != null ? ` / target ${target.proteinTargetG} g` : ""}</p>
        <p>Carb adequacy ({target.dayType} day): {target.carbAdequacy}{target.carbTargetG != null ? ` / target ${target.carbTargetG} g` : ""}</p>
        <p>{target.recoveryFuelNote}</p>
      </div>
      {!hasAnyNutrition(meal) && meal.detectedFoods.length > 0 ? (
        <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs font-semibold leading-5 text-[var(--color-warning)]">
          อ่านอาหารได้ แต่ประเมินโภชนาการไม่ได้ชัดเจน คุณกรอกเองได้
        </p>
      ) : null}
      <p className="text-sm leading-6 text-[var(--foreground)]">{meal.trainingFit?.coachNote ?? ""}</p>
      <p className="text-xs text-[var(--color-text-muted)]">
        {CONFIDENCE_LABELS[meal.confidence ?? "low"]} · ตัวเลขเป็นการประเมินคร่าว ๆ จาก{isTextEstimate ? "ข้อความที่กรอก" : "รูปอาหาร"}
      </p>
    </div>
  );
}

function ReviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--color-text-soft)]">{label}</p>
      <p className="mt-1 font-bold text-[var(--foreground)]">{value}</p>
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
              {saveError || "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"}
            </p>
          )}
        </>
      )}
      <p className="text-center text-xs text-[var(--color-text-soft)]">บันทึกเฉพาะข้อมูลที่สรุปแล้ว รูปต้นฉบับไม่ถูกเก็บ</p>
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
    return normalizeMealFoodQuantities(
      foods.map((food) => ({
        name: typeof food.name === "string" ? food.name.trim() : "",
        portionEstimate: food.portionEstimate ?? portionFallback,
        confidence: food.confidence ?? "low",
        quantity: food.quantity,
        unit: food.unit,
      })),
    ).filter((food) => food.name);
  }
  return legacyFood ? [{ name: legacyFood, portionEstimate: portionFallback, confidence: "low", quantity: 1, unit: "" }] : [];
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
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--color-warning)]">มื้อซ้ำ</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">วันนี้มีมื้อ{mealLabel}อยู่แล้ว</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">ต้องการทำอะไรกับรูปนี้?</p>
      </div>
      <div className="rounded-xl bg-[var(--surface-muted)] px-3 py-2.5">
        <p className="text-[11px] text-[var(--color-text-soft)] mb-0.5">ที่บันทึกไว้</p>
        <p className="text-sm font-semibold text-[var(--foreground)]">{existingFoods}</p>
      </div>
      <div className="space-y-2">
        <LoadingButton type="button" className="btn-primary w-full py-3 text-sm" onClick={onMerge} loading={saving} loadingText="กำลังบันทึก...">
          เพิ่มเข้าเมื้อเดิม
        </LoadingButton>
        <p className="text-center text-[11px] text-[var(--color-text-soft)]">รวมอาหารและโภชนาการเข้าด้วยกัน</p>
        <LoadingButton type="button" className="btn-secondary w-full py-3 text-sm" onClick={onReplace} loading={saving} loadingText="กำลังบันทึก...">
          แทนที่ข้อมูลเดิม
        </LoadingButton>
        <LoadingButton type="button" className="w-full rounded-full bg-[var(--surface-muted)] py-3 text-sm font-bold text-[var(--color-text-muted)]" onClick={onSeparate} loading={saving} loadingText="กำลังบันทึก...">
          บันทึกเป็นมื้อใหม่
        </LoadingButton>
        <button type="button" className="w-full pt-1 text-xs text-[var(--color-text-soft)]" onClick={onCancel} disabled={saving}>
          ยกเลิก
        </button>
      </div>
    </section>
  );
}

const OWF_MAX_PAYLOAD_BYTES = 3.5 * 1024 * 1024;
const OWF_PAYLOAD_ERROR =
  "รูปใหญ่เกินไปสำหรับการวิเคราะห์ ลองเลือกรูปน้อยลงหรือเลือกรูปที่เล็กลง";

function detectSwimFromNote(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("ว่ายน้ำ") || lower.includes("swim") || lower.includes("pool") || lower.includes("สระ");
}

function buildOtherWorkoutFallback(noteText: string, date: string): WorkoutAnalysis {
  const isSwim = detectSwimFromNote(noteText);
  return {
    extracted: {
      workoutKind: "other",
      date,
      distanceKm: null,
      distanceM: null,
      duration: null,
      avgPace: null,
      avgSpeedKmh: null,
      avgHR: null,
      maxHR: null,
      cadence: null,
      calories: null,
      elevationGain: null,
      vo2Max: null,
      sweatLossMl: null,
      visibleMetrics: [],
      swimKind: isSwim ? "pool" : null,
    },
    coach: {
      workoutSummary: noteText,
      intensityAssessment: "ประเมินจากบันทึก",
      trainingLoadNote: noteText,
      wasTooHard: false,
      recoveryAdvice: "พักผ่อน ดื่มน้ำให้เพียงพอ",
      nutritionAfterWorkout: "เติมพลังงานด้วยสารอาหารที่มีประโยชน์",
      nextWorkoutSuggestion: "ซ้อมตามแผนปกติ",
      coachNote: noteText,
    },
    confidence: "low",
    unclearFields: [],
  };
}

function OtherWorkoutForm({
  onResult,
  onSave,
  saving,
  defaultDate,
  coachContext,
  profile,
}: {
  onResult: (data: unknown) => void;
  onSave: (workout: WorkoutAnalysis) => void;
  saving: boolean;
  defaultDate: string;
  coachContext: CoachContext | null;
  profile: UserProfile | null;
}) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...picked].slice(0, 4));
    e.target.value = "";
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const trimmed = note.trim();
  const hasNote = trimmed.length > 0;
  const hasImages = files.length > 0;
  const canSubmit = hasNote || hasImages;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setSubmitting(true);

    // Text-only: save locally without hitting the API
    if (!hasImages) {
      onSave(buildOtherWorkoutFallback(trimmed, defaultDate));
      setNote("");
      setSubmitting(false);
      return;
    }

    try {
      // Compress each image (max 1280px, JPEG 0.75, never increases size)
      const results = await Promise.allSettled(
        files.map((f) => compressImage(f, { maxDim: 1280, quality: 0.75 })),
      );
      const filesToSend = results.map((r, i) =>
        r.status === "fulfilled" ? r.value.file : files[i],
      );

      // Payload guard — base64 inflates ~4/3
      const estimatedBytes = filesToSend.reduce(
        (sum, f) => sum + Math.ceil(f.size / 3) * 4,
        0,
      );
      if (estimatedBytes > OWF_MAX_PAYLOAD_BYTES) {
        setError(OWF_PAYLOAD_ERROR);
        return;
      }

      const imageDataUrls = await Promise.all(filesToSend.map(fileToDataUrl));

      const res = await fetch("/api/analyze-workout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workoutNote: trimmed,
          workoutSubtype: "other",
          imageDataUrls,
          profile,
          context: coachContext,
          date: defaultDate,
        }),
      });

      if (res.status === 413) {
        setError(OWF_PAYLOAD_ERROR);
        return;
      }

      if (!res.ok) throw new Error("api-error");

      const result = (await res.json()) as unknown;
      onResult(result);
      setNote("");
      setFiles([]);
    } catch {
      if (hasNote) {
        // Has a note: fall back to local save from note text
        onSave(buildOtherWorkoutFallback(trimmed, defaultDate));
        setNote("");
        setFiles([]);
      } else {
        // Image-only with no note: can't fall back, ask user to retry
        setError("วิเคราะห์รูปไม่สำเร็จ ลองอัปโหลดใหม่หรือพิมพ์รายละเอียดกิจกรรมแทน");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = submitting || saving;

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2 card p-5 bg-[var(--surface)]" data-testid="other-workout-form">
      <div>
        <h3 className="text-lg font-bold text-[var(--foreground)]">บันทึกกิจกรรมอื่น ๆ</h3>
        <p className="text-xs text-[var(--color-text-muted)]">พิมพ์รายละเอียด หรือแนบรูปสรุปกิจกรรมอย่างน้อย 1 อย่าง</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="owf-note" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">
          กิจกรรมวันนี้
        </label>
        <textarea
          id="owf-note"
          className="control min-h-[96px]"
          placeholder="เช่น ว่ายน้ำเบา ๆ 25 นาที, HR ประมาณ 120, recovery swim, ไม่มีเจ็บ"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {/* Optional image upload */}
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">รูปสรุปจากแอป (ถ้ามี)</p>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <div key={i} className="relative">
                <img
                  src={URL.createObjectURL(f)}
                  alt={f.name}
                  className="h-16 w-16 rounded-xl object-cover border border-[var(--color-border-soft)]"
                />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-muted)] text-[var(--foreground)] text-[10px] font-bold"
                  aria-label="ลบรูป"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length < 4 && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-dashed border-[var(--color-border-soft)] px-4 py-2.5 text-xs font-semibold text-[var(--muted-text)] hover:bg-[var(--surface-muted)] transition-colors"
            >
              + เพิ่มรูป
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              aria-label="เพิ่มรูปกิจกรรม"
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}
        <p className="text-[10px] text-[var(--muted-text)]">สูงสุด 4 รูป · ถ้าไม่มีรูป กรอกรายละเอียดในช่องด้านบนแทนได้เลย</p>
      </div>

      {error && <p className="text-xs font-semibold text-[var(--color-danger)] bg-[var(--color-danger-soft)] p-2.5 rounded-xl">{error}</p>}

      <LoadingButton
        type="submit"
        loading={isLoading}
        loadingText="กำลังวิเคราะห์..."
        disabled={!canSubmit || isLoading}
        className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-45 disabled:cursor-not-allowed"
      >
        {hasImages ? "วิเคราะห์และบันทึก" : "บันทึกกิจกรรม"}
      </LoadingButton>
    </form>
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
    <form onSubmit={handleSubmit} className="space-y-4 pt-2 card p-5 bg-[var(--surface)]">
      <div>
        <h3 className="text-lg font-bold text-[var(--foreground)]">
          {subtype === "walk" ? "บันทึกกิจกรรมเดิน" : "บันทึกกิจกรรมอื่น ๆ"}
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">กรอกข้อมูลการซ้อมและบันทึกตรงเข้า Supabase</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="mwlf-date" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">วันที่</label>
        <input id="mwlf-date" type="date" className="control" value={defaultDate} required disabled />
      </div>

      {subtype === "other" && (
        <div className="space-y-1.5">
          <label htmlFor="mwlf-type" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">ประเภทการออกกำลังกาย</label>
          <input
            id="mwlf-type"
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
          <label htmlFor="mwlf-duration" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">เวลา (นาที)</label>
          <input
            id="mwlf-duration"
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
          <label htmlFor="mwlf-distance" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">ระยะทาง (กม. ถ้ามี)</label>
          <input
            id="mwlf-distance"
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
          <label htmlFor="mwlf-hr" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">HR เฉลี่ย (bpm ถ้ามี)</label>
          <input
            id="mwlf-hr"
            type="number"
            className="control"
            placeholder="เช่น 120"
            value={avgHR}
            onChange={(e) => setAvgHR(e.target.value)}
            min="30"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mwlf-calories" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">แคลอรี (kcal ถ้ามี)</label>
          <input
            id="mwlf-calories"
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
        <label htmlFor="mwlf-notes" className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-soft)]">บันทึกเพิ่มเติม</label>
        <textarea
          id="mwlf-notes"
          className="control min-h-[80px]"
          placeholder="เช่น รู้สึกสดชื่นดี, เหนื่อยปานกลาง"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {error && <p className="text-xs font-semibold text-[var(--color-danger)] bg-[var(--color-danger-soft)] p-2.5 rounded-xl">{error}</p>}

      <LoadingButton type="submit" loading={saving} loadingText="กำลังบันทึก..." className="btn-primary w-full py-3 text-sm font-bold">
        บันทึกกิจกรรม
      </LoadingButton>
    </form>
  );
}
