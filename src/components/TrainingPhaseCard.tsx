import type { TrainingPhase } from "@/types/race";

export function TrainingPhaseCard({ phase }: { phase: TrainingPhase }) {
  return (
    <div className="card-soft p-4">
      <div className="flex justify-between gap-3">
        <h3 className="font-bold">{phase.name}</h3>
        <span className="text-sm text-[var(--color-text-soft)]">Week {phase.weekRange}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--muted-text)]">{phase.focus}</p>
      <p className="mt-1 text-xs text-[var(--color-text-soft)]">{phase.notes}</p>
    </div>
  );
}
