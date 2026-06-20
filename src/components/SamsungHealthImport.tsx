"use client";

import { useRef, useState } from "react";
import { unzip } from "fflate";
import { parseSamsungHealthFiles } from "@/lib/parseSamsungHealth";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { saveHistoryItems } from "@/lib/cloudHistory";
import type { LocalHistoryItem } from "@/lib/localHistory";

type Step = "idle" | "loading" | "preview" | "done" | "error";

type Preview = {
  sleep: number;
  workout: number;
  body: number;
  dateFrom: string | null;
  dateTo: string | null;
  items: LocalHistoryItem[];
};

export function SamsungHealthImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [cloudSyncMessage, setCloudSyncMessage] = useState("");

  async function handleFile(file: File) {
    setStep("loading");
    setError("");
    setCloudSyncMessage("");

    try {
      const buffer = await file.arrayBuffer();
      const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
        unzip(new Uint8Array(buffer), (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      const items = parseSamsungHealthFiles(files);

      const dates = items.map((i) => i.createdAt.slice(0, 10)).sort();
      setPreview({
        sleep: items.filter((i) => i.type === "sleep").length,
        workout: items.filter((i) => i.type === "workout").length,
        body: items.filter((i) => i.type === "body").length,
        dateFrom: dates[0] ?? null,
        dateTo: dates[dates.length - 1] ?? null,
        items,
      });
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setStep("error");
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setCloudSyncMessage("");

    invalidateCoachCache({ clearChat: true });
    const syncResult = await saveHistoryItems(preview.items);
    if (syncResult.ok) {
      setCloudSyncMessage("บันทึกแล้ว");
    } else {
      setCloudSyncMessage(`บันทึกไม่สำเร็จ กรุณาลองใหม่: ${syncResult.error ?? "ไม่ทราบสาเหตุ"}`);
    }

    setStep("done");
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".zip")) handleFile(file);
  }

  return (
    <div className="space-y-3">
      {step === "idle" && (
        <div
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <p className="text-2xl">📱</p>
          <p className="text-sm font-bold text-[#17201d]">วาง ZIP ที่นี่ หรือกดเลือกไฟล์</p>
          <p className="text-xs text-slate-400">ไฟล์ .zip ที่ export จาก Samsung Health</p>
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {step === "loading" && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-slate-50 p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#42677f]" />
          <p className="text-sm text-slate-600">กำลัง unzip และ parse ข้อมูล…</p>
          <p className="text-xs text-slate-400">ไฟล์ใหญ่อาจใช้เวลาสักครู่</p>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="rounded-2xl bg-[#e7efea] p-4 space-y-4">
          <div>
            <p className="text-sm font-bold text-[#17201d]">พบข้อมูล</p>
            {preview.dateFrom && preview.dateTo && (
              <p className="text-xs text-slate-500 mt-0.5">
                {formatThaiShort(preview.dateFrom)} – {formatThaiShort(preview.dateTo)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PreviewStat icon="🌙" label="นอน" count={preview.sleep} />
            <PreviewStat icon="🏃" label="ออกกำลังกาย" count={preview.workout} />
            <PreviewStat icon="⚖️" label="ชั่งน้ำหนัก" count={preview.body} />
          </div>
          {preview.sleep + preview.workout + preview.body === 0 ? (
            <p className="text-xs text-red-500">ไม่พบข้อมูลในช่วงนี้ ลอง export ใหม่ให้ครอบคลุมช่วงที่ต้องการ</p>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="flex-1 btn-primary text-sm py-3" onClick={confirmImport}>
                Import ทั้งหมด
              </button>
              <button type="button" className="flex-1 btn-secondary text-sm py-3" onClick={() => setStep("idle")}>
                ยกเลิก
              </button>
            </div>
          )}
        </div>
      )}

      {step === "done" && preview && (
        <div className="rounded-2xl bg-[#e7efea] p-4 text-center space-y-1">
          <p className="text-xl">✅</p>
          <p className="text-sm font-bold text-[#17201d]">Import สำเร็จแล้ว</p>
          <p className="text-xs text-slate-600">
            นอน {preview.sleep} · ออกกำลังกาย {preview.workout} · ชั่งน้ำหนัก {preview.body} รายการ
          </p>
          {cloudSyncMessage && (
            <p className={`mt-2 text-xs font-semibold ${cloudSyncMessage.includes("ไม่สำเร็จ") ? "text-red-600" : "text-green-700"}`}>
              {cloudSyncMessage}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-2">ดูข้อมูลได้ที่หน้า Report</p>
        </div>
      )}

      {step === "error" && (
        <div className="rounded-2xl bg-red-50 p-4 space-y-2">
          <p className="text-sm font-bold text-red-600">เกิดข้อผิดพลาด</p>
          <p className="text-xs text-red-500">{error}</p>
          <button type="button" className="btn-secondary w-full text-sm" onClick={() => setStep("idle")}>
            ลองใหม่
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewStat({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="rounded-xl bg-white p-3 text-center">
      <p className="text-lg">{icon}</p>
      <p className="mt-1 text-xl font-bold text-[#17201d]">{count}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function formatThaiShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${THAI_MONTHS[m - 1]}`;
}
