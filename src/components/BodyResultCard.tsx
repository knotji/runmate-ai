import type { BodyCompositionAnalysis } from "@/types/logs";
import { DataQualityNote } from "@/components/DataQualityNote";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";
import { formatDecimal, formatPercent, formatCalories } from "@/lib/format";

export function BodyResultCard({ result }: { result: BodyCompositionAnalysis }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Body Composition</p>
      <h2 className="mt-2 text-xl font-bold">{result.coach.bodySummary}</h2>
      <div className="mt-3">
        <DataQualityNote confidence={result.confidence} unclearFields={result.unclearFields} source="body" />
      </div>
      <MetricGrid
        items={[
          { label: "Weight", value: result.extracted.weightKg != null ? `${formatDecimal(result.extracted.weightKg)} kg` : null },
          { label: "Skeletal muscle", value: result.extracted.skeletalMuscleKg != null ? `${formatDecimal(result.extracted.skeletalMuscleKg)} kg` : null },
          { label: "Body fat", value: result.extracted.bodyFatPercent != null ? formatPercent(result.extracted.bodyFatPercent) : null },
          { label: "Fat mass", value: result.extracted.fatMassKg != null ? `${formatDecimal(result.extracted.fatMassKg)} kg` : null },
          { label: "Body water", value: result.extracted.bodyWaterKg != null ? `${formatDecimal(result.extracted.bodyWaterKg)} kg` : null },
          { label: "BMI", value: result.extracted.bmi != null ? formatDecimal(result.extracted.bmi) : null },
          { label: "BMR", value: result.extracted.bmrCalories != null ? formatCalories(result.extracted.bmrCalories) : null },
          { label: "Date", value: result.extracted.date },
        ]}
      />
      <DetailBlock title="Runner Interpretation">{result.coach.runnerInterpretation}</DetailBlock>
      <DetailBlock title="Nutrition Focus">{result.coach.nutritionFocus}</DetailBlock>
      <DetailBlock title="Strength Focus">{result.coach.strengthFocus}</DetailBlock>
      <DetailBlock title="Visible Notes">{result.extracted.visibleNotes || "ไม่มี note เพิ่มเติมที่อ่านได้ชัดเจน"}</DetailBlock>
      <DetailBlock title="Caution" tone="amber">{result.coach.cautionNotes}</DetailBlock>
      <DetailBlock title="Coach Note" tone="green">{result.coach.coachNote}</DetailBlock>
    </section>
  );
}
