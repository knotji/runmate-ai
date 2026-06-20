import type { RunAnalysis } from "@/types/logs";
import { formatDistanceKm, formatPace, formatHeartRate, formatSummaryText } from "@/lib/format";

export function RunResultCard({ result }: { result: RunAnalysis }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Run Result</p>
      <h2 className="mt-2 text-xl font-bold">{formatSummaryText(result.coach.runSummary)}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold">
        <span className="rounded-2xl bg-slate-50 p-3">{formatDistanceKm(result.extracted.distanceKm)}</span>
        <span className="rounded-2xl bg-slate-50 p-3">{formatPace(result.extracted.avgPace)} pace</span>
        <span className="rounded-2xl bg-slate-50 p-3">{formatHeartRate(result.extracted.avgHR)}</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{result.coach.intensityAssessment}</p>
      <p className="mt-3 rounded-2xl bg-[#e7efea] p-3 text-sm">{result.coach.nextRunSuggestion}</p>
    </section>
  );
}
