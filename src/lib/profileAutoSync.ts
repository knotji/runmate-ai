/**
 * Pure auto-sync decision logic — no imports from app modules.
 * Safe to import anywhere including unit tests.
 */

export type AutoSyncTrigger =
  | "manual"
  | "after_upload"
  | "profile_open"
  | "today_open"
  | "coach_open";

export type ShouldRunReason = "manual" | "new_data" | "stale_24h" | "disabled" | "fresh";

export type ShouldRunResult = {
  shouldRun: boolean;
  reason: ShouldRunReason;
};

export type ShouldRunInput = {
  autoProfileSyncEnabled: boolean | undefined;
  lastAutoProfileSyncAt: string | null | undefined;
  /** ISO timestamp of newest user data. When newer than lastAutoProfileSyncAt → trigger. */
  latestDataUpdatedAt?: string | null;
  trigger: AutoSyncTrigger;
  /** ISO string for "now"; defaults to new Date().toISOString() */
  now?: string;
};

const HOURS_24_MS = 24 * 60 * 60 * 1000;

export function shouldRunProfileAutoSync(input: ShouldRunInput): ShouldRunResult {
  const {
    autoProfileSyncEnabled,
    lastAutoProfileSyncAt,
    latestDataUpdatedAt,
    trigger,
    now = new Date().toISOString(),
  } = input;

  // Manual trigger always runs regardless of other conditions
  if (trigger === "manual") {
    return { shouldRun: true, reason: "manual" };
  }

  // Auto sync disabled → block automatic triggers
  if (autoProfileSyncEnabled === false) {
    return { shouldRun: false, reason: "disabled" };
  }

  // No previous sync → always run
  if (!lastAutoProfileSyncAt) {
    return { shouldRun: true, reason: "stale_24h" };
  }

  // New data exists after last sync → run
  if (latestDataUpdatedAt && latestDataUpdatedAt > lastAutoProfileSyncAt) {
    return { shouldRun: true, reason: "new_data" };
  }

  // Profile-open trigger: run if last sync is older than 24 hours
  if (trigger === "profile_open") {
    const lastSyncMs = new Date(lastAutoProfileSyncAt).getTime();
    const nowMs = new Date(now).getTime();
    if (nowMs - lastSyncMs > HOURS_24_MS) {
      return { shouldRun: true, reason: "stale_24h" };
    }
  }

  // Everything is fresh — no sync needed
  return { shouldRun: false, reason: "fresh" };
}
