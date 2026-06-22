"use client";

import { useState } from "react";
import { DetailBlock, MetricGrid } from "@/components/ResultDetail";
import { LoadingButton } from "@/components/LoadingButton";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import type { DailySummary, PostRunAnalysis, WorkoutAnalysis } from "@/types/logs";

export function PostRunAnalysisCard({ workout }: { workout: WorkoutAnalysis }) {
  const [analysis, setAnalysis] = useState<PostRunAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch("/api/post-run-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workout, context: await buildCoachContextFromSupabase() }),
      });
      if (!res.ok) throw new Error("post-run analysis failed");
      const json = await res.json() as { data: PostRunAnalysis };
      setAnalysis(json.data);
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[post-run-analysis-error]", error);
      }
      setError("วิเคราะห์หลังซ้อมไม่สำเร็จ ลองใหม่อีกครั้งครับ");
    } finally {
      setLoading(false);
    }
  }

  async function saveToReport() {
    if (!analysis) return;
    setSaving(true);
    setError("");
    const summary: DailySummary = {
      readinessScore: null,
      overallSummary: analysis.workoutSummary,
      trainingReview: analysis.intensityRead,
      nutritionReview: analysis.nutritionHydration,
      recoveryReview: analysis.recoveryPriority,
      whatWentWell: analysis.paceCadenceNotes,
      whatToImprove: analysis.hrAssessment,
      tomorrowPlan: analysis.tomorrowRecommendation,
      coachMessage: analysis.coachMessage,
    };
    try {
      const saved = createHistoryItem("summary", summary, workout.extracted.date ?? undefined);
      const result = await saveHistoryItems([saved]);
      if (!result.ok) {
        setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
        return;
      }
      invalidateCoachCache();
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Post-run Flow</p>
          <h2 className="mt-2 text-xl font-bold text-[#17201d]">วิเคราะห์หลังซ้อม</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            ใช้ workout นี้ + sleep/readiness + weekly load + race goal เพื่อสรุปว่าซ้อมนี้ส่งผลยังไง
          </p>
        </div>
        <LoadingButton
          type="button"
          onClick={analyze}
          loading={loading}
          loadingText="กำลังวิเคราะห์..."
          className="shrink-0 rounded-full bg-[#17201d] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {analysis ? "วิเคราะห์ใหม่" : "วิเคราะห์"}
        </LoadingButton>
      </div>

      {error ? <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-600">{error}</p> : null}

      {analysis ? (
        <div className="space-y-3">
          <MetricGrid
            items={[
              { label: "Session", value: analysis.sessionTitle },
              { label: "Effort", value: `${analysis.effortScore}/100` },
              { label: "Label", value: analysis.effortLabel },
              { label: "Risk flags", value: analysis.riskFlags.length ? `${analysis.riskFlags.length}` : "0" },
            ]}
          />
          <DetailBlock title="สรุปซ้อม">{analysis.workoutSummary}</DetailBlock>
          <DetailBlock title="Intensity">{analysis.intensityRead}</DetailBlock>
          <DetailBlock title="HR">{analysis.hrAssessment}</DetailBlock>
          <DetailBlock title="Pace / Cadence">{analysis.paceCadenceNotes}</DetailBlock>
          <DetailBlock title="Training Load">{analysis.trainingLoadImpact}</DetailBlock>
          <DetailBlock title="Recovery">{analysis.recoveryPriority}</DetailBlock>
          <DetailBlock title="Nutrition / Hydration">{analysis.nutritionHydration}</DetailBlock>
          <DetailBlock title="พรุ่งนี้" tone="green">{analysis.tomorrowRecommendation}</DetailBlock>
          {analysis.riskFlags.length > 0 ? (
            <DetailBlock title="Risk Flags">{analysis.riskFlags.map((flag) => `- ${flag}`).join("\n")}</DetailBlock>
          ) : null}
          <DetailBlock title="Coach Message">{analysis.coachMessage}</DetailBlock>
          <LoadingButton
            type="button"
            onClick={() => void saveToReport()}
            loading={saving}
            loadingText="กำลังบันทึก..."
            className="btn-secondary w-full py-3 text-sm"
          >
            {saved ? "บันทึกลง Report แล้ว" : "บันทึกลง Report"}
          </LoadingButton>
        </div>
      ) : null}
    </section>
  );
}
