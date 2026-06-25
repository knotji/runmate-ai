import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis } from "@/types/logs";
import { getHistoryItemDateKey } from "@/lib/date";

export type MergedSleepItem = LocalHistoryItem & {
  mergedFromDuplicates?: boolean;
  duplicateCount?: number;
  sourceRecordIds?: string[];
};

function getSleepExtracted(item: LocalHistoryItem): Record<string, unknown> {
  const d = item.data as { extracted?: Record<string, unknown> } | null;
  return d?.extracted ?? {};
}

function scoreSleepRecord(item: LocalHistoryItem): number {
  const ext = getSleepExtracted(item);
  const d = item.data as SleepAnalysis | null;
  let score = 0;
  if (ext.actualSleepDurationMinutes != null || ext.sleepDuration != null) score += 4;
  if (ext.sleepScore != null) score += 3;
  if (ext.energyScore != null) score += 2;
  if (ext.restingHR != null || ext.avgSleepingHeartRate != null) score += 2;
  if (ext.hrv != null || ext.avgSleepingHrv != null) score += 2;
  if (ext.sleepStageDeepMinutes != null || ext.sleepStageRemMinutes != null || ext.sleepStageMinutes != null) score += 1;
  const unclear = Array.isArray(d?.unclearFields) ? (d!.unclearFields ?? []).length : 0;
  score -= unclear * 0.1;
  return score;
}

function mergeExtractedFields(items: LocalHistoryItem[]): Record<string, unknown> {
  const sorted = [...items].sort((a, b) => scoreSleepRecord(b) - scoreSleepRecord(a));
  const merged: Record<string, unknown> = { ...getSleepExtracted(sorted[0]) };
  for (const item of sorted.slice(1)) {
    for (const [key, value] of Object.entries(getSleepExtracted(item))) {
      if (merged[key] == null && value != null) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function pickBestCoach(items: LocalHistoryItem[]): unknown {
  const sorted = [...items].sort((a, b) => scoreSleepRecord(b) - scoreSleepRecord(a));
  for (const item of sorted) {
    const d = item.data as { coach?: unknown } | null;
    if (d?.coach) return d.coach;
  }
  return undefined;
}

function mergeUnclearFields(items: LocalHistoryItem[]): string[] {
  const allSets = items.map((item) => {
    const d = item.data as SleepAnalysis | null;
    return new Set<string>(Array.isArray(d?.unclearFields) ? (d!.unclearFields ?? []) : []);
  });
  if (!allSets.length) return [];
  return [...allSets[0]].filter((field) => allSets.every((s) => s.has(field)));
}

function pickBestConfidence(items: LocalHistoryItem[]): SleepAnalysis["confidence"] {
  if (items.some((item) => (item.data as SleepAnalysis | null)?.confidence === "high")) return "high";
  if (items.some((item) => (item.data as SleepAnalysis | null)?.confidence === "medium")) return "medium";
  return "low";
}

export function dedupeSleepItems(items: LocalHistoryItem[]): MergedSleepItem[] {
  const groups = new Map<string, LocalHistoryItem[]>();
  for (const item of items) {
    const key = getHistoryItemDateKey(item);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const result: MergedSleepItem[] = [];
  for (const [, group] of groups) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const sorted = [...group].sort((a, b) => scoreSleepRecord(b) - scoreSleepRecord(a));
    const primary = sorted[0];
    result.push({
      ...primary,
      data: {
        extracted: mergeExtractedFields(group),
        coach: pickBestCoach(group),
        confidence: pickBestConfidence(group),
        unclearFields: mergeUnclearFields(group),
      },
      mergedFromDuplicates: true,
      duplicateCount: group.length,
      sourceRecordIds: group.map((item) => item.id),
    });
  }

  return result.sort((a, b) => {
    const dateOrder = getHistoryItemDateKey(b).localeCompare(getHistoryItemDateKey(a));
    return dateOrder || Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}
