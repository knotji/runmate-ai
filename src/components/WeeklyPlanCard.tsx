import type { TrainingWeek } from "@/types/race";

export function WeeklyPlanCard({ week }: { week: TrainingWeek }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Week {week.weekNumber}</p>
      <h2 className="mt-2 text-lg font-bold">{week.weeklyFocus}</h2>
      <p className="mt-1 text-sm text-slate-600">
        รวม {week.targetWeeklyDistanceKm ?? "-"} km · Long run {week.longRunDistanceKm ?? "-"} km
      </p>
      <div className="mt-4 space-y-2">
        {week.workouts.map((workout) => (
          <div key={`${workout.day}-${workout.workoutType}`} className="rounded-2xl bg-slate-50 p-3 text-sm">
            <strong>{workout.day}: {workout.workoutType}</strong>
            <p className="mt-1 text-slate-600">{workout.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
