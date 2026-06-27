"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { todayBangkokDateKey, dateKeyToRecordedAt } from "@/lib/date";

const PROTEIN_PRESETS = [15, 25, 30] as const;

type QuickAction = {
  id: string;
  label: string;
  icon: string;
  confirmMessage: string;
  isDone?: boolean; // shows done/disabled visual to prevent duplicate taps
};

function buildActions(opts: {
  hasActivityToday: boolean;
  restSavedSession: boolean;
  hasSummaryToday: boolean;
  hasProteinToday: boolean;
  hasActivePain: boolean;
}): QuickAction[] {
  const { hasActivityToday, restSavedSession, hasSummaryToday, hasProteinToday, hasActivePain } = opts;
  return [
    {
      id: "rest",
      label: restSavedSession ? "พักต่อแล้ว" : hasActivityToday ? "พักต่อวันนี้" : "วันนี้พัก",
      icon: "😴",
      confirmMessage: hasActivityToday ? "บันทึก Recovery วันนี้?" : "บันทึกว่าพักวันนี้?",
      isDone: restSavedSession,
    },
    { id: "walk",    label: "เดินเบา 20 นาที",                                 icon: "🚶", confirmMessage: "บันทึกเดินเบา 20 นาที?" },
    { id: "protein", label: hasProteinToday ? "เพิ่มโปรตีนอีก" : "กินโปรตีนแล้ว", icon: "🥚", confirmMessage: "" },
    { id: "pain",    label: hasActivePain ? "อัปเดตอาการเจ็บ" : "ปวด 1/10",        icon: "🩹", confirmMessage: "" },
    { id: "summary", label: hasSummaryToday ? "ดู/แก้สรุป" : "สรุปท้ายวัน",       icon: "📋", confirmMessage: "" },
  ];
}

type Props = {
  onActivitySaved?: () => void;
  onOpenEndOfDay?: () => void;
  hasActivityToday?: boolean;
  hasSummaryToday?: boolean;  // shows "ดู/แก้สรุป" when today summary exists
  hasProteinToday?: boolean;  // shows "เพิ่มโปรตีนอีก" when protein already logged
  hasActivePain?: boolean;    // shows "อัปเดตอาการเจ็บ" instead of "ปวด 1/10"
};

// ─── Protein modal ────────────────────────────────────────────────────────────

function ProteinModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (g: number) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number>(25);
  const [custom, setCustom]     = useState<string>("");
  const [mode, setMode]         = useState<"preset" | "custom">("preset");

  const effectiveAmount = mode === "custom" ? Math.round(Number(custom) || 0) : selected;
  const canSave = effectiveAmount >= 1 && effectiveAmount <= 300;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-6 pb-8 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#17201d]">กินโปรตีนประมาณเท่าไหร่?</h2>
          <button type="button" onClick={onCancel} className="text-slate-400 text-xl leading-none">✕</button>
        </div>

        <p className="text-xs text-slate-400">ถ้าไม่แน่ใจ เลือกคร่าว ๆ ได้ หรือไปบันทึกมื้ออาหารแทน</p>

        <div className="flex gap-2">
          {PROTEIN_PRESETS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => { setMode("preset"); setSelected(g); }}
              className={`flex-1 rounded-2xl py-3 text-sm font-bold transition-colors
                ${mode === "preset" && selected === g
                  ? "bg-[var(--primary)] text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-[var(--primary-soft)]"}`}
            >
              {g}g
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`flex-1 rounded-2xl py-3 text-sm font-bold transition-colors
              ${mode === "custom"
                ? "bg-[var(--primary)] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-[var(--primary-soft)]"}`}
          >
            กรอกเอง
          </button>
        </div>

        {mode === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={300}
              placeholder="เช่น 20"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-[var(--primary)] focus:outline-none"
              aria-label="ปริมาณโปรตีน (กรัม)"
            />
            <span className="shrink-0 text-sm text-slate-500">g</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-2xl border border-slate-200 py-3 text-sm font-semibold text-slate-600"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => canSave && onConfirm(effectiveAmount)}
            className="flex-1 rounded-2xl bg-[var(--primary)] py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            บันทึกโปรตีน {canSave ? `${effectiveAmount}g` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QuickLogCard ─────────────────────────────────────────────────────────────

export function QuickLogCard({
  onActivitySaved,
  onOpenEndOfDay,
  hasActivityToday = false,
  hasSummaryToday = false,
  hasProteinToday = false,
  hasActivePain = false,
}: Props) {
  const router = useRouter();
  const [pending,            setPending]            = useState<string | null>(null);
  const [saved,              setSaved]              = useState<string | null>(null);
  const [error,              setError]              = useState<string | null>(null);
  const [showProteinModal,   setShowProteinModal]   = useState(false);
  // Persists within session to prevent duplicate rest taps without needing a DB query
  const [restSavedSession,   setRestSavedSession]   = useState(false);

  const ACTIONS = buildActions({ hasActivityToday, restSavedSession, hasSummaryToday, hasProteinToday, hasActivePain });

  async function saveProtein(proteinG: number) {
    setShowProteinModal(false);
    setPending("protein");
    setError(null);
    try {
      const dateKey   = todayBangkokDateKey();
      const recordedAt = dateKeyToRecordedAt(dateKey);
      // Infer meal slot from current Bangkok hour
      const hour = new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok", hour: "numeric", hour12: false });
      const h = parseInt(hour, 10);
      const slot = h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 17 ? "snack" : "dinner";

      const data = {
        extracted: {
          mealType: slot,
          mealSlot: slot,
          date: dateKey,
          foods: [`โปรตีน ${proteinG}g (quick log)`],
          caloriesKcal: null,
          proteinG,
          carbsG: null,
          fatG: null,
          fiberG: null,
          sodiumMg: null,
          confidence: "low" as const,
          visibleItems: [`โปรตีน ${proteinG}g`],
          portionNotes: `Quick log: โปรตีน ${proteinG}g`,
          rawText: null,
        },
        coach: {
          mealSummary: `กินโปรตีนแล้ว ${proteinG}g`,
          nutritionHighlights: `โปรตีน ${proteinG}g`,
          improvementTips: "",
          portionFeedback: "",
          coachNote: `บันทึกไว ๆ: โปรตีน ${proteinG}g เท่านั้น ยังไม่มีข้อมูล kcal/carbs/fat`,
        },
        quickLog: true,
        quickLogKind: "protein",
        quickLogProteinG: proteinG,
      };
      const item = createHistoryItem("meal", data, recordedAt);
      const result = await saveHistoryItems([item]);
      if (!result.ok) throw new Error(result.error ?? "save failed");
      setSaved("protein");
      onActivitySaved?.();
      window.dispatchEvent(new CustomEvent("runmate:cloud-data-updated"));
      setTimeout(() => setSaved(null), 3000);
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setPending(null);
    }
  }

  async function handleAction(action: QuickAction) {
    if (pending) return;
    if (action.isDone) return; // block duplicate rest taps
    setError(null);

    if (action.id === "summary") { onOpenEndOfDay?.(); return; }
    if (action.id === "pain")    { router.push("/pain"); return; }
    if (action.id === "protein") { setShowProteinModal(true); return; }

    const confirmed = window.confirm(action.confirmMessage);
    if (!confirmed) return;

    setPending(action.id);
    try {
      const dateKey    = todayBangkokDateKey();
      const recordedAt = dateKeyToRecordedAt(dateKey);
      let item;

      if (action.id === "rest") {
        const isRecovery = hasActivityToday;
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
            workoutSummary: isRecovery ? "พักต่อวันนี้ / Recovery" : "พัก / Recovery วันนี้",
            intensityAssessment: "rest",
            trainingLoadNote: isRecovery ? "Recovery หลังซ้อม" : "วันพัก",
            wasTooHard: false,
            recoveryAdvice: "พักให้เต็มที่",
            nutritionAfterWorkout: "กินอาหารตามปกติ ดื่มน้ำให้พอ",
            nextWorkoutSuggestion: "กลับมาซ้อมตามแผนพรุ่งนี้",
            coachNote: "บันทึกผ่าน Quick Log",
          },
          quickLog: true, quickLogKind: isRecovery ? "recovery" : "rest",
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
          quickLog: true, quickLogKind: "walk",
        };
        item = createHistoryItem("workout", data, recordedAt);
      } else {
        return;
      }

      const result = await saveHistoryItems([item]);
      if (!result.ok) throw new Error(result.error ?? "save failed");
      setSaved(action.id);
      if (action.id === "rest") setRestSavedSession(true);
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
    <>
      {showProteinModal && (
        <ProteinModal
          onConfirm={(g) => void saveProtein(g)}
          onCancel={() => setShowProteinModal(false)}
        />
      )}

      <section className="rounded-3xl border border-[var(--color-border-soft)] bg-[var(--surface-muted)] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-soft)]">บันทึกไว ๆ</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">สำหรับเรื่องเล็ก ๆ วันนี้ ไม่ต้องอัปโหลดรูปก็ได้</p>

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
            const isFlashing = saved === action.id;
            const isLoading  = pending === action.id;
            const isDone     = action.isDone;
            return (
              <button
                key={action.id}
                type="button"
                disabled={!!pending || isDone}
                onClick={() => void handleAction(action)}
                className={`flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition-colors
                  ${isDone
                    ? "bg-[var(--surface-muted)] border border-[var(--color-border-soft)] text-[var(--color-text-soft)] cursor-default"
                    : isFlashing
                      ? "bg-[var(--primary)] text-white"
                      : "bg-[var(--surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--primary)] hover:text-[var(--primary)] active:scale-95"
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
    </>
  );
}
