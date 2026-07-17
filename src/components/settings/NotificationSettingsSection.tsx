"use client";

import { useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import {
  getPushSupportState,
  getCurrentPushEndpoint,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push/subscribeClient";

export function NotificationSettingsSection() {
  // This page is statically prerendered, so the initial state must NOT read browser
  // APIs (Notification.permission etc.) — that would desync from the prerendered
  // HTML and trigger a hydration mismatch. useLayoutEffect resolves it synchronously
  // before paint instead, so there's still no visible flash of the wrong state.
  const [supportState, setSupportState] = useState<"checking" | "unsupported" | "denied" | "ready">("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useIsomorphicLayoutEffect(() => {
    const state = getPushSupportState();
    setSupportState(state);
    if (state === "ready") {
      getCurrentPushEndpoint().then((endpoint) => setSubscribed(Boolean(endpoint)));
    }
  }, []);

  async function handleToggle() {
    setBusy(true);
    setMessage("");
    try {
      if (subscribed) {
        const result = await unsubscribeFromPush();
        if (result.ok) {
          setSubscribed(false);
        } else {
          setMessage(result.reason);
        }
      } else {
        const result = await subscribeToPush();
        if (result.ok) {
          setSubscribed(true);
        } else {
          setMessage(result.reason);
          setSupportState(getPushSupportState());
        }
      }
    } catch {
      setMessage("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="soft-panel px-4 py-3 text-xs text-[var(--muted-text)]" data-testid="notification-settings-section">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">การแจ้งเตือน</p>
          <p className="mt-1 font-semibold text-[var(--foreground)]">เตือนบันทึกประจำวัน</p>
          <p className="mt-0.5 leading-5">
            {supportState === "unsupported"
              ? "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน"
              : supportState === "denied"
                ? "การแจ้งเตือนถูกปิดไว้ในตั้งค่าเบราว์เซอร์ — เปิดใหม่ได้ที่ตั้งค่าเบราว์เซอร์"
                : "เตือนตอนเย็นถ้ายังไม่ได้บันทึกนอน/อาหาร/ซ้อมวันนี้เลย"}
          </p>
        </div>
        {supportState === "ready" && (
          <button
            type="button"
            onClick={() => void handleToggle()}
            disabled={busy}
            data-testid="notification-toggle"
            className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50 ${
              subscribed
                ? "bg-[var(--surface-muted)] text-[var(--muted-text)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                : "bg-[var(--primary)] text-[#f5f8ff]"
            }`}
          >
            {busy ? "กำลังทำรายการ..." : subscribed ? "ปิดแจ้งเตือน" : "เปิดแจ้งเตือน"}
          </button>
        )}
      </div>
      {message && <p className="mt-2 text-[var(--color-danger)]">{message}</p>}
    </section>
  );
}
