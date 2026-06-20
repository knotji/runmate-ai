"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DailySummaryCard } from "@/components/DailySummaryCard";
import { LoadingState } from "@/components/LoadingState";
import { appendHistory, collectCoachContext } from "@/lib/localHistory";
import { pushHistoryItems } from "@/lib/historySync";
import { useLocalStorageValue } from "@/lib/useLocalStorageValue";
import type { DailySummary } from "@/types/logs";

export default function SummaryPage() {
  const savedSummary = useLocalStorageValue<DailySummary>("runmate.dailySummary");
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const shownSummary = summary || savedSummary;

  async function generate() {
    setLoading(true);
    const response = await fetch("/api/generate-daily-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(collectCoachContext()),
    });
    const result = await response.json();
    localStorage.setItem("runmate.dailySummary", JSON.stringify(result.data));
    const saved = appendHistory("summary", result.data);
    if (saved) pushHistoryItems([saved]).catch(() => {});
    setSummary(result.data);
    setLoading(false);
  }

  return (
    <AppShell title="Daily Summary" subtitle="สรุปวันซ้อมและแผนพรุ่งนี้">
      <button className="btn-primary w-full" onClick={generate}>Generate daily summary</button>
      {loading ? <LoadingState /> : null}
      {shownSummary ? <DailySummaryCard summary={shownSummary} /> : null}
    </AppShell>
  );
}
