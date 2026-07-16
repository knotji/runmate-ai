"use client";

/**
 * Background auto-sync runner.
 * Runs the full profile analysis pipeline silently — no UI state, no blocking.
 * Safe to call fire-and-forget; always catches errors internally.
 */

import { loadProfileFromSupabase, saveProfileToSupabase } from "@/lib/profileStorage";
import { loadHistoryItems } from "@/lib/cloudHistory";
import { buildRunnerHistoryStats } from "@/lib/analyzeHistory";
import {
  buildAutoSaveDecisions,
  filterManualFields,
  buildSourceUpdates,
} from "@/lib/profile/autoSaveHistorySuggestions";
import { calculateNutritionTargetsFromWeight } from "@/lib/nutritionTargets";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { shouldRunProfileAutoSync, type AutoSyncTrigger } from "@/lib/profileAutoSync";
import type { ProfileAnalysisResult } from "@/lib/analyzeHistory";
import type { UserProfile } from "@/types/profile";

export type AutoSyncResult = {
  ok: boolean;
  autoSaved: number;
  silentSkipped: number;
  reason?: string;
};

export async function runAutoProfileSync(
  trigger: AutoSyncTrigger,
  dataUpdatedAt?: string,
): Promise<AutoSyncResult> {
  const none: AutoSyncResult = { ok: false, autoSaved: 0, silentSkipped: 0 };
  try {
    const profileResult = await loadProfileFromSupabase();
    if (!profileResult.ok || !profileResult.profile) {
      return { ...none, reason: "no-profile" };
    }
    const profile = profileResult.profile;

    const check = shouldRunProfileAutoSync({
      autoProfileSyncEnabled: profile.autoProfileSyncEnabled,
      lastAutoProfileSyncAt: profile.lastAutoProfileSyncAt ?? null,
      latestDataUpdatedAt: dataUpdatedAt,
      trigger,
    });

    if (!check.shouldRun) {
      return { ...none, reason: check.reason };
    }

    const historyResult = await loadHistoryItems(["sleep", "workout", "body"]);
    if (!historyResult.ok) {
      return { ...none, reason: "history-load-failed" };
    }

    const stats = buildRunnerHistoryStats(historyResult.items);

    const res = await fetch("/api/analyze-profile-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stats, currentProfile: profile }),
    });
    if (!res.ok) {
      return { ...none, reason: "analysis-api-failed" };
    }

    const json = (await res.json()) as { data?: ProfileAnalysisResult } | ProfileAnalysisResult;
    const data =
      (json as { data?: ProfileAnalysisResult }).data ?? (json as ProfileAnalysisResult);
    const { confidence } = data.summary;
    const { suggestions } = data;

    if (stats.maxObservedHR != null && suggestions.maxHr == null) {
      suggestions.maxHr = stats.maxObservedHR;
    }

    const { toSave, manualSilentSkipped } = buildAutoSaveDecisions({
      suggestions,
      confidence,
      existingProfile: profile,
      existingSources: profile.fieldSources ?? {},
    });

    let latestProfile: UserProfile = profile;
    let totalAutoSaved = 0;
    let totalSilentSkipped = manualSilentSkipped.length;

    // Re-fetch immediately before writing rather than reusing the snapshot loaded at the
    // top of this function — this sync can take a while (analysis API call in between),
    // and writing a full-row upsert built from a stale snapshot would silently overwrite
    // any edit the user made in the UI (or a previous concurrent sync) in the meantime.
    // Re-filtering against the fresh fieldSources also catches a field that became
    // "manual" after this sync's toSave decision was made.
    const updatedKeysInitial = Object.keys(toSave);
    if (updatedKeysInitial.length > 0) {
      const freshResult = await loadProfileFromSupabase();
      const freshBase = freshResult.ok && freshResult.profile ? freshResult.profile : latestProfile;
      const { toSave: safeToSave, manualSilentSkipped: raceSkipped } = filterManualFields({
        updates: toSave as Partial<UserProfile>,
        existingSources: freshBase.fieldSources ?? {},
        existingProfile: freshBase,
      });
      totalSilentSkipped += raceSkipped.length;
      const updatedKeys = Object.keys(safeToSave);
      if (updatedKeys.length > 0) {
        const merged: UserProfile = {
          ...freshBase,
          ...safeToSave,
          fieldSources: {
            ...freshBase.fieldSources,
            ...buildSourceUpdates(updatedKeys),
          },
        };
        await saveProfileToSupabase(merged);
        latestProfile = merged;
        totalAutoSaved += updatedKeys.length;
      } else {
        latestProfile = freshBase;
      }
    }

    // Nutrition targets from body history
    if (stats.latestWeightKg != null) {
      const targets = calculateNutritionTargetsFromWeight(
        stats.latestWeightKg,
        profile.nutritionGoal ?? null,
        stats.weeklyMileageEstimate,
      );
      const nutritionUpdates: Partial<UserProfile> = {
        weightKg: stats.latestWeightKg,
        proteinTargetG: targets.proteinTargetG,
        carbTargetRestDayG: targets.carbTargetRestDayG,
        carbTargetEasyDayG: targets.carbTargetEasyDayG,
        carbTargetHardDayG: targets.carbTargetHardDayG,
      };
      // Re-fetch again before this second write, for the same reason as above.
      const freshResult2 = await loadProfileFromSupabase();
      const freshBase2 = freshResult2.ok && freshResult2.profile ? freshResult2.profile : latestProfile;
      const {
        toSave: nutritionToSave,
        manualSilentSkipped: nutSilent,
      } = filterManualFields({
        updates: nutritionUpdates,
        existingSources: freshBase2.fieldSources ?? {},
        existingProfile: freshBase2,
      });
      totalSilentSkipped += nutSilent.length;
      const nutKeys = Object.keys(nutritionToSave);
      if (nutKeys.length > 0) {
        const merged: UserProfile = {
          ...freshBase2,
          ...nutritionToSave,
          fieldSources: {
            ...freshBase2.fieldSources,
            ...buildSourceUpdates(nutKeys),
          },
        };
        await saveProfileToSupabase(merged);
        latestProfile = merged;
        totalAutoSaved += nutKeys.length;
      } else {
        latestProfile = freshBase2;
      }
    }

    // Persist lastAutoProfileSyncAt onto a fresh reload too — this is the last write of
    // the sync and should not stomp on anything the user changed while the sync ran.
    const now = new Date().toISOString();
    const freshResult3 = await loadProfileFromSupabase();
    const freshBase3 = freshResult3.ok && freshResult3.profile ? freshResult3.profile : latestProfile;
    await saveProfileToSupabase({ ...freshBase3, lastAutoProfileSyncAt: now });
    invalidateCoachCache();

    if (process.env.NODE_ENV === "development") {
      console.info("[auto-profile-sync]", {
        trigger,
        reason: check.reason,
        autoSaved: totalAutoSaved,
        silentSkipped: totalSilentSkipped,
      });
    }

    return { ok: true, autoSaved: totalAutoSaved, silentSkipped: totalSilentSkipped };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[auto-profile-sync] background sync failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
    return { ...none, reason: "unexpected-error" };
  }
}
