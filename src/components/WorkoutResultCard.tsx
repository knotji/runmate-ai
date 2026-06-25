import type { WorkoutAnalysis } from "@/types/logs";
import { DataQualityNote } from "@/components/DataQualityNote";
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
  const ext = result.extracted;
  const isStrength = ext.workoutKind === "strength";

  if (isStrength) {
    return <StrengthResultCard result={result} />;
  }

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Workout Result</p>
      <h2 className="mt-2 text-xl font-bold">{formatSummaryText(result.coach.workoutSummary)}</h2>
      {ext.mergedFromMultipleImages && (
        <p className="mt-1 text-xs text-slate-500">รวมข้อมูลจากหลายภาพแล้ว</p>
      )}
      <div className="mt-3">
        <DataQualityNote confidence={result.confidence} unclearFields={result.unclearFields} source="workout" />
      </div>
      <MetricGrid
        items={[
          { label: "Type", value: ext.workoutKind },
          { label: "Distance", value: ext.distanceKm != null ? formatDistanceKm(ext.distanceKm) : null },
          { label: "Duration", value: ext.duration ? formatDuration(ext.duration) : null },
          { label: "Avg pace", value: ext.avgPace ? `${formatPace(ext.avgPace)} /km` : null },
          { label: "Avg speed", value: ext.avgSpeedKmh ? `${Number(ext.avgSpeedKmh).toFixed(1)} km/h` : null },
          { label: "Avg HR", value: ext.avgHR != null ? formatHeartRate(ext.avgHR) : null },
          { label: "Max HR", value: ext.maxHR != null ? formatHeartRate(ext.maxHR) : null },
          { label: "Cadence", value: ext.cadence != null ? `${formatScore(ext.cadence)} spm` : null },
          { label: "Calories", value: ext.calories != null ? formatCalories(ext.calories) : null },
          { label: "VO2 max", value: ext.vo2Max != null ? `${Number(ext.vo2Max).toFixed(2)}` : null },
          { label: "Sweat loss", value: ext.sweatLossMl != null ? `${formatScore(ext.sweatLossMl)} ml` : null },
          { label: "Too hard?", value: result.coach.wasTooHard },
        ]}
      />
      <DetailBlock title="Intensity">{result.coach.intensityAssessment}</DetailBlock>
      <DetailBlock title="Training Load">{result.coach.trainingLoadNote}</DetailBlock>
      <DetailBlock title="Recovery Advice">{result.coach.recoveryAdvice}</DetailBlock>
      <DetailBlock title="Nutrition After Workout">{result.coach.nutritionAfterWorkout}</DetailBlock>
      <DetailBlock title="Next Workout" tone="green">{result.coach.nextWorkoutSuggestion}</DetailBlock>
      <DetailBlock title="Visible Metrics">{ext.visibleMetrics?.length ? ext.visibleMetrics.join(", ") : "ยังไม่มี metric เพิ่มเติมที่อ่านได้ชัด"}</DetailBlock>
      <DetailBlock title="Coach Note">{result.coach.coachNote}</DetailBlock>
    </section>
  );
}

function StrengthResultCard({ result }: { result: WorkoutAnalysis }) {
  const ext = result.extracted;

  const intensityLabel: Record<string, string> = {
    easy: "เบา",
    moderate: "ปานกลาง",
    hard: "หนัก",
  };

  const muscleGroupsText = ext.muscleGroups && ext.muscleGroups.length > 0
    ? ext.muscleGroups.join(" · ")
    : null;

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">🏋️ เวท / Strength</p>
      <h2 className="mt-2 text-xl font-bold">{formatSummaryText(result.coach.workoutSummary)}</h2>
      {ext.mergedFromMultipleImages && (
        <p className="mt-1 text-xs text-slate-500">รวมข้อมูลจากหลายภาพแล้ว</p>
      )}

      {/* Data quality note */}
      <div className="mt-3">
        <DataQualityNote confidence={result.confidence} unclearFields={result.unclearFields} source="workout" />
        {result.confidence === "low" && (
          <p className="mt-1 text-xs text-amber-700 leading-relaxed">
            ⚠️ ข้อมูลจากรูปเวทอาจอ่านได้ไม่ครบ เช่น ท่า จำนวนเซ็ต หรือน้ำหนักที่ใช้ กรุณาตรวจทานก่อนบันทึก
          </p>
        )}
      </div>

      {/* Primary metrics */}
      <MetricGrid
        items={[
          { label: "เวลา", value: ext.duration ? formatDuration(ext.duration) : null },
          { label: "Calories", value: ext.calories != null ? formatCalories(ext.calories) : null },
          { label: "Avg HR", value: ext.avgHR != null ? formatHeartRate(ext.avgHR) : null },
          { label: "Max HR", value: ext.maxHR != null ? formatHeartRate(ext.maxHR) : null },
          { label: "ความหนัก", value: ext.intensity ? intensityLabel[ext.intensity] ?? ext.intensity : null },
          { label: "RPE", value: ext.rpe != null ? `${ext.rpe}/10` : null },
        ]}
      />

      {/* Muscle groups */}
      {muscleGroupsText && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold text-slate-500 mb-0.5">กล้ามเนื้อหลัก</p>
          <p className="text-sm font-bold text-[#17201d]">{muscleGroupsText}</p>
        </div>
      )}

      {/* Exercises list */}
      {ext.exercises && ext.exercises.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-slate-500 mb-1">ท่าออกกำลังกาย</p>
          {ext.exercises.map((ex, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">{ex.name}</span>
              <span className="text-slate-500 font-medium">
                {[
                  ex.sets ? `${ex.sets} เซ็ต` : null,
                  ex.reps ? `× ${ex.reps}` : null,
                  ex.weightKg ? `${ex.weightKg} kg` : null,
                ].filter(Boolean).join(" ")}
              </span>
            </div>
          ))}
        </div>
      )}

      <DetailBlock title="ความหนักของการซ้อม">{result.coach.intensityAssessment}</DetailBlock>
      <DetailBlock title="Training Load">{result.coach.trainingLoadNote}</DetailBlock>
      <DetailBlock title="Recovery หลังเวท">{result.coach.recoveryAdvice}</DetailBlock>
      <DetailBlock title="โภชนาการหลังเวท">{result.coach.nutritionAfterWorkout}</DetailBlock>
      <DetailBlock title="ครั้งถัดไป" tone="green">{result.coach.nextWorkoutSuggestion}</DetailBlock>
      <DetailBlock title="Coach Note">{result.coach.coachNote}</DetailBlock>
    </section>
  );
}

