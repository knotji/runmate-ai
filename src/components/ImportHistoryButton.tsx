"use client";

import { useState } from "react";
import { importedCoachHistory } from "@/data/importedCoachHistory";
import type { HistoryType, LocalHistoryItem } from "@/lib/localHistory";

export function ImportHistoryButton() {
  const [status, setStatus] = useState("");

  function importHistory() {
    const byType = new Map<HistoryType, LocalHistoryItem[]>();
    for (const item of importedCoachHistory) {
      const list = byType.get(item.type as HistoryType) ?? [];
      list.push(item);
      byType.set(item.type as HistoryType, list);
    }

    let totalAdded = 0;
    for (const [type, items] of byType) {
      const key = `runmate.history.${type}`;
      const existing = readExisting(key);
      const existingIds = new Set(existing.map((e) => e.id));
      const newItems = items.filter((item) => !existingIds.has(item.id));
      const next = [...newItems, ...existing].slice(0, 60);
      localStorage.setItem(key, JSON.stringify(next));
      totalAdded += newItems.length;
    }

    setStatus(`นำเข้าแล้ว ${totalAdded} รายการ (${[...byType.keys()].join(", ")})`);
  }

  const typeBreakdown = importedCoachHistory.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-bold text-[#17201d]">นำเข้า history จาก ChatGPT share</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        นำเข้าข้อมูลประวัติ {importedCoachHistory.length} รายการแบบแยก type :{" "}
        {Object.entries(typeBreakdown)
          .map(([t, n]) => `${t} ${n}`)
          .join(", ")}
      </p>
      <button className="btn-secondary mt-3 w-full" onClick={importHistory} type="button">
        Import ChatGPT history
      </button>
      {status ? <p className="mt-2 text-xs font-semibold text-[#42677f]">{status}</p> : null}
    </div>
  );
}

function readExisting(key: string): LocalHistoryItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as LocalHistoryItem[]) : [];
  } catch {
    return [];
  }
}
