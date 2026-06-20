"use client";

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

export function invalidateCoachCache(options: { clearChat?: boolean } = {}) {
  if (typeof window === "undefined") return;

  const todayStr = new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
  localStorage.removeItem(`runmate.coachInsight.${todayStr}`);

  if (options.clearChat) {
    localStorage.removeItem("runmate.chatHistory");
  }

  window.dispatchEvent(new Event("runmate:data-updated"));
}
