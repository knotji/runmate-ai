import type { WorkoutAnalysis } from "@/types/logs";
import { AIReadQualityNote } from "@/components/AIReadQualityNote";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";
import {
  formatDistanceKm,
  formatDuration,
  formatPace,
  formatHeartRate,
  formatCalories,
  formatScore,
  formatSummaryText,
} from "@/lib/format";

export function WorkoutResultCard({ result }: { result: WorkoutAnalysis }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Workout Result</p>
      <h2 className="mt-2 text-xl font-bold">{formatSummaryText(result.coach.workoutSummary)}</h2>
      {result.extracted.mergedFromMultipleImages && (
        <p className="mt-1 text-xs text-slate-500">รวมข้อมูลจากหลายภาพแล้ว</p>
      )}
      <div className="mt-3">
        <AIReadQualityNote confidence={result.confidence} unclearFields={result.unclearFields} />
      </div>
      <MetricGrid
        items={[
          { label: "Type", value: result.extracted.workoutKind },
          { label: "Distance", value: result.extracted.distanceKm != null ? formatDistanceKm(result.extracted.distanceKm) : null },
          { label: "Duration", value: result.extracted.duration ? formatDuration(result.extracted.duration) : null },
          { label: "Avg pace", value: result.extracted.avgPace ? `${formatPace(result.extracted.avgPace)} /km` : null },
          { label: "Avg speed", value: result.extracted.avgSpeedKmh ? `${Number(result.extracted.avgSpeedKmh).toFixed(1)} km/h` : null },
          { label: "Avg HR", value: result.extracted.avgHR != null ? formatHeartRate(result.extracted.avgHR) : null },
          { label: "Max HR", value: result.extracted.maxHR != null ? formatHeartRate(result.extracted.maxHR) : null },
          { label: "Cadence", value: result.extracted.cadence != null ? `${formatScore(result.extracted.cadence)} spm` : null },
          { label: "Calories", value: result.extracted.calories != null ? formatCalories(result.extracted.calories) : null },
          { label: "VO2 max", value: result.extracted.vo2Max != null ? `${Number(result.extracted.vo2Max).toFixed(2)}` : null },
          { label: "Sweat loss", value: result.extracted.sweatLossMl != null ? `${formatScore(result.extracted.sweatLossMl)} ml` : null },
          { label: "Too hard?", value: result.coach.wasTooHard },
        ]}
      />
      <DetailBlock title="Intensity">{result.coach.intensityAssessment}</DetailBlock>
      <DetailBlock title="Training Load">{result.coach.trainingLoadNote}</DetailBlock>
      <DetailBlock title="Recovery Advice">{result.coach.recoveryAdvice}</DetailBlock>
      <DetailBlock title="Nutrition After Workout">{result.coach.nutritionAfterWorkout}</DetailBlock>
      <DetailBlock title="Next Workout" tone="green">{result.coach.nextWorkoutSuggestion}</DetailBlock>
      <DetailBlock title="Visible Metrics">{result.extracted.visibleMetrics?.length ? result.extracted.visibleMetrics.join(", ") : "ยังไม่มี metric เพิ่มเติมที่อ่านได้ชัด"}</DetailBlock>
      <DetailBlock title="Coach Note">{result.coach.coachNote}</DetailBlock>
    </section>
  );
}
