"use client";

import { useState } from "react";
import { buildRunnerHistoryStats } from "@/lib/analyzeHistory";
import { loadProfileFromSupabase, saveProfileToSupabase } from "@/lib/profileStorage";
import { loadHistoryItems } from "@/lib/cloudHistory";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import {
  buildAutoSaveDecisions,
  filterManualFields,
  buildSourceUpdates,
} from "@/lib/profile/autoSaveHistorySuggestions";
import { calculateNutritionTargetsFromWeight } from "@/lib/nutritionTargets";
import type { ProfileAnalysisResult, ProfileAnalysisSuggestions } from "@/lib/analyzeHistory";
import type { UserProfile } from "@/types/profile";


type State = "idle" | "loading" | "done" | "error";

type ManualItem = {
  key: string;
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

const SHORT_LABEL_ALL: Record<string, string> = {
  ...SHORT_LABEL,
  weightKg:             "น้ำหนัก",
  proteinTargetG:       "Protein target",
  carbTargetRestDayG:   "Carb วันพัก",
  carbTargetEasyDayG:   "Carb easy day",
  carbTargetHardDayG:   "Carb hard day",
};

function fieldLabel(key: keyof ProfileAnalysisSuggestions) {
  return SHORT_LABEL[key] ?? key;
}



function formatValueWithUnit(key: string, v: unknown): string {
  if (v == null || v === "") return "—";
  const strVal = Array.isArray(v) ? v.join(", ") : String(v);
  if (key === "proteinTargetG" || key === "carbTargetRestDayG" || key === "carbTargetEasyDayG" || key === "carbTargetHardDayG") {
    return `${strVal} g/day`;
  }
  if (key === "weightKg") {
    return `${strVal} kg`;
  }
  if (key === "heightCm") {
    return `${strVal} cm`;
  }
  if (key === "weeklyMileageKm") {
    return `${strVal} km/สัปดาห์`;
  }
  if (key === "currentLongestRunKm") {
    return `${strVal} km`;
  }
  if (key === "averageSleepHours") {
    return `${strVal} ชม.`;
  }
  if (key === "easyHrCap" || key === "maxHr" || key === "normalRestingHr") {
    return `${strVal} bpm`;
  }
  return strVal;
}

async function applyAndPersist(
  base: UserProfile,
  updates: Partial<UserProfile>,
  sourceUpdates: Record<string, "history_analysis">,
  onProfileUpdated?: (profile: UserProfile) => void
) {
  const merged: UserProfile = {
    ...base,
    ...updates,
    fieldSources: { ...base.fieldSources, ...sourceUpdates },
  };
  const result = await saveProfileToSupabase(merged);
  if (!result.ok) throw new Error("message" in result ? result.message : result.reason);
  console.info("[profile-refresh]", {
    event: "profile-saved",
    savedKeys: Object.keys(updates),
  });
  const freshResult = await loadProfileFromSupabase();
  if (!freshResult.ok) throw new Error("message" in freshResult ? freshResult.message : freshResult.reason);
  const freshProfile = freshResult.profile ?? merged;
  console.info("[profile-refresh]", {
    event: "fresh-profile-loaded",
    updatedAt: freshProfile.updatedAt ?? null,
  });
  onProfileUpdated?.(freshProfile);
  console.info("[profile-refresh]", {
    event: "onProfileUpdated called",
    updatedAt: freshProfile.updatedAt ?? null,
  });
  invalidateCoachCache();
  return freshProfile;
}

export function ProfileHistoryAnalyzer({ onProfileUpdated }: { onProfileUpdated?: (profile: UserProfile) => void }) {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<ProfileAnalysisResult | null>(null);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [error, setError] = useState("");
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  async function analyze() {
    setState("loading");
    setError("");
    setResult(null);
    setSavedKeys([]);
    setManualItems([]);

    try {
      const [historyResult, profileResult] = await Promise.all([
        loadHistoryItems(["sleep", "workout", "body"]),
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

      // Safe merge — validates & coerces AI suggestions, guards against null-overwrite
      const { toSave, manualSkipped } = buildAutoSaveDecisions({
        suggestions,
        confidence,
        existingProfile: profile ?? undefined,
        existingSources: profile?.fieldSources ?? {},
      });

      const updatedKeys = Object.keys(toSave);

      // Track current profile in a local var so the nutrition block sees the latest
      // version without waiting for React state to flush (setCurrentProfile is async).
      let latestSavedProfile: UserProfile = profile ?? ({ displayName: "นักวิ่ง" } as UserProfile);

      // Apply & persist training stats
       // Manual-skipped items from AI analysis (user had manually edited these, or they are protected; show override UI)
      const manualReview: ManualItem[] = manualSkipped
        .filter((k) => suggestions[k as keyof ProfileAnalysisSuggestions] != null)
        .map((k) => ({
          key: k,
          label: fieldLabel(k as keyof ProfileAnalysisSuggestions),
          currentValue: (profile as Record<string, unknown>)?.[k],
          suggestedValue: suggestions[k as keyof ProfileAnalysisSuggestions],
        }));

      // ── Nutrition targets from body history (deterministic, no AI needed) ──
      if (stats.latestWeightKg != null) {
        const nutritionGoal = profile?.nutritionGoal ?? null;
        const weeklyMileageKm = stats.weeklyMileageEstimate;
        const targets = calculateNutritionTargetsFromWeight(stats.latestWeightKg, nutritionGoal, weeklyMileageKm);

        console.info("[nutrition-target-debug]", {
          latestWeightKg: stats.latestWeightKg,
          nutritionGoal,
          proteinMultiplier: targets.proteinMultiplier,
          carbMultipliers: { rest: 3, easy: 4, hard: weeklyMileageKm != null && weeklyMileageKm >= 50 ? 6 : 5 },
          calculated: {
            proteinTargetG: targets.proteinTargetG,
            carbTargetRestDayG: targets.carbTargetRestDayG,
            carbTargetEasyDayG: targets.carbTargetEasyDayG,
            carbTargetHardDayG: targets.carbTargetHardDayG,
          },
        });

        const nutritionFieldUpdates: Partial<UserProfile> = {
          weightKg: stats.latestWeightKg,
          proteinTargetG: targets.proteinTargetG,
          carbTargetRestDayG: targets.carbTargetRestDayG,
          carbTargetEasyDayG: targets.carbTargetEasyDayG,
          carbTargetHardDayG: targets.carbTargetHardDayG,
        };

        const { toSave: nutritionToSave, manualSkipped: nutritionManualSkipped } = filterManualFields({
          updates: nutritionFieldUpdates,
          existingSources: profile?.fieldSources ?? {},
          existingProfile: profile ?? undefined,
        });

        console.info("[nutrition-target-debug]", {
          skippedManual: nutritionManualSkipped,
        });

        const nutritionKeys = Object.keys(nutritionToSave);
        // Use latestSavedProfile (updated synchronously above) — not the stale React state
        if (nutritionKeys.length > 0) {
          const merged = await applyAndPersist(latestSavedProfile, nutritionToSave, buildSourceUpdates(nutritionKeys), onProfileUpdated);
          setCurrentProfile(merged);
          latestSavedProfile = merged;
          setSavedKeys((prev) => [...new Set([...prev, ...nutritionKeys])]);
        }

        // Build override items for nutrition fields the user had manually set
        const nutritionManualItems: ManualItem[] = nutritionManualSkipped.map((k) => ({
          key: k,
          label: SHORT_LABEL_ALL[k] ?? k,
          currentValue: (profile as Record<string, unknown>)?.[k],
          suggestedValue: (nutritionFieldUpdates as Record<string, unknown>)[k],
        }));
        manualReview.push(...nutritionManualItems);
      }

      setResult(data);
      setSavedKeys((prev) => [...new Set([...prev, ...updatedKeys])]);
      setManualItems(manualReview);  // includes both AI and nutrition manual items
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setState("error");
    }
  }

  async function overrideManual(key: string, suggestedValue: unknown) {
    const base = currentProfile ?? { displayName: "นักวิ่ง" };
    const updates = { [key]: suggestedValue } as Partial<UserProfile>;
    const merged = await applyAndPersist(base as UserProfile, updates, buildSourceUpdates([key]), onProfileUpdated);
    setCurrentProfile(merged);
    setManualItems((prev) => prev.filter((i) => i.key !== key));
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
              {/* Section A: อัปเดตแล้ว */}
              <div className="rounded-2xl border border-green-200 bg-[#f5faf7] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#2a5a39]">อัปเดตแล้ว</p>
                {savedKeys.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {savedKeys.map((k) => (
                      <div key={k} className="text-xs flex justify-between items-center border-b border-slate-100/50 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-slate-500">{SHORT_LABEL_ALL[k] ?? fieldLabel(k as keyof ProfileAnalysisSuggestions)}</span>
                        <span className="font-bold text-slate-800">
                          {formatValueWithUnit(k, currentProfile?.[k as keyof UserProfile])}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">ไม่มีการอัปเดตค่าอัตโนมัติ (คงค่าเดิมไว้ทั้งหมด)</p>
                )}
              </div>

              {/* Section B: ระบบแนะนำ แต่ยังไม่ทับค่าที่คุณแก้เอง */}
              {manualItems.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">
                    ระบบแนะนำ แต่ยังไม่ทับค่าที่คุณแก้เอง
                  </p>
                  <div className="divide-y divide-slate-100">
                    {manualItems.map((item) => (
                      <div key={item.key} className="py-3 first:pt-0 last:pb-0 space-y-2">
                        <p className="text-xs font-bold text-slate-800">{item.label}</p>
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs space-y-0.5">
                            <p className="text-slate-500">
                              ค่าที่ใช้อยู่: <span className="font-semibold text-slate-700">{formatValueWithUnit(item.key, item.currentValue)}</span>
                              <span className="ml-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-500">แก้เอง</span>
                            </p>
                            <p className="text-slate-500">
                              ระบบแนะนำ: <span className="font-semibold text-[#42677f]">{formatValueWithUnit(item.key, item.suggestedValue)}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void overrideManual(item.key, item.suggestedValue)}
                            className="shrink-0 rounded-full bg-[#e7efea] px-3.5 py-2 text-xs font-bold text-[#2a5a39] hover:bg-[#d4e8db] transition-colors"
                          >
                            ใช้ค่าระบบแทน
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              {result.warnings && result.warnings.length > 0 && (
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
        วิเคราะห์และอัปเดตค่าที่ปลอดภัย
      </button>
      <p className="text-center text-xs text-slate-400">
        ระบบจะอัปเดตเฉพาะค่าที่มั่นใจ และจะไม่ทับค่าที่คุณแก้เอง
      </p>
    </div>
  );
}
