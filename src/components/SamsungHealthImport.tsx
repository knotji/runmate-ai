"use client";

import { useRef, useState } from "react";
import { unzip } from "fflate";
import { parseSamsungHealthFiles } from "@/lib/parseSamsungHealth";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { saveHistoryItems } from "@/lib/cloudHistory";
import { LoadingButton } from "@/components/LoadingButton";
import type { LocalHistoryItem } from "@/lib/localHistory";
import { getHistoryItemDateKey } from "@/lib/date";

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
  const [importing, setImporting] = useState(false);

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

      const dates = items.map(getHistoryItemDateKey).sort();
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
    setImporting(true);

    try {
      invalidateCoachCache({ clearChat: true });
      const syncResult = await saveHistoryItems(preview.items);
      if (syncResult.ok) {
        setCloudSyncMessage("บันทึกแล้ว");
        setStep("done");
      } else {
        setCloudSyncMessage(`บันทึกไม่สำเร็จ กรุณาลองใหม่: ${syncResult.error ?? "ไม่ทราบสาเหตุ"}`);
        setStep("preview");
      }
    } finally {
      setImporting(false);
    }
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
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--border-warm)] p-8 text-center"
          onClick={() => inputRef.current?.click()}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <p className="text-2xl">📱</p>
          <p className="text-sm font-bold text-[var(--foreground)]">วาง ZIP ที่นี่ หรือกดเลือกไฟล์</p>
          <p className="text-xs text-[var(--color-text-soft)]">ไฟล์ .zip ที่ export จาก Samsung Health</p>
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
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--surface-muted)] p-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--border-warm)] border-t-[var(--recovery-blue)]" />
          <p className="text-sm text-[var(--color-text-muted)]">กำลัง unzip และ parse ข้อมูล…</p>
          <p className="text-xs text-[var(--color-text-soft)]">ไฟล์ใหญ่อาจใช้เวลาสักครู่</p>
        </div>
      )}

      {step === "preview" && preview && (
        <div className="rounded-2xl bg-[var(--color-success-soft)] p-4 space-y-4">
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">พบข้อมูล</p>
            {preview.dateFrom && preview.dateTo && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {formatThaiShort(preview.dateFrom)} – {formatThaiShort(preview.dateTo)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <PreviewStat icon="🌙" label="นอน" count={preview.sleep} />
            <PreviewStat icon="🏃" label="ออกกำลังกาย" count={preview.workout} />
            <PreviewStat icon="⚖️" label="ชั่งน้ำหนัก" count={preview.body} />
          </div>
          {cloudSyncMessage && (
            <p className="rounded-2xl bg-[var(--color-danger-soft)] p-3 text-xs font-semibold text-[var(--color-danger)]">
              {cloudSyncMessage}
            </p>
          )}
          {preview.sleep + preview.workout + preview.body === 0 ? (
            <p className="text-xs text-[var(--color-danger)]">ไม่พบข้อมูลในช่วงนี้ ลอง export ใหม่ให้ครอบคลุมช่วงที่ต้องการ</p>
          ) : (
            <div className="flex gap-2">
              <LoadingButton type="button" className="flex-1 btn-primary text-sm py-3" loading={importing} loadingText="กำลังบันทึก..." onClick={confirmImport}>
                Import ทั้งหมด
              </LoadingButton>
              <button type="button" disabled={importing} className="flex-1 btn-secondary text-sm py-3 disabled:opacity-50" onClick={() => setStep("idle")}>
                ยกเลิก
              </button>
            </div>
          )}
        </div>
      )}

      {step === "done" && preview && (
        <div className="rounded-2xl bg-[var(--color-success-soft)] p-4 text-center space-y-1">
          <p className="text-xl">✅</p>
          <p className="text-sm font-bold text-[var(--foreground)]">Import สำเร็จแล้ว</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            นอน {preview.sleep} · ออกกำลังกาย {preview.workout} · ชั่งน้ำหนัก {preview.body} รายการ
          </p>
          {cloudSyncMessage && (
            <p className={`mt-2 text-xs font-semibold ${cloudSyncMessage.includes("ไม่สำเร็จ") ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}`}>
              {cloudSyncMessage}
            </p>
          )}
          <p className="text-xs text-[var(--color-text-soft)] mt-2">ดูข้อมูลได้ที่หน้า Report</p>
        </div>
      )}

      {step === "error" && (
        <div className="rounded-2xl bg-[var(--color-danger-soft)] p-4 space-y-2">
          <p className="text-sm font-bold text-[var(--color-danger)]">เกิดข้อผิดพลาด</p>
          <p className="text-xs text-[var(--color-danger)]">{error}</p>
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
    <div className="rounded-xl bg-[var(--surface)] p-3 text-center">
      <p className="text-lg">{icon}</p>
      <p className="mt-1 text-xl font-bold text-[var(--foreground)]">{count}</p>
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
    </div>
  );
}

const THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function formatThaiShort(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${THAI_MONTHS[m - 1]}`;
}
