"use client";

export function invalidateCoachCache(options: { clearChat?: boolean } = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
  if (options.clearChat) {
    window.dispatchEvent(new Event("runmate:clear-coach-chat"));
  }
}
