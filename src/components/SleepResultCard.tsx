import type { SleepAnalysis } from "@/types/logs";
import { AIReadQualityNote } from "@/components/AIReadQualityNote";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";
import { formatDuration, formatScore, formatHeartRate } from "@/lib/format";

export function SleepResultCard({ result }: { result: SleepAnalysis }) {
  const score = result.coach.readinessScore != null ? formatScore(result.coach.readinessScore) : "-";
  const label = result.coach.readinessLabel || "ประเมินความพร้อม";
  const summary = result.coach.aiSummary || "โค้ชอ่านข้อมูลการนอนแล้ว แต่ยังสรุปบางค่าได้ไม่ครบ";
  const recommendation = result.coach.todayRecommendation || "ถ้าวันนี้รู้สึกล้า แนะนำให้ซ้อมเบาหรือพักก่อน";

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Sleep Result</p>
      <div className="mt-3 flex items-center justify-between">
        <h2 className="text-xl font-bold">{label}</h2>
        <span className="rounded-full bg-[#b9d9c0] px-4 py-2 font-bold">{score}/100</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{summary}</p>
      <div className="mt-3">
        <AIReadQualityNote confidence={result.confidence} unclearFields={result.unclearFields} />
      </div>
      <MetricGrid
        items={[
          { label: "Sleep duration", value: result.extracted.sleepDuration ? formatDuration(result.extracted.sleepDuration) : null },
          { label: "Sleep score", value: result.extracted.sleepScore != null ? formatScore(result.extracted.sleepScore) : null },
          { label: "Energy score", value: result.extracted.energyScore != null ? formatScore(result.extracted.energyScore) : null },
          { label: "Resting HR", value: result.extracted.restingHR != null ? formatHeartRate(result.extracted.restingHR) : null },
          { label: "HRV", value: result.extracted.hrv != null ? `${formatScore(result.extracted.hrv)} ms` : null },
          { label: "Quality", value: result.extracted.sleepQualityLabel },
        ]}
      />
      <DetailBlock title="Training Recommendation" tone="green">{recommendation}</DetailBlock>
      <DetailBlock title="Why">{summary}</DetailBlock>
      <DetailBlock title="Nutrition Focus">{result.coach.nutritionFocus}</DetailBlock>
      <DetailBlock title="Recovery Focus">{result.coach.recoveryFocus}</DetailBlock>
      <DetailBlock title="Sleep Focus">{result.coach.sleepFocus}</DetailBlock>
      <DetailBlock title="Visible Notes">{result.extracted.visibleNotes || "ไม่มี note เพิ่มเติมที่อ่านได้ชัดเจน"}</DetailBlock>
      <DetailBlock title="Safety Notes" tone="amber">{result.coach.warningNotes}</DetailBlock>
    </section>
  );
}
