"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DailySummaryCard } from "@/components/DailySummaryCard";
import { LoadingState } from "@/components/LoadingState";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import type { DailySummary } from "@/types/logs";

export default function SummaryPage() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    const context = await buildCoachContextFromSupabase();
    const response = await fetch("/api/generate-daily-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
    });
    const result = await response.json();
    const item = createHistoryItem("summary", result.data);
    const saveResult = await saveHistoryItems([item]);
    if (!saveResult.ok) {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      setLoading(false);
      return;
    }
    setSummary(result.data);
    setLoading(false);
  }

  return (
    <AppShell title="Daily Summary" subtitle="สรุปวันซ้อมและแผนพรุ่งนี้">
      <button className="btn-primary w-full" onClick={generate}>Generate daily summary</button>
      {loading ? <LoadingState /> : null}
      {error ? <p className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-500">{error}</p> : null}
      {summary ? <DailySummaryCard summary={summary} /> : null}
    </AppShell>
  );
}
