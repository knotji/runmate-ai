import type { DailySummary } from "@/types/logs";

export function DailySummaryCard({ summary }: { summary: DailySummary }) {
  return (
    <section className="card space-y-3 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--label-color)]">Daily Summary</p>
      <h2 className="text-xl font-bold">{summary.overallSummary}</h2>
      {[
        ["ซ้อม", summary.trainingReview],
        ["โภชนาการ", summary.nutritionReview],
        ["ฟื้นตัว", summary.recoveryReview],
        ["พรุ่งนี้", summary.tomorrowPlan],
      ].map(([label, text]) => (
        <div key={label} className="rounded-2xl bg-slate-50 p-3 text-sm leading-6">
          <strong>{label}: </strong>
          {text}
        </div>
      ))}
      <p className="rounded-2xl bg-[#e7efea] p-3 text-sm font-semibold">{summary.coachMessage}</p>
    </section>
  );
}
