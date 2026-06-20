export type HistoryType = "sleep" | "meal" | "workout" | "body" | "summary";

export type LocalHistoryItem = {
  id: string;
  type: HistoryType;
  createdAt: string;
  data: unknown;
};

const maxItems = 400;

export function appendHistory(type: HistoryType, data: unknown, createdAt?: string): LocalHistoryItem | null {
  if (typeof window === "undefined") return null;
  const key = historyKey(type);
  const items = readHistory(type);
  const resolvedDate = createdAt && !isNaN(new Date(createdAt).getTime())
    ? new Date(createdAt).toISOString()
    : new Date().toISOString();
  const dateKey = resolvedDate.slice(0, 10); // YYYY-MM-DD

  // For sleep and body: one entry per day — replace existing same-day entry
  // For workout: deduplicate by same date + same kind + duration within 2 min
  let filtered = items;
  if (type === "sleep" || type === "body") {
    filtered = items.filter((i) => i.createdAt.slice(0, 10) !== dateKey);
  } else if (type === "workout") {
    const incoming = (data as { extracted?: { workoutKind?: string; duration?: string | null } }).extracted;
    if (incoming?.workoutKind && incoming?.duration) {
      const incomingSec = parseDurationSec(incoming.duration);
      filtered = items.filter((i) => {
        if (i.createdAt.slice(0, 10) !== dateKey) return true;
        const ex = (i.data as { extracted?: { workoutKind?: string; duration?: string | null } }).extracted;
        if (ex?.workoutKind !== incoming.workoutKind) return true;
        const existingSec = parseDurationSec(ex?.duration);
        if (incomingSec == null || existingSec == null) return true;
        return Math.abs(incomingSec - existingSec) > 120; // keep if diff > 2 min
      });
    }
  }

  const newItem: LocalHistoryItem = {
    id: `${type}-${Date.now()}`,
    type,
    createdAt: resolvedDate,
    data,
  };
  const next: LocalHistoryItem[] = [newItem, ...filtered].slice(0, maxItems);
  localStorage.setItem(key, JSON.stringify(next));
  return newItem;
}

export function readHistory(type: HistoryType) {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyKey(type));
    return raw ? (JSON.parse(raw) as LocalHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function collectCoachContext() {
  if (typeof window === "undefined") return {};
  return {
    profile: localStorage.getItem("runmate.profile"),
    raceGoal: localStorage.getItem("runmate.raceGoal"),
    racePlan: localStorage.getItem("runmate.racePlan"),
    latestSleep: localStorage.getItem("runmate.latestSleep"),
    latestMeal: localStorage.getItem("runmate.latestMeal"),
    latestWorkout: localStorage.getItem("runmate.latestWorkout"),
    latestBody: localStorage.getItem("runmate.latestBody"),
    dailySummary: localStorage.getItem("runmate.dailySummary"),
    recentSleep: readHistory("sleep"),
    recentMeals: readHistory("meal"),
    recentWorkouts: readHistory("workout"),
    recentBody: readHistory("body"),
    recentSummaries: readHistory("summary"),
  };
}

function historyKey(type: HistoryType) {
  return `runmate.history.${type}`;
}

function parseDurationSec(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const parts = duration.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}
