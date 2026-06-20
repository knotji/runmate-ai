"use client";

const CLEANUP_MARKER = "runmate.localCleanup.v1";
const PRESERVE_KEYS = new Set<string>([
  CLEANUP_MARKER,
]);

// Supabase is now the source of truth. Removed/replaced old local-first data keys:
// runmate.profile, runmate.history.*, runmate.raceGoal, runmate.racePlan,
// runmate.chatHistory, runmate.dailySummary, latest upload/import/cache keys.
export function cleanupOldRunMateLocalData() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(CLEANUP_MARKER) === "true") return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || PRESERVE_KEYS.has(key)) continue;
    if (key.startsWith("runmate.") || key.startsWith("runmate:") || key.startsWith("RunMate")) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) localStorage.removeItem(key);
  localStorage.setItem(CLEANUP_MARKER, "true");
}

