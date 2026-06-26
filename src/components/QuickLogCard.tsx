"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { todayBangkokDateKey, dateKeyToRecordedAt } from "@/lib/date";

type QuickAction = {
  id: string;
  label: string;
  icon: string;
  confirmMessage: string;
};

const ACTIONS: QuickAction[] = [
  { id: "rest", label: "วันนี้พัก", icon: "😴", confirmMessage: "บันทึกว่าพักวันนี้?" },
  { id: "walk", label: "เดินเบา 20 นาที", icon: "🚶", confirmMessage: "บันทึกเดินเบา 20 นาที?" },
  { id: "protein", label: "กินโปรตีนแล้ว", icon: "🥚", confirmMessage: "บันทึกว่ากินโปรตีนแล้ว?" },
  { id: "pain", label: "ปวด 1/10", icon: "🩹", confirmMessage: "บันทึกอาการปวดระดับ 1/10?" },
  { id: "summary", label: "สรุปท้ายวัน", icon: "📋", confirmMessage: "" },
];

type Props = {
  onActivitySaved?: () => void;
  onOpenEndOfDay?: () => void;
};

export function QuickLogCard({ onActivitySaved, onOpenEndOfDay }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: QuickAction) {
    if (pending) return;
    setError(null);

    if (action.id === "summary") {
      onOpenEndOfDay?.();
      return;
    }
    if (action.id === "pain") {
      router.push("/pain");
      return;
    }

    const confirmed = window.confirm(action.confirmMessage);
    if (!confirmed) return;

    setPending(action.id);
    try {
      const dateKey = todayBangkokDateKey();
      const recordedAt = dateKeyToRecordedAt(dateKey);
      let item;

      if (action.id === "rest") {
        const data = {
          extracted: {
            workoutKind: "other" as const,
            date: dateKey,
            distanceKm: null, duration: null, avgPace: null, avgSpeedKmh: null,
            avgHR: null, maxHR: null, cadence: null, calories: null, elevationGain: null,
            vo2Max: null, sweatLossMl: null, visibleMetrics: [],
            intensity: "easy" as const, rpe: 1,
          },
          coach: {
            workoutSummary: "พัก / Recovery วันนี้",
            intensityAssessment: "rest",
            trainingLoadNote: "วันพัก",
            wasTooHard: false,
            recoveryAdvice: "พักให้เต็มที่",
            nutritionAfterWorkout: "กินอาหารตามปกติ ดื่มน้ำให้พอ",
            nextWorkoutSuggestion: "กลับมาซ้อมตามแผนพรุ่งนี้",
            coachNote: "บันทึกผ่าน Quick Log",
          },
          quickLog: true,
          quickLogKind: "rest",
        };
        item = createHistoryItem("workout", data, recordedAt);
      } else if (action.id === "walk") {
        const data = {
          extracted: {
            workoutKind: "walk" as const,
            date: dateKey,
            distanceKm: null, duration: "00:20:00", avgPace: null, avgSpeedKmh: null,
            avgHR: null, maxHR: null, cadence: null, calories: null, elevationGain: null,
            vo2Max: null, sweatLossMl: null, visibleMetrics: [],
            intensity: "easy" as const, rpe: 2,
          },
          coach: {
            workoutSummary: "เดินเบา 20 นาที",
            intensityAssessment: "easy",
            trainingLoadNote: "Low load — เดินเบา",
            wasTooHard: false,
            recoveryAdvice: "Active recovery ดีมาก",
            nutritionAfterWorkout: "ดื่มน้ำให้พอ",
            nextWorkoutSuggestion: "พร้อมซ้อมต่อตามแผน",
            coachNote: "บันทึกผ่าน Quick Log",
          },
          quickLog: true,
          quickLogKind: "walk",
        };
        item = createHistoryItem("workout", data, recordedAt);
      } else if (action.id === "protein") {
        const data = {
          extracted: {
            mealType: "snack",
            mealSlot: "snack",
            date: dateKey,
            foods: ["โปรตีน (quick log)"],
            caloriesKcal: null,
            proteinG: null,
            carbsG: null,
            fatG: null,
            fiberG: null,
            sodiumMg: null,
            confidence: "low" as const,
            visibleItems: ["โปรตีน"],
            portionNotes: "บันทึกผ่าน Quick Log",
            rawText: null,
          },
          coach: {
            mealSummary: "กินโปรตีนแล้ว (quick log)",
            nutritionHighlights: "โปรตีน",
            improvementTips: "",
            portionFeedback: "",
            coachNote: "บันทึกว่ากินโปรตีนแล้ว ยังไม่มีปริมาณจริง",
          },
          quickLog: true,
          quickLogKind: "protein",
        };
        item = createHistoryItem("meal", data, recordedAt);
      } else {
        return;
      }

      const result = await saveHistoryItems([item]);
      if (!result.ok) throw new Error(result.error ?? "save failed");
      setSaved(action.id);
      onActivitySaved?.();
      window.dispatchEvent(new CustomEvent("runmate:cloud-data-updated"));
      setTimeout(() => setSaved(null), 3000);
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">บันทึกไว ๆ</p>
      <p className="mt-0.5 text-xs text-slate-400">สำหรับเรื่องเล็ก ๆ วันนี้ ไม่ต้องอัปโหลดรูปก็ได้</p>

      {error && (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      )}

      {saved && (
        <p className="mt-2 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-xs font-semibold text-[var(--primary-strong)]">
          บันทึกแล้ว ✓
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          const isDone = saved === action.id;
          const isLoading = pending === action.id;
          return (
            <button
              key={action.id}
              type="button"
              disabled={!!pending}
              onClick={() => void handleAction(action)}
              className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors
                ${isDone
                  ? "bg-[var(--primary)] text-white"
                  : "bg-white border border-slate-200 text-slate-700 hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95"
                }
                disabled:opacity-50`}
            >
              <span>{action.icon}</span>
              <span>{isLoading ? "กำลังบันทึก…" : action.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
