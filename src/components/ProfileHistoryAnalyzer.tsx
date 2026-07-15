"use client";

import { useEffect, useState, useRef } from "react";
import { shouldRunProfileAutoSync } from "@/lib/profileAutoSync";
import { buildRunnerHistoryStats } from "@/lib/analyzeHistory";
import { loadProfileFromSupabase, saveProfileToSupabase } from "@/lib/profileStorage";
import { loadHistoryItems } from "@/lib/cloudHistory";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import {
  buildAutoSaveDecisions,
  filterManualFields,
  buildSourceUpdates,
} from "@/lib/profile/autoSaveHistorySuggestions";
import {
  addDismissedSuggestion,
  clearDismissedSuggestion,
  isSuggestionDismissed,
} from "@/lib/profile/dismissedSuggestions";
import { calculateNutritionTargetsFromWeight } from "@/lib/nutritionTargets";
import type { ProfileAnalysisResult, ProfileAnalysisSuggestions } from "@/lib/analyzeHistory";
import type { UserProfile } from "@/types/profile";
import { formatBpm } from "@/lib/format";


export type SuggestedValueStatus = "idle" | "applied" | "ignored" | "edited";

export function getSuggestedValueLabel(status: SuggestedValueStatus): string {
  switch (status) {
    case "applied": return "ใช้ค่าแนะนำแล้ว";
    case "ignored": return "ใช้ค่าปัจจุบัน";
    case "edited": return "แก้ไขเอง";
    default: return "ค่าแนะนำ";
  }
}

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
  bodyFatPercent:       "% ไขมัน",
  muscleKg:             "กล้ามเนื้อ",
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
  if (key === "weightKg") return `${strVal} kg`;
  if (key === "heightCm") return `${strVal} cm`;
  if (key === "weeklyMileageKm") return `${strVal} กม./สัปดาห์`;
  if (key === "currentLongestRunKm") return `${strVal} กม.`;
  if (key === "averageSleepHours") return `${strVal} ชม.`;
  if (key === "easyHrCap" || key === "maxHr" || key === "normalRestingHr") return formatBpm(strVal);
  return strVal;
}

function buildSyncSummaryMessage(autoUpdated: number, pendingCount: number, skippedManual: number): string {
  const parts: string[] = [];
  if (autoUpdated > 0) parts.push(`อัปเดตอัตโนมัติ ${autoUpdated} ค่า`);
  if (skippedManual > 0) parts.push(`ข้าม ${skippedManual} ค่าที่คุณแก้เอง`);
  if (pendingCount > 0) parts.push(`มี ${pendingCount} คำแนะนำรอให้ตรวจ`);
  if (parts.length === 0) return "โปรไฟล์ยังเหมาะสมอยู่ ยังไม่มีค่าที่ต้องปรับตอนนี้";
  return parts.join(" · ");
}

async function applyAndPersist(
  base: UserProfile,
  updates: Partial<UserProfile>,
  sourceUpdates: Record<string, "history_analysis" | "manual">,
  onProfileUpdated?: (profile: UserProfile) => void,
) {
  const merged: UserProfile = {
    ...base,
    ...updates,
    fieldSources: { ...base.fieldSources, ...sourceUpdates },
  };
  const result = await saveProfileToSupabase(merged);
  if (!result.ok) throw new Error("message" in result ? result.message : result.reason);
  console.info("[profile-refresh]", { event: "profile-saved", savedKeys: Object.keys(updates) });
  const freshResult = await loadProfileFromSupabase();
  if (!freshResult.ok) throw new Error("message" in freshResult ? freshResult.message : freshResult.reason);
  const freshProfile = freshResult.profile ?? merged;
  console.info("[profile-refresh]", { event: "fresh-profile-loaded", updatedAt: freshProfile.updatedAt ?? null });
  onProfileUpdated?.(freshProfile);
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
  const [statusMap, setStatusMap] = useState<Record<string, SuggestedValueStatus>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editVal, setEditVal] = useState<string>("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<string | null>(null);
  const hasAutoSyncedThisMount = useRef(false);

  useEffect(() => {
    loadProfileFromSupabase().then((result) => {
      if (result.ok && result.profile) {
        const profile = result.profile;
        setCurrentProfile(profile);
        const autoSyncEnabledVal = profile.autoProfileSyncEnabled ?? true;
        setAutoSyncEnabled(autoSyncEnabledVal);
        const lastSyncAtVal = profile.lastAutoProfileSyncAt ?? null;
        setLastSyncAt(lastSyncAtVal);

        const check = shouldRunProfileAutoSync({
          autoProfileSyncEnabled: autoSyncEnabledVal,
          lastAutoProfileSyncAt: lastSyncAtVal,
          trigger: "profile_open",
        });

        if (check.shouldRun && !hasAutoSyncedThisMount.current) {
          hasAutoSyncedThisMount.current = true;
          void analyze();
        }
      } else {
        setAutoSyncEnabled(true);
      }
    }).catch(() => {
      setAutoSyncEnabled(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleAutoSync() {
    const next = !autoSyncEnabled;
    setAutoSyncEnabled(next);
    const base = currentProfile ?? ({ displayName: "นักวิ่ง" } as UserProfile);
    try {
      const updated = { ...base, autoProfileSyncEnabled: next };
      await saveProfileToSupabase(updated);
      setCurrentProfile(updated);
    } catch {
      setAutoSyncEnabled(!next);
    }
  }

  async function recordSyncTime(savedProfile: UserProfile) {
    const now = new Date().toISOString();
    setLastSyncAt(now);
    try {
      await saveProfileToSupabase({ ...savedProfile, lastAutoProfileSyncAt: now });
      setCurrentProfile((prev) => (prev ? { ...prev, lastAutoProfileSyncAt: now } : prev));
    } catch {
      // Sync time is best-effort — don't fail the whole analyze flow
    }
  }

  async function analyze() {
    setState("loading");
    setError("");
    setResult(null);
    setSavedKeys([]);
    setManualItems([]);
    setSyncSummary(null);

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

      if (suggestions.maxHr == null && stats.maxObservedHR != null) {
        suggestions.maxHr = stats.maxObservedHR;
      }

      const { toSave, manualSkipped, manualSilentSkipped } = buildAutoSaveDecisions({
        suggestions,
        confidence,
        existingProfile: profile ?? undefined,
        existingSources: profile?.fieldSources ?? {},
      });
      let totalSilentSkipped = manualSilentSkipped.length;

      const updatedKeys = Object.keys(toSave);

      let latestSavedProfile: UserProfile = profile ?? ({ displayName: "นักวิ่ง" } as UserProfile);
      let totalAutoSaved = 0;

      if (updatedKeys.length > 0) {
        latestSavedProfile = await applyAndPersist(
          latestSavedProfile,
          toSave,
          buildSourceUpdates(updatedKeys),
          onProfileUpdated,
        );
        setCurrentProfile(latestSavedProfile);
        totalAutoSaved += updatedKeys.length;
      }

      const manualReview: ManualItem[] = manualSkipped
        .filter((k) => suggestions[k as keyof ProfileAnalysisSuggestions] != null)
        .map((k) => ({
          key: k,
          label: fieldLabel(k as keyof ProfileAnalysisSuggestions),
          currentValue: (profile as Record<string, unknown>)?.[k],
          suggestedValue: suggestions[k as keyof ProfileAnalysisSuggestions],
        }));

      // ── Nutrition targets from body history ──────────────────────────────────
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

        const { toSave: nutritionToSave, manualSkipped: nutritionManualSkipped, manualSilentSkipped: nutritionSilentSkipped } = filterManualFields({
          updates: nutritionFieldUpdates,
          existingSources: profile?.fieldSources ?? {},
          existingProfile: profile ?? undefined,
        });

        console.info("[nutrition-target-debug]", { skippedManual: nutritionManualSkipped, silentSkipped: nutritionSilentSkipped });
        totalSilentSkipped += nutritionSilentSkipped.length;

        const nutritionKeys = Object.keys(nutritionToSave);
        if (nutritionKeys.length > 0) {
          const merged = await applyAndPersist(latestSavedProfile, nutritionToSave, buildSourceUpdates(nutritionKeys), onProfileUpdated);
          setCurrentProfile(merged);
          latestSavedProfile = merged;
          totalAutoSaved += nutritionKeys.length;
        }

        const nutritionManualItems: ManualItem[] = nutritionManualSkipped.map((k) => ({
          key: k,
          label: SHORT_LABEL_ALL[k] ?? k,
          currentValue: (profile as Record<string, unknown>)?.[k],
          suggestedValue: (nutritionFieldUpdates as Record<string, unknown>)[k],
        }));
        manualReview.push(...nutritionManualItems);
      }

      // Filter out dismissed suggestions (same field + same value)
      const visibleManualReview = manualReview.filter(
        (item) => !isSuggestionDismissed(item.key, item.suggestedValue),
      );

      setResult(data);
      setSavedKeys((prev) => [...new Set([...prev, ...updatedKeys])]);
      setManualItems(visibleManualReview);
      const initStatuses: Record<string, SuggestedValueStatus> = {};
      for (const item of visibleManualReview) {
        initStatuses[item.key] = "idle";
      }
      setStatusMap(initStatuses);
      setSyncSummary(buildSyncSummaryMessage(totalAutoSaved, visibleManualReview.length, totalSilentSkipped));
      await recordSyncTime(latestSavedProfile);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setState("error");
    }
  }

  async function overrideManual(key: string, suggestedValue: unknown) {
    const base = currentProfile ?? { displayName: "นักวิ่ง" };
    const updates = { [key]: suggestedValue } as Partial<UserProfile>;
    // Accepted suggestion: set source to "history_analysis" (auto) so future auto-sync can keep it updated
    const merged = await applyAndPersist(base as UserProfile, updates, { [key]: "history_analysis" }, onProfileUpdated);
    setCurrentProfile(merged);
    // Clear any dismissal for this field since the user is now accepting the suggestion
    clearDismissedSuggestion(key);
    setStatusMap((prev) => ({ ...prev, [key]: "applied" }));
    // Remove item from visible list
    setManualItems((prev) => prev.filter((item) => item.key !== key));
  }

  function keepCurrent(key: string, suggestedValue: unknown) {
    // Persist dismissal so the same value is not shown again on the next sync
    addDismissedSuggestion(key, suggestedValue);
    setStatusMap((prev) => ({ ...prev, [key]: "ignored" }));
    // Remove from visible list immediately
    setManualItems((prev) => prev.filter((item) => item.key !== key));
  }

  function startInlineEdit(key: string, currentVal: unknown) {
    setEditingKey(key);
    setEditVal(currentVal != null ? String(currentVal) : "");
  }

  async function saveInlineEdit(key: string) {
    let parsed: string | number = editVal;
    const numericKeys = [
      "maxHr", "normalRestingHr", "lactateThresholdHr",
      "proteinTargetG", "carbTargetRestDayG", "carbTargetEasyDayG", "carbTargetHardDayG",
      "weightKg", "heightCm", "weeklyMileageKm", "currentLongestRunKm",
      "runningDaysPerWeek", "weeklyTrainingDays",
      "averageSleepHours", "normalSleepScore", "normalEnergyScore",
      "normalHrv", "vo2max", "averageCadence",
    ];
    if (numericKeys.includes(key)) {
      const num = Number(editVal);
      if (Number.isNaN(num)) {
        alert("กรุณากรอกตัวเลขที่ถูกต้อง");
        return;
      }
      parsed = num;
    }

    const base = currentProfile ?? { displayName: "นักวิ่ง" };
    const updates = { [key]: parsed } as Partial<UserProfile>;
    // User typed their own value → mark as "manual" so auto-sync won't overwrite it
    const merged = await applyAndPersist(base as UserProfile, updates, { [key]: "manual" }, onProfileUpdated);
    setCurrentProfile(merged);
    setStatusMap((prev) => ({ ...prev, [key]: "edited" }));
    setEditingKey(null);
    // Remove from suggestions list (user has now provided their own value)
    setManualItems((prev) => prev.filter((item) => item.key !== key));
  }

  function reset() {
    setState("idle");
    setResult(null);
    setError("");
    setSyncSummary(null);
  }

  /* ── Loading ─────────────────────────────────────────────── */
  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--surface-muted)] p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border-warm)] border-t-[var(--recovery-blue)]" />
        <p className="text-sm text-[var(--color-text-muted)]">กำลังวิเคราะห์และอัปเดตโปรไฟล์…</p>
        <p className="text-xs text-[var(--color-text-soft)]">อ่านสถิติ 90 วันล่าสุด</p>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────── */
  if (state === "error") {
    return (
      <div className="rounded-2xl bg-[var(--color-danger-soft)] p-4 space-y-2">
        <p className="text-sm font-bold text-[var(--color-danger)]">วิเคราะห์จากประวัติไม่สำเร็จ ลองใหม่อีกครั้ง</p>
        {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
        <button type="button" className="btn-secondary w-full text-sm" onClick={reset}>ลองใหม่</button>
      </div>
    );
  }

  /* ── Idle + Done ─────────────────────────────────────────── */
  const pendingCount = Object.values(statusMap).filter((s) => s === "idle").length;

  return (
    <div className="space-y-3">
      {/* ── Auto Sync toggle ─────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--surface-muted)] px-4 py-3"
        data-testid="auto-sync-panel"
      >
        <div className="min-w-0">
          <p className="text-xs font-bold text-[var(--foreground)]">Auto Sync โปรไฟล์</p>
          <p className="mt-0.5 text-[11px] leading-4 text-[var(--muted-text)]">
            {autoSyncEnabled
              ? lastSyncAt
                ? `เปิดอยู่ · อัปเดตล่าสุด ${new Date(lastSyncAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}`
                : "เปิดอยู่ · ยังไม่เคยซิงก์"
              : "ปิดอยู่ — กดวิเคราะห์เองได้ตลอดเวลา"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggleAutoSync()}
          data-testid="auto-sync-toggle"
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
            autoSyncEnabled
              ? "bg-[var(--primary)] text-[#f5f8ff]"
              : "bg-[var(--surface)] border border-[var(--border-warm)] text-[var(--foreground)]"
          }`}
        >
          {autoSyncEnabled ? "ปิด Auto Sync" : "เปิด Auto Sync"}
        </button>
      </div>

      {/* ── Description ──────────────────────────────────────── */}
      <div className="space-y-1">
        <p className="text-xs leading-5 text-[var(--muted-text)]">
          RunMate จะอัปเดตเฉพาะค่าที่คุณยังไม่ได้ตั้งเอง — ถ้าคุณเคยแก้ค่าเอง ระบบจะแค่เสนอค่าใหม่ให้เลือก ไม่ทับอัตโนมัติ
        </p>
        <p className="text-[11px] leading-4 text-[var(--muted-text)] opacity-80">
          Auto Sync จะทำงานหลังบันทึกข้อมูลใหม่ หรือเมื่อโปรไฟล์ไม่ได้อัปเดตเกิน 24 ชม.
        </p>
      </div>

      {state === "done" && result && (
        <div className="space-y-3">
          {/* ── Sync result summary ───────────────────────────── */}
          {syncSummary && (
            <div
              className="flex items-center gap-2 rounded-2xl bg-[var(--surface-muted)] px-3 py-2.5"
              data-testid="sync-summary"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
              <p className="text-xs font-semibold text-[var(--foreground)]">{syncSummary}</p>
            </div>
          )}

          {result.summary.confidence === "low" ? (
            <div className="rounded-2xl bg-[var(--color-warning-soft)] p-4 space-y-1">
              <p className="text-sm font-bold text-[var(--color-warning)]">ข้อมูลยังน้อยเกินไป</p>
              <p className="text-xs text-[var(--color-warning)]">เลยยังไม่อัปเดตโปรไฟล์ให้อัตโนมัติ</p>
              {result.summary.notes && (
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{result.summary.notes}</p>
              )}
            </div>
          ) : (
            <>
              {/* Section A: อัปเดตแล้ว */}
              <div className="rounded-2xl border border-[var(--color-success-border)] bg-[var(--color-success-soft)] p-4 space-y-2">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--color-success)]">อัปเดตแล้ว</p>
                {savedKeys.length > 0 ? (
                  <div className="space-y-1.5 pt-1">
                    {savedKeys.map((k) => (
                      <div key={k} className="text-xs flex justify-between items-center border-b border-[var(--border-warm)]/50 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-[var(--color-text-muted)]">{SHORT_LABEL_ALL[k] ?? fieldLabel(k as keyof ProfileAnalysisSuggestions)}</span>
                        <span className="font-bold text-[var(--foreground)]">
                          {formatValueWithUnit(k, currentProfile?.[k as keyof UserProfile])}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">ไม่มีการอัปเดตค่าอัตโนมัติ (คงค่าเดิมไว้ทั้งหมด)</p>
                )}
              </div>

              {/* Section B: คำแนะนำที่รอการตัดสินใจ */}
              {manualItems.length > 0 ? (
                <div className="rounded-2xl border border-[var(--border-warm)] bg-[var(--surface)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">
                      คำแนะนำที่รอการตัดสินใจ
                    </p>
                    {pendingCount > 0 && (
                      <span
                        className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--primary-strong)]"
                        data-testid="pending-suggestion-count"
                      >
                        {pendingCount} รายการ
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--muted-text)]">
                    ค่าด้านล่างนี้คุณเคยแก้เอง ระบบจึงไม่ทับอัตโนมัติ — เลือกว่าจะใช้ค่าที่แนะนำหรือคงค่าเดิมไว้
                  </p>
                  <div className="divide-y divide-[var(--border-warm)]">
                    {manualItems.map((item) => {
                      const status = statusMap[item.key] ?? "idle";
                      const isEditing = editingKey === item.key;
                      return (
                        <div key={item.key} className="py-3 first:pt-0 last:pb-0 space-y-2" data-testid="suggestion-item">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-[var(--foreground)]">{item.label}</p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              status === "applied" ? "bg-[var(--color-success-soft)] text-[var(--color-success)]" :
                              status === "ignored" ? "bg-[var(--surface-muted)] text-[var(--color-text-muted)]" :
                              status === "edited" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" :
                              "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                            }`}>
                              {getSuggestedValueLabel(status)}
                            </span>
                          </div>
                          <div className="text-xs space-y-0.5">
                            <p className="text-[var(--color-text-muted)]">
                              ค่าที่ใช้อยู่: <span className="font-semibold text-[var(--foreground)]">{formatValueWithUnit(item.key, currentProfile?.[item.key as keyof UserProfile] ?? item.currentValue)}</span>
                              <span className="ml-1.5 rounded bg-[var(--surface-muted)] px-1 py-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">แก้เอง</span>
                            </p>
                            <p className="text-[var(--color-text-muted)]">
                              ค่าที่แนะนำ: <span className="font-semibold text-[var(--recovery-blue)]" data-testid="suggested-value">{formatValueWithUnit(item.key, item.suggestedValue)}</span>
                            </p>
                            <p className="text-[10px] text-[var(--color-text-soft)]">อิงจากประวัติการวิ่งล่าสุด</p>
                          </div>
                          {isEditing ? (
                            <div className="flex items-center gap-2 pt-1">
                              <input
                                className="control min-w-0 flex-1 px-3 py-1.5 text-xs rounded-full border border-[var(--border-warm)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                placeholder="ใส่ค่าใหม่..."
                              />
                              <button
                                type="button"
                                onClick={() => void saveInlineEdit(item.key)}
                                className="rounded-full bg-[var(--primary)] px-3.5 py-1.5 text-[11px] font-bold text-[#f5f8ff]"
                              >
                                บันทึก
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingKey(null)}
                                className="rounded-full bg-[var(--surface-muted)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--color-text-muted)]"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => void overrideManual(item.key, item.suggestedValue)}
                                className="rounded-full bg-[var(--color-success-soft)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--color-success)]"
                                data-testid="accept-suggestion-btn"
                              >
                                ใช้ค่าที่แนะนำ
                              </button>
                              <button
                                type="button"
                                onClick={() => keepCurrent(item.key, item.suggestedValue)}
                                className="rounded-full bg-[var(--surface-muted)] border border-[var(--border-warm)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--color-text-muted)]"
                                data-testid="keep-current-btn"
                              >
                                คงค่าเดิม
                              </button>
                              <button
                                type="button"
                                onClick={() => startInlineEdit(item.key, currentProfile?.[item.key as keyof UserProfile] ?? item.currentValue)}
                                className="rounded-full bg-[var(--surface-muted)] border border-[var(--border-warm)] px-3.5 py-1.5 text-[11px] font-bold text-[var(--color-text-muted)]"
                              >
                                แก้ค่าเอง
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* Empty pending suggestion state — no heavy panel */
                <p
                  className="text-center text-xs text-[var(--muted-text)]"
                  data-testid="no-pending-suggestions"
                >
                  ยังไม่มีคำแนะนำที่ต้องตัดสินใจ
                </p>
              )}

              {/* Training preference summary */}
              {result.suggestions.trainingPreferenceSummary && (
                <div className="rounded-2xl bg-[var(--surface-muted)] p-3">
                  <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)] mb-1">สรุปรูปแบบการซ้อม</p>
                  <p className="text-sm text-[var(--foreground)]">{result.suggestions.trainingPreferenceSummary}</p>
                </div>
              )}

              {result.warnings && result.warnings.length > 0 && (
                <div className="rounded-2xl bg-[var(--surface-muted)] p-3 space-y-1">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-[var(--color-text-muted)]">⚠️ {w}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void analyze()}
        className="btn-primary w-full py-3 text-sm"
        data-testid="analyze-btn"
      >
        {autoSyncEnabled ? "ซิงก์โปรไฟล์ตอนนี้" : "วิเคราะห์ตอนนี้"}
      </button>
      <p className="text-center text-xs text-[var(--color-text-soft)]">
        ระบบจะไม่ทับค่าที่คุณแก้เอง
      </p>
    </div>
  );
}
