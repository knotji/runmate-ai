"use client";

import { useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";

type Status = {
  connected: boolean;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

type BackfillState = "idle" | "loading" | "done" | "error";

function formatThaiDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

export function GoogleHealthConnectSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backfillState, setBackfillState] = useState<BackfillState>("idle");
  const [backfillSummary, setBackfillSummary] = useState("");

  useIsomorphicLayoutEffect(() => {
    fetch("/api/google-health/status")
      .then((res) => res.json())
      .then((data: Status) => setStatus(data))
      .catch(() => setStatus({ connected: false, connectedAt: null, lastSyncedAt: null, lastSyncError: null }));
  }, []);

  async function handleDisconnect() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/google-health/disconnect", { method: "POST" });
    setLoading(false);
    if (response.ok) {
      setStatus({ connected: false, connectedAt: null, lastSyncedAt: null, lastSyncError: null });
      setBackfillState("idle");
      setBackfillSummary("");
    } else {
      setError("ยกเลิกการเชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  async function handleBackfill() {
    setBackfillState("loading");
    setBackfillSummary("");
    const response = await fetch("/api/google-health/backfill", { method: "POST" });
    if (!response.ok) {
      setBackfillState("error");
      return;
    }
    const data = (await response.json()) as {
      sleepImported: number;
      workoutsImported: number;
      sleepSkippedManual: number;
      workoutsSkippedManual: number;
    };
    setBackfillState("done");
    const skipped = data.sleepSkippedManual + data.workoutsSkippedManual;
    const skippedNote = skipped > 0 ? ` (ข้าม ${skipped} วันที่มีรายการที่บันทึกเองอยู่แล้ว)` : "";
    setBackfillSummary(`ดึงย้อนหลังสำเร็จ — นอน ${data.sleepImported} คืน, ซ้อม ${data.workoutsImported} ครั้ง${skippedNote}`);
    setStatus((prev) => (prev ? { ...prev, lastSyncedAt: new Date().toISOString(), lastSyncError: null } : prev));
  }

  return (
    <section className="soft-panel px-4 py-3 text-xs text-[var(--muted-text)]" data-testid="google-health-connect-section">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เชื่อมต่ออุปกรณ์</p>
          <p className="mt-1 font-semibold text-[var(--foreground)]">Google Health</p>
          <p className="mt-0.5 leading-5">
            {status?.connected
              ? "ดึงข้อมูลนอนและซ้อมจากอุปกรณ์ที่เชื่อมกับ Google Health ให้อัตโนมัติทุกวัน"
              : "เชื่อมต่อ Google Health เพื่อบันทึกนอนและซ้อมอัตโนมัติ ไม่ต้องอัปโหลดรูปเอง"}
          </p>
          {status?.connected && status.lastSyncedAt && (
            <p className="mt-1 text-[var(--color-text-soft)]">ซิงก์ล่าสุด: {formatThaiDateTime(status.lastSyncedAt)}</p>
          )}
          {status?.connected && status.lastSyncError && (
            <p className="mt-1 text-[var(--color-danger)]">ซิงก์ล่าสุดไม่สำเร็จ: {status.lastSyncError}</p>
          )}
          {status?.connected && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => void handleBackfill()}
                disabled={backfillState === "loading"}
                data-testid="google-health-backfill-button"
                className="rounded-full border border-[var(--border-warm)] bg-[var(--surface)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--primary-soft)] disabled:opacity-50"
              >
                {backfillState === "loading" ? "กำลังดึงข้อมูลย้อนหลัง..." : "ดึงข้อมูลย้อนหลัง 30 วัน"}
              </button>
              {backfillState === "done" && (
                <p className="mt-1 text-[var(--color-success)]" data-testid="google-health-backfill-summary">{backfillSummary}</p>
              )}
              {backfillState === "error" && (
                <p className="mt-1 text-[var(--color-danger)]">ดึงข้อมูลย้อนหลังไม่สำเร็จ ลองใหม่อีกครั้ง</p>
              )}
            </div>
          )}
        </div>
        {status?.connected ? (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={loading}
            data-testid="google-health-disconnect-button"
            className="shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted-text)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:opacity-50"
          >
            {loading ? "กำลังยกเลิก..." : "ยกเลิกเชื่อมต่อ"}
          </button>
        ) : (
          <a
            href="/api/google-health/connect"
            data-testid="google-health-connect-button"
            className="shrink-0 rounded-full bg-[var(--primary)] px-3 py-1.5 text-[11px] font-bold text-[#f5f8ff]"
          >
            เชื่อมต่อ
          </a>
        )}
      </div>
      {error && <p className="mt-2 text-[var(--color-danger)]">{error}</p>}
    </section>
  );
}
