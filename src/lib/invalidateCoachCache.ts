"use client";

export function invalidateCoachCache(options: { clearChat?: boolean } = {}) {
  void options;
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
}
