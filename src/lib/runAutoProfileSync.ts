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

    const updatedKeys = Object.keys(toSave);
    if (updatedKeys.length > 0) {
      const merged: UserProfile = {
        ...latestProfile,
        ...(toSave as Partial<UserProfile>),
        fieldSources: {
          ...latestProfile.fieldSources,
          ...buildSourceUpdates(updatedKeys),
        },
      };
      await saveProfileToSupabase(merged);
      latestProfile = merged;
      totalAutoSaved += updatedKeys.length;
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
      const {
        toSave: nutritionToSave,
        manualSilentSkipped: nutSilent,
      } = filterManualFields({
        updates: nutritionUpdates,
        existingSources: latestProfile.fieldSources ?? {},
        existingProfile: latestProfile,
      });
      totalSilentSkipped += nutSilent.length;
      const nutKeys = Object.keys(nutritionToSave);
      if (nutKeys.length > 0) {
        const merged: UserProfile = {
          ...latestProfile,
          ...nutritionToSave,
          fieldSources: {
            ...latestProfile.fieldSources,
            ...buildSourceUpdates(nutKeys),
          },
        };
        await saveProfileToSupabase(merged);
        latestProfile = merged;
        totalAutoSaved += nutKeys.length;
      }
    }

    // Persist lastAutoProfileSyncAt
    const now = new Date().toISOString();
    await saveProfileToSupabase({ ...latestProfile, lastAutoProfileSyncAt: now });
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
