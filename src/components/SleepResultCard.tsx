import type { SleepAnalysis } from "@/types/logs";
import { DataQualityNote } from "@/components/DataQualityNote";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";
import { formatDuration, formatScore, formatHeartRate } from "@/lib/format";
import { formatSleepMinutesThai } from "@/lib/sleepDuration";
import { polishSleepInsightText } from "@/lib/sleepInsight";

export function SleepResultCard({ result }: { result: SleepAnalysis }) {
  const score = result.coach.readinessScore != null ? formatScore(result.coach.readinessScore) : "-";
  const label = result.coach.readinessLabel || "ประเมินความพร้อม";
  const summary = polishSleepInsightText(result.coach.aiSummary) || "โค้ชอ่านข้อมูลการนอนแล้ว แต่ยังสรุปบางค่าได้ไม่ครบ";
  const recommendation = polishSleepInsightText(result.coach.todayRecommendation) || "ถ้าวันนี้รู้สึกล้า แนะนำให้ซ้อมเบาหรือพักก่อน";
  const durationLabel = result.extracted.sleepDurationSource === "time_in_bed_fallback" ? "เวลานอน" : "นอนจริง";
  const primaryDuration = result.extracted.actualSleepDurationMinutes
    ? formatSleepMinutesThai(result.extracted.actualSleepDurationMinutes)
    : result.extracted.sleepDuration
      ? formatDuration(result.extracted.sleepDuration)
      : null;
  const timeInBed = result.extracted.timeInBedMinutes ? formatSleepMinutesThai(result.extracted.timeInBedMinutes) : null;
  const mergeNote = result.extracted.mergedFromMultipleImages
    ? "รวมข้อมูลจากหลายภาพแล้ว: ใช้หน้า Sleep สำหรับเวลานอน/คะแนนนอน และหน้า Energy สำหรับ HR/HRV/Energy"
    : "";
  const missingDurationNote = !primaryDuration
    ? "บันทึกได้ แต่ยังไม่พบเวลานอนจริง แนะนำอัปโหลดหน้า Sleep เพิ่มเพื่อให้ Report แม่นขึ้น"
    : "";

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Sleep Result</p>
      <div className="mt-3 flex items-center justify-between">
        <h2 className="text-xl font-bold">{label}</h2>
        <span className="rounded-full bg-[#b9d9c0] px-4 py-2 font-bold">{score}/100</span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-600">{summary}</p>
      <div className="mt-3">
        <DataQualityNote confidence={result.confidence} unclearFields={result.unclearFields} source="sleep" />
      </div>
      {mergeNote || missingDurationNote ? (
        <p className={`mt-3 rounded-2xl px-3 py-2 text-xs leading-5 ${missingDurationNote ? "bg-amber-50 text-amber-800" : "bg-[#eef7f0] text-[#2a5a39]"}`}>
          {missingDurationNote || mergeNote}
        </p>
      ) : null}
      <MetricGrid
        items={[
          { label: durationLabel, value: primaryDuration },
          { label: "เวลาบนเตียง", value: timeInBed },
          { label: "Sleep score", value: result.extracted.sleepScore != null ? formatScore(result.extracted.sleepScore) : null },
          { label: "Energy score", value: result.extracted.energyScore != null ? formatScore(result.extracted.energyScore) : null },
          { label: "Sleeping HR", value: result.extracted.restingHR != null ? formatHeartRate(result.extracted.restingHR) : null },
          { label: "HRV", value: result.extracted.hrv != null ? `${formatScore(result.extracted.hrv)} ms` : null },
          { label: "Respiratory", value: result.extracted.avgRespiratoryRate != null ? `${result.extracted.avgRespiratoryRate} /min` : null },
          { label: "Quality", value: result.extracted.sleepQualityLabel },
        ]}
      />
      <DetailBlock title="Training Recommendation" tone="green">{recommendation}</DetailBlock>
      <DetailBlock title="Why">{summary}</DetailBlock>
      <DetailBlock title="Nutrition Focus">{polishSleepInsightText(result.coach.nutritionFocus)}</DetailBlock>
      <DetailBlock title="Recovery Focus">{polishSleepInsightText(result.coach.recoveryFocus)}</DetailBlock>
      <DetailBlock title="Sleep Focus">{polishSleepInsightText(result.coach.sleepFocus)}</DetailBlock>
      <DetailBlock title="Visible Notes">{result.extracted.visibleNotes || "ไม่มี note เพิ่มเติมที่อ่านได้ชัดเจน"}</DetailBlock>
      <DetailBlock title="Safety Notes" tone="amber">{polishSleepInsightText(result.coach.warningNotes)}</DetailBlock>
    </section>
  );
}
