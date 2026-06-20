import type { TrainingPhase } from "@/types/race";

export function TrainingPhaseCard({ phase }: { phase: TrainingPhase }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4">
      <div className="flex justify-between gap-3">
        <h3 className="font-bold">{phase.name}</h3>
        <span className="text-sm text-slate-500">Week {phase.weekRange}</span>
      </div>
      <p className="mt-2 text-sm text-slate-600">{phase.focus}</p>
      <p className="mt-1 text-xs text-slate-500">{phase.notes}</p>
    </div>
  );
}
