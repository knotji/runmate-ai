"use client";

import { useState, useRef, useEffect } from "react";
import { parseCsvImportText, type ParsedCsvImport } from "@/lib/import/parseCsvImport";
import { normalizedActivityToHistoryItem, normalizedSleepToHistoryItem, type NormalizedActivityRecord, type NormalizedSleepRecord } from "@/lib/import/normalized";
import { loadHistoryItems, saveHistoryItems } from "@/lib/cloudHistory";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { LoadingButton } from "@/components/LoadingButton";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { WorkoutAnalysis } from "@/types/logs";

type CsvPreviewState =
  | {
      kind: "sleep";
      fileName: string;
      records: NormalizedSleepRecord[];
      warnings: string[];
      detectedFormat: string;
    }
  | {
      kind: "activity";
      fileName: string;
      records: NormalizedActivityRecord[];
      warnings: string[];
      detectedFormat: string;
    };

function csvDuplicateKey(item: LocalHistoryItem): string | null {
  if (item.type === "sleep") {
    const dateKey = item.dateKey ?? (item.data as Record<string, unknown> | null)?.dateKey;
    return dateKey ? `sleep:${dateKey}` : null;
  }

  if (item.type === "workout") {
    const data = item.data as WorkoutAnalysis | null;
    const ext = data?.extracted;
    if (!ext) return null;
    return [
      "workout",
      item.recordedAt ?? item.createdAt,
      ext.workoutKind,
      ext.duration ?? "",
      ext.distanceKm ?? "",
    ].join(":");
  }

  return null;
}

export function CsvHistoryImporter({
  type,
  onImportComplete,
}: {
  type: "sleep" | "workout";
  onImportComplete?: () => void;
}) {
  const [csvPreview, setCsvPreview] = useState<CsvPreviewState | null>(null);
  const [csvImportStatus, setCsvImportStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [csvImportSummary, setCsvImportSummary] = useState("");
  const [csvImportError, setCsvImportError] = useState("");
  const [csvDuplicateCount, setCsvDuplicateCount] = useState(0);
  const [fileName, setFileName] = useState("");

  function resetCsvImport() {
    setCsvPreview(null);
    setCsvImportStatus("idle");
    setCsvImportSummary("");
    setCsvImportError("");
    setCsvDuplicateCount(0);
    setFileName("");
  }

  function handleCsvParsed(parsed: ParsedCsvImport, fileName: string) {
    resetCsvImport();
    if (parsed.kind === "sleep") {
      setCsvPreview({
        kind: "sleep",
        fileName,
        records: parsed.records,
        warnings: parsed.warnings,
        detectedFormat: parsed.detectedFormat,
      });
      return;
    }
    setCsvPreview({
      kind: "activity",
      fileName,
      records: parsed.records,
      warnings: parsed.warnings,
      detectedFormat: parsed.detectedFormat,
    });
  }

  async function saveCsvPreview() {
    if (!csvPreview) return;
    setCsvImportStatus("saving");
    setCsvImportError("");
    setCsvImportSummary("");

    const historyResult = await loadHistoryItems(csvPreview.kind === "sleep" ? ["sleep"] : ["workout"]);
    const existingItems = historyResult.ok ? historyResult.items : [];
    const duplicateKeys = new Set(existingItems.map(csvDuplicateKey).filter((key): key is string => Boolean(key)));
    const converted = csvPreview.kind === "sleep"
      ? csvPreview.records.map(normalizedSleepToHistoryItem)
      : csvPreview.records.map(normalizedActivityToHistoryItem);

    const unique = converted.filter((item) => {
      const key = csvDuplicateKey(item);
      if (!key) return true;
      if (duplicateKeys.has(key)) return false;
      duplicateKeys.add(key);
      return true;
    });
    const skipped = converted.length - unique.length;
    setCsvDuplicateCount(skipped);

    if (!unique.length) {
      setCsvImportStatus("saved");
      setCsvImportSummary(`นำเข้าแล้ว 0 รายการ · ข้ามรายการซ้ำ ${skipped} รายการ`);
      if (onImportComplete) onImportComplete();
      return;
    }

    const saveResult = await saveHistoryItems(unique);
    if (!saveResult.ok) {
      setCsvImportStatus("error");
      setCsvImportError(saveResult.error ?? "นำเข้า CSV ไม่สำเร็จ ลองใหม่อีกครั้ง");
      return;
    }

    setCsvImportStatus("saved");
    setCsvImportSummary(`นำเข้าแล้ว ${unique.length} รายการ${skipped ? ` · ข้ามรายการซ้ำ ${skipped} รายการ` : ""}`);
    invalidateCoachCache();
    void buildCoachContextFromSupabase();
    if (onImportComplete) onImportComplete();
  }

  return (
    <CsvImportPanel
      type={type}
      preview={csvPreview}
      status={csvImportStatus}
      summary={csvImportSummary}
      error={csvImportError}
      duplicateCount={csvDuplicateCount}
      fileName={fileName}
      setFileName={setFileName}
      onParsed={handleCsvParsed}
      onSave={() => void saveCsvPreview()}
      onCancel={resetCsvImport}
    />
  );
}

function CsvImportPanel({
  type,
  preview,
  status,
  summary,
  error,
  duplicateCount,
  fileName,
  setFileName,
  onParsed,
  onSave,
  onCancel,
}: {
  type: "sleep" | "workout";
  preview: CsvPreviewState | null;
  status: "idle" | "saving" | "saved" | "error";
  summary: string;
  error: string;
  duplicateCount: number;
  fileName: string;
  setFileName: (val: string) => void;
  onParsed: (parsed: ParsedCsvImport, fileName: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [localError, setLocalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Re-sync inputRef state when preview is cancelled / reset
  useEffect(() => {
    if (!preview) {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }, [preview]);

  const helperText = type === "sleep"
    ? "รองรับ CSV การนอนจาก Garmin/Apple Health เช่น duration, score, HRV, resting HR"
    : "รองรับ CSV กิจกรรมจาก Garmin หรือแหล่งอื่น เช่น ระยะ เวลา pace HR และ calories";

  async function handleFile(file: File | null) {
    setLocalError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setLocalError("กรุณาเลือกไฟล์ CSV");
      return;
    }
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsvImportText(text, {
      originalFileName: file.name,
      preferredKind: type === "sleep" ? "sleep" : "activity",
    });
    if (parsed.kind === "unknown") {
      setLocalError(parsed.message);
      return;
    }
    onParsed(parsed, file.name);
  }

  return (
    <div className="space-y-3 rounded-[22px] bg-[var(--surface-muted)]/70 p-3" data-testid="csv-import-panel">
      <p className="rounded-2xl bg-[var(--surface)]/75 px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">{helperText}</p>
      <label className="flex min-h-[104px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-[var(--border-warm)] bg-[var(--surface)]/70 px-4 py-5 text-center hover:border-[var(--primary)]/60">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".csv,text/csv"
          data-testid="csv-file-input"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        />
        <span className="text-2xl">CSV</span>
        <span className="text-sm font-bold text-[var(--foreground)]">{fileName || "เลือก CSV ก่อนนำเข้า"}</span>
        <span className="text-xs text-[var(--muted-text)]">แตะเพื่อเลือกไฟล์ .csv</span>
      </label>
      {(localError || error) && <p className="text-xs font-semibold text-[var(--status-rest)]">{localError || error}</p>}
      {preview && (
        <CsvImportPreview
          preview={preview}
          status={status}
          summary={summary}
          duplicateCount={duplicateCount}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </div>
  );
}

function CsvImportPreview({
  preview,
  status,
  summary,
  duplicateCount,
  onSave,
  onCancel,
}: {
  preview: CsvPreviewState;
  status: "idle" | "saving" | "saved" | "error";
  summary: string;
  duplicateCount: number;
  onSave: () => void;
  onCancel: () => void;
}) {
  const records = preview.records.slice(0, 5);
  return (
    <section className="rounded-[20px] bg-[var(--surface)] p-3 shadow-sm" data-testid="csv-import-preview">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--label-color)]">{preview.detectedFormat}</p>
        <h3 className="text-base font-bold text-[var(--foreground)]">พรีวิวข้อมูลนำเข้า {preview.records.length} รายการ</h3>
        {preview.warnings.length > 0 && (
          <p className="mt-1 text-xs text-[var(--color-warning)]">ข้าม {preview.warnings.length} รายการที่ข้อมูลไม่พอ</p>
        )}
        {duplicateCount > 0 && <p className="mt-1 text-xs text-[var(--color-text-muted)]">ข้ามรายการซ้ำ {duplicateCount} รายการ</p>}
      </div>
      <div className="space-y-2">
        {records.map((record, index) => (
          <div key={index} className="rounded-2xl bg-[var(--surface-muted)] px-3 py-2 text-xs text-[var(--foreground)]">
            {preview.kind === "sleep" ? (
              <CsvSleepPreviewRow record={record as NormalizedSleepRecord} />
            ) : (
              <CsvActivityPreviewRow record={record as NormalizedActivityRecord} />
            )}
          </div>
        ))}
      </div>
      {summary && <p className="mt-3 text-sm font-bold text-[var(--status-ready)]">{summary}</p>}
      {status !== "saved" && (
        <div className="mt-3 flex gap-2">
          <LoadingButton type="button" loading={status === "saving"} loadingText="กำลังนำเข้า..." onClick={onSave} className="btn-primary flex-1 py-2.5 text-sm">
            บันทึกข้อมูลที่นำเข้า
          </LoadingButton>
          <button type="button" onClick={onCancel} className="rounded-full bg-[var(--surface-muted)] px-4 py-2.5 text-sm font-bold text-[var(--color-text-muted)]">
            ยกเลิก
          </button>
        </div>
      )}
    </section>
  );
}

function CsvSleepPreviewRow({ record }: { record: NormalizedSleepRecord }) {
  return (
    <p>
      <span className="font-bold">{record.dateKey}</span>
      {" · "}
      {record.durationMinutes != null ? `${Math.round(record.durationMinutes / 60 * 10) / 10} ชม.` : "ไม่ทราบเวลา"}
      {record.sleepScore != null ? ` · score ${record.sleepScore}` : ""}
      {record.hrvMs != null ? ` · HRV ${record.hrvMs}` : ""}
      {record.restingHeartRate != null ? ` · RHR ${record.restingHeartRate}` : ""}
    </p>
  );
}

function CsvActivityPreviewRow({ record }: { record: NormalizedActivityRecord }) {
  return (
    <p>
      <span className="font-bold">{record.dateKey}</span>
      {" · "}
      {record.activityType}
      {record.distanceKm != null ? ` · ${record.distanceKm} km` : ""}
      {record.durationSeconds != null ? ` · ${Math.round(record.durationSeconds / 60)} นาที` : ""}
      {record.avgHr != null ? ` · HR ${record.avgHr}` : ""}
      {record.calories != null ? ` · ${record.calories} kcal` : ""}
    </p>
  );
}
