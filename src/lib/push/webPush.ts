import webpush from "web-push";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails("mailto:support@runmate.app", publicKey, privateKey);
  configured = true;
  return true;
}

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

export type SendPushResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "send-failed"; expired: boolean };

/** Send a single push notification. `expired: true` means the subscription is
 *  gone (410/404 from the push service) and the caller should delete the row. */
export async function sendPushNotification(
  subscription: PushSubscriptionRow,
  payload: { title: string; body: string; url?: string },
): Promise<SendPushResult> {
  if (!ensureConfigured()) return { ok: false, reason: "not-configured", expired: false };

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
      },
      JSON.stringify(payload),
    );
    return { ok: true };
  } catch (error) {
    const statusCode = (error as { statusCode?: number } | null)?.statusCode;
    const expired = statusCode === 404 || statusCode === 410;
    return { ok: false, reason: "send-failed", expired };
  }
}
