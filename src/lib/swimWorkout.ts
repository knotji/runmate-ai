import type { WorkoutAnalysis } from "@/types/logs";

export function isSwimWorkout(ext: Pick<WorkoutAnalysis["extracted"], "workoutKind" | "swimKind">): boolean {
  return ext.workoutKind === "other" && ext.swimKind != null;
}

export function isSwimRecovery(summary = "", coachNote = ""): boolean {
  const text = `${summary} ${coachNote}`.toLowerCase();
  return text.includes("recovery") || text.includes("ฟื้นตัว");
}

export function formatSwimDistance(distanceM: number): string {
  return `${Math.round(distanceM)} ม.`;
}
