"use client";

import { useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";

type Status = {
  connected: boolean;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

function formatThaiDateTime(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

export function FitbitConnectSection() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useIsomorphicLayoutEffect(() => {
    fetch("/api/fitbit/status")
      .then((res) => res.json())
      .then((data: Status) => setStatus(data))
      .catch(() => setStatus({ connected: false, connectedAt: null, lastSyncedAt: null, lastSyncError: null }));
  }, []);

  async function handleDisconnect() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/fitbit/disconnect", { method: "POST" });
    setLoading(false);
    if (response.ok) {
      setStatus({ connected: false, connectedAt: null, lastSyncedAt: null, lastSyncError: null });
    } else {
      setError("ยกเลิกการเชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  return (
    <section className="soft-panel px-4 py-3 text-xs text-[var(--muted-text)]" data-testid="fitbit-connect-section">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เชื่อมต่ออุปกรณ์</p>
          <p className="mt-1 font-semibold text-[var(--foreground)]">Fitbit</p>
          <p className="mt-0.5 leading-5">
            {status?.connected
              ? "ดึงข้อมูลนอนและซ้อมจาก Fitbit ให้อัตโนมัติทุกวัน"
              : "เชื่อมต่อ Fitbit เพื่อบันทึกนอนและซ้อมอัตโนมัติ ไม่ต้องอัปโหลดรูปเอง"}
          </p>
          {status?.connected && status.lastSyncedAt && (
            <p className="mt-1 text-[var(--color-text-soft)]">ซิงก์ล่าสุด: {formatThaiDateTime(status.lastSyncedAt)}</p>
          )}
          {status?.connected && status.lastSyncError && (
            <p className="mt-1 text-[var(--color-danger)]">ซิงก์ล่าสุดไม่สำเร็จ: {status.lastSyncError}</p>
          )}
        </div>
        {status?.connected ? (
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            disabled={loading}
            data-testid="fitbit-disconnect-button"
            className="shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted-text)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:opacity-50"
          >
            {loading ? "กำลังยกเลิก..." : "ยกเลิกเชื่อมต่อ"}
          </button>
        ) : (
          <a
            href="/api/fitbit/connect"
            data-testid="fitbit-connect-button"
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
