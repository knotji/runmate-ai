"use client";

import { useState } from "react";
import { importedCoachHistory } from "@/data/importedCoachHistory";
import { saveHistoryItems } from "@/lib/cloudHistory";

export function ImportHistoryButton() {
  const [status, setStatus] = useState("");

  async function importHistory() {
    setStatus("กำลังบันทึก...");
    const result = await saveHistoryItems(importedCoachHistory);
    if (!result.ok) {
      setStatus("บันทึกไม่สำเร็จ กรุณาลองใหม่");
      return;
    }
    setStatus(`บันทึกแล้ว ${importedCoachHistory.length} รายการ`);
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
      <button className="btn-secondary mt-3 w-full" onClick={() => void importHistory()} type="button">
        Import ChatGPT history
      </button>
      {status ? <p className="mt-2 text-xs font-semibold text-[#42677f]">{status}</p> : null}
    </div>
  );
}
