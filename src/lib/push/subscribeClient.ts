"use client";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

export type PushSupportState = "unsupported" | "denied" | "ready";

export function getPushSupportState(): PushSupportState {
  if (typeof window === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  return "ready";
}

/** Returns the endpoint of the active subscription, or null if not subscribed. */
export async function getCurrentPushEndpoint(): Promise<string | null> {
  if (getPushSupportState() !== "ready") return null;
  const registration = await navigator.serviceWorker.ready.catch(() => null);
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}

// pushManager.subscribe()/unsubscribe() can reject (e.g. iOS Safari outside an
// installed home-screen PWA, a stale/invalid VAPID key, or the push service being
// unreachable) — previously uncaught, which left the caller's await forever pending
// on a rejected promise it never handled, permanently stuck on "กำลังทำรายการ...".
// Every browser API call in both functions below is now wrapped so a failure always
// resolves to a normal { ok: false, reason } result instead of throwing.
export async function subscribeToPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (getPushSupportState() !== "ready") {
    return { ok: false, reason: "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน" };
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return { ok: false, reason: "ระบบแจ้งเตือนยังไม่ได้ตั้งค่า" };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "ไม่ได้รับอนุญาตให้แจ้งเตือน" };
    }

    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (!registration) {
      return { ok: false, reason: "ไม่พบ Service Worker" };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const json = subscription.toJSON();
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });

    if (!response.ok) {
      return { ok: false, reason: "บันทึกการแจ้งเตือนไม่สำเร็จ" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "เปิดการแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (getPushSupportState() === "unsupported") return { ok: true };

  try {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (!registration) return { ok: true };

    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return { ok: true };

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const response = await fetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });

    if (!response.ok) {
      return { ok: false, reason: "ยกเลิกการแจ้งเตือนไม่สำเร็จ" };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "ยกเลิกการแจ้งเตือนไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}
