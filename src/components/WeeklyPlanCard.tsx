import type { TrainingWeek } from "@/types/race";

function workoutBorderClass(workoutType: string): string {
  const t = workoutType.toLowerCase();
  if (t.includes("rest") || t.includes("พัก")) {
    return "border-l-4 border-l-[var(--border-warm)]";
  }
  if (t.includes("strength") || t.includes("เวท") || t.includes("gym")) {
    return "border-l-4 border-l-[var(--recovery-blue)]";
  }
  return "border-l-4 border-l-[var(--primary)]";
}

export function WeeklyPlanCard({ week }: { week: TrainingWeek }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--color-info)]">Week {week.weekNumber}</p>
      <h2 className="mt-2 text-lg font-bold">{week.weeklyFocus}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        รวม {week.targetWeeklyDistanceKm ?? "-"} km · Long run {week.longRunDistanceKm ?? "-"} km
      </p>
      <div className="mt-4 space-y-2">
        {week.workouts.map((workout) => (
          <div key={`${workout.day}-${workout.workoutType}`} className={`rounded-2xl bg-[var(--surface-muted)] p-3 text-sm pl-4 ${workoutBorderClass(workout.workoutType)}`}>
            <strong className="text-[var(--foreground)]">{workout.day}: {workout.workoutType}</strong>
            <p className="mt-1 text-[var(--color-text-muted)]">{workout.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
