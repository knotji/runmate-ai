"use client";

import { useState } from "react";
import { buildRunnerHistoryStats } from "@/lib/analyzeHistory";
import { loadProfileFromSupabase, saveProfileToSupabase } from "@/lib/profileStorage";
import { loadHistoryItems } from "@/lib/cloudHistory";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import {
  getAutoSavableProfileUpdates,
  filterManualFields,
  buildSourceUpdates,
} from "@/lib/profile/autoSaveHistorySuggestions";
import type { ProfileAnalysisResult, ProfileAnalysisSuggestions } from "@/lib/analyzeHistory";
import type { UserProfile } from "@/types/profile";

type State = "idle" | "loading" | "done" | "error";

type ReviewItem = {
  key: keyof ProfileAnalysisSuggestions;
  label: string;
  value: unknown;
};

type ManualItem = {
  key: keyof ProfileAnalysisSuggestions;
  label: string;
  currentValue: unknown;
  suggestedValue: unknown;
};

const SHORT_LABEL: Partial<Record<keyof ProfileAnalysisSuggestions, string>> = {
  currentLongestRunKm:   "วิ่งไกลสุด",
  weeklyMileageKm:       "km/สัปดาห์",
  runningDaysPerWeek:    "วันวิ่ง/สัปดาห์",
  easyPace:              "Easy pace",
  easyHrCap:             "Easy HR",
  maxHr:                 "Max HR",
  averageCadence:        "Cadence",
  preferredTrainingDays: "วันซ้อม",
  preferredLongRunDay:   "วัน long run",
  averageSleepHours:     "ชั่วโมงนอน",
  normalSleepScore:      "Sleep score",
  normalEnergyScore:     "Energy score",
  normalRestingHr:       "Resting HR",
  normalHrv:             "HRV",
  recoveryRules:         "กฎ recovery",
  riskNotes:             "ความเสี่ยง",
  injuryHistory:         "ประวัติบาดเจ็บ",
  currentLevel:          "ระดับปัจจุบัน",
  vo2max:                "VO2max",
};

function fieldLabel(key: keyof ProfileAnalysisSuggestions) {
  return SHORT_LABEL[key] ?? key;
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

async function applyAndPersist(base: UserProfile, updates: Partial<UserProfile>, sourceUpdates: Record<string, "history_analysis">) {
  const merged: UserProfile = {
    ...base,
    ...updates,
    fieldSources: { ...base.fieldSources, ...sourceUpdates },
  };
  const result = await saveProfileToSupabase(merged);
  if (!result.ok) throw new Error("message" in result ? result.message : result.reason);
  invalidateCoachCache();
  return merged;
}

export function ProfileHistoryAnalyzer() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<ProfileAnalysisResult | null>(null);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [error, setError] = useState("");
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  async function analyze() {
    setState("loading");
    setError("");
    setResult(null);
    setSavedKeys([]);
    setReviewItems([]);
    setManualItems([]);

    try {
      const [historyResult, profileResult] = await Promise.all([
        loadHistoryItems(["sleep", "workout"]),
        loadProfileFromSupabase(),
      ]);
      if (!historyResult.ok) throw new Error(historyResult.error);
      if (!profileResult.ok) throw new Error("message" in profileResult ? profileResult.message : profileResult.reason);

      const stats = buildRunnerHistoryStats(historyResult.items);
      const profile = profileResult.profile;
      setCurrentProfile(profile ?? null);

      const res = await fetch("/api/analyze-profile-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats, currentProfile: profile }),
      });

      if (!res.ok) throw new Error("วิเคราะห์ไม่สำเร็จ");
      const json = await res.json() as { data?: ProfileAnalysisResult };
      const data = json.data ?? (json as unknown as ProfileAnalysisResult);

      const { confidence } = data.summary;
      const { suggestions } = data;

      // Supplement maxHr from observed data if AI returned null
      if (suggestions.maxHr == null && stats.maxObservedHR != null) {
        suggestions.maxHr = stats.maxObservedHR;
      }

      // Compute auto-saveable updates
      const allUpdates = getAutoSavableProfileUpdates({ suggestions, confidence });

      // Filter out manual fields — don't overwrite what the user edited
      const existingSources = profile?.fieldSources ?? {};
      const { toSave, manualSkipped } = filterManualFields({ updates: allUpdates, existingSources });

      const updatedKeys = Object.keys(toSave);

      // Apply & persist
      if (updatedKeys.length > 0) {
        const base = profile ?? { displayName: "นักวิ่ง" };
        const merged = await applyAndPersist(base as UserProfile, toSave, buildSourceUpdates(updatedKeys));
        setCurrentProfile(merged);
      }

      // Manual-skipped items (user had manually edited these)
      const manualReview: ManualItem[] = manualSkipped
        .filter((k) => suggestions[k as keyof ProfileAnalysisSuggestions] != null)
        .map((k) => ({
          key: k as keyof ProfileAnalysisSuggestions,
          label: fieldLabel(k as keyof ProfileAnalysisSuggestions),
          currentValue: (profile as Record<string, unknown>)?.[k],
          suggestedValue: suggestions[k as keyof ProfileAnalysisSuggestions],
        }));

      // Review items: suggested but not auto-saved and not manual-skipped
      const autoSavedSet = new Set(updatedKeys);
      const manualSet = new Set(manualSkipped);
      const review: ReviewItem[] = (
        Object.keys(suggestions) as Array<keyof ProfileAnalysisSuggestions>
      )
        .filter(
          (k) =>
            k !== "trainingPreferenceSummary" &&
            suggestions[k] != null &&
            !autoSavedSet.has(k) &&
            !manualSet.has(k)
        )
        .map((k) => ({ key: k, label: fieldLabel(k), value: suggestions[k] }));

      setResult(data);
      setSavedKeys(updatedKeys);
      setReviewItems(review);
      setManualItems(manualReview);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setState("error");
    }
  }

  async function overrideManual(key: keyof ProfileAnalysisSuggestions, suggestedValue: unknown) {
    const base = currentProfile ?? { displayName: "นักวิ่ง" };
    const updates = { [key]: suggestedValue } as Partial<UserProfile>;
    const merged = await applyAndPersist(base as UserProfile, updates, buildSourceUpdates([key]));
    setCurrentProfile(merged);
    setManualItems((prev) => prev.filter((i) => i.key !== key));
  }

  async function acceptReviewItem(key: keyof ProfileAnalysisSuggestions, suggestedValue: unknown) {
    const base = currentProfile ?? { displayName: "นักวิ่ง" };
    const updates = { [key]: suggestedValue } as Partial<UserProfile>;
    const merged = await applyAndPersist(base as UserProfile, updates, buildSourceUpdates([key]));
    setCurrentProfile(merged);
    setReviewItems((prev) => prev.filter((i) => i.key !== key));
  }

  function reset() {
    setState("idle");
    setResult(null);
    setError("");
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-50 p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#42677f]" />
        <p className="text-sm text-slate-600">กำลังวิเคราะห์และอัปเดตโปรไฟล์…</p>
        <p className="text-xs text-slate-400">อ่านสถิติ 90 วันล่าสุด</p>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────── */
  if (state === "error") {
    return (
      <div className="rounded-2xl bg-red-50 p-4 space-y-2">
        <p className="text-sm font-bold text-red-600">วิเคราะห์จากประวัติไม่สำเร็จ ลองใหม่อีกครั้ง</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button type="button" className="btn-secondary w-full text-sm" onClick={reset}>ลองใหม่</button>
      </div>
    );
  }

  /* ── Idle + Done ─────────────────────────────────────────── */
  return (
    <div className="space-y-3">
      {state === "done" && result && (
        <div className="space-y-3">
          {result.summary.confidence === "low" ? (
            <div className="rounded-2xl bg-amber-50 p-4 space-y-1">
              <p className="text-sm font-bold text-amber-700">ข้อมูลยังน้อยเกินไป</p>
              <p className="text-xs text-amber-600">เลยยังไม่อัปเดตโปรไฟล์ให้อัตโนมัติ</p>
              {result.summary.notes && (
                <p className="mt-1 text-xs text-slate-500">{result.summary.notes}</p>
              )}
            </div>
          ) : (
            <>
              {/* Auto-saved success */}
              <div className="rounded-2xl bg-[#e7efea] p-4 space-y-1">
                <p className="text-sm font-bold text-[#17201d]">อัปเดตโปรไฟล์จากประวัติแล้ว</p>
                {savedKeys.length > 0 && (
                  <p className="text-xs text-slate-600">
                    อัปเดต:{" "}
                    {savedKeys
                      .map((k) => fieldLabel(k as keyof ProfileAnalysisSuggestions))
                      .join(", ")}
                  </p>
                )}
              </div>

              {/* Training preference summary */}
              {result.suggestions.trainingPreferenceSummary && (
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
                    สรุปรูปแบบการซ้อม
                  </p>
                  <p className="text-sm text-slate-700">
                    {result.suggestions.trainingPreferenceSummary}
                  </p>
                </div>
              )}

              {/* Manual-overrideable items */}
              {manualItems.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-xs font-bold text-slate-600">
                    ค่าที่คุณแก้เองอยู่ — ต้องการแทนที่ด้วยค่าจากประวัติไหม?
                  </p>
                  {manualItems.map((item) => (
                    <div key={item.key} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-600">{item.label}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-xs">
                          <span className="text-slate-400">ปัจจุบัน: {formatValue(item.currentValue)}</span>
                          <span className="text-slate-300">→</span>
                          <span className="font-medium text-[#42677f]">{formatValue(item.suggestedValue)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void overrideManual(item.key, item.suggestedValue)}
                        className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                      >
                        แทนที่
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Review-only items */}
              {reviewItems.length > 0 && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                  <p className="text-xs font-bold text-amber-700">
                    มีบางคำแนะนำที่ควรตรวจสอบก่อนบันทึก
                  </p>
                  {reviewItems.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 text-xs border-b border-amber-200/50 pb-1.5 last:border-0 last:pb-0">
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-600 font-medium">{item.label}: </span>
                        <span className="font-bold text-amber-800">{formatValue(item.value)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void acceptReviewItem(item.key, item.value)}
                        className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-bold text-amber-800 hover:bg-amber-200"
                      >
                        นำมาใช้
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="rounded-2xl bg-slate-50 p-3 space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-slate-500">⚠️ {w}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button type="button" onClick={analyze} className="btn-primary w-full py-3 text-sm">
        วิเคราะห์จากประวัติการซ้อม
      </button>
      <p className="text-center text-xs text-slate-400">
        ระบบจะอัปเดตค่าที่มั่นใจให้ทันที และให้คุณตรวจสอบค่าที่ไม่ชัดเจนก่อนบันทึก
      </p>
    </div>
  );
}
