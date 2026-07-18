"use client";

import { useEffect } from "react";

/**
 * Fires once per app load (mounted in root layout, empty-deps effect — won't
 * re-run on client-side route changes). The endpoint itself no-ops instantly
 * if the user isn't connected or their last sync is under 5 minutes old, so
 * this is cheap to call unconditionally rather than checking status first.
 */
export function GoogleHealthSyncOnOpen() {
  useEffect(() => {
    fetch("/api/google-health/sync-if-stale").catch(() => {});
  }, []);

  return null;
}
