"use client";

import { useEffect, useState } from "react";

export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    function sync() {
      setOffline(!navigator.onLine);
    }
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 shadow-sm"
      data-testid="offline-banner"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      ตอนนี้ออฟไลน์ — ข้อมูลบางส่วนอาจยังไม่อัปเดต
    </div>
  );
}
