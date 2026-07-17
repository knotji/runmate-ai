import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/webPush";
import { buildSleepTargetLabel } from "@/lib/push/personalizedReminder";
import { getBangkokDateKey } from "@/lib/date";

export const maxDuration = 60;

const REMINDER_TITLE = "RunMate AI";
const REMINDER_BODY_GENERIC = "วันนี้ยังไม่มีการบันทึกเลย ลองเช็คอินสัก 1 อย่าง (นอน/อาหาร/ซ้อม) กันลืมนะ 🏃";

/**
 * Daily reminder cron job (see vercel.json). Nudges any subscribed user who
 * hasn't saved a sleep/meal/workout log yet today — checked via created_at
 * (wall-clock save time), not the log's own dateKey, since the point is "have
 * they opened the app and logged something today" regardless of which day
 * they backdated the entry to.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin client not configured" }, { status: 500 });
  }

  // Wrapped so a real cause (bad service-role key, missing table/column, a
  // transient Supabase network error) shows up in the response body and
  // Vercel's function logs instead of vanishing behind a bare 500 — this is
  // the only place these cron routes report their own failures, since no one
  // is watching the response body live.
  try {
    const todayKey = getBangkokDateKey();
    const todayStartUtc = new Date(`${todayKey}T00:00:00+07:00`).toISOString();

    const { data: subscriptions, error: subError } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key, last_sent_date_key");

    if (subError || !subscriptions) {
      console.error("[send-daily-reminders] failed to load subscriptions", subError);
      return NextResponse.json({ error: "failed to load subscriptions", detail: subError?.message }, { status: 500 });
    }

    let sent = 0;
    let skippedAlreadyLogged = 0;
    let skippedAlreadySentToday = 0;
    let expiredRemoved = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      if (sub.last_sent_date_key === todayKey) {
        skippedAlreadySentToday += 1;
        continue;
      }

      const { count } = await admin
        .from("history_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", sub.user_id)
        .in("type", ["sleep", "meal", "workout"])
        .gte("created_at", todayStartUtc);

      if (count && count > 0) {
        skippedAlreadyLogged += 1;
        continue;
      }

      // Best-effort personalization: if we have enough recent history to compute a
      // sleep target (same Recovery Loop logic shown on Today/Report), lead with that
      // instead of the generic nudge — falls back to the generic body on any failure
      // or insufficient data, never blocks sending the reminder itself.
      const sleepTarget = await buildSleepTargetLabel(admin, sub.user_id).catch(() => null);
      const body = sleepTarget
        ? `${sleepTarget} คืนนี้ 🌙 อย่าลืมเช็คอินวันนี้ด้วยนะ`
        : REMINDER_BODY_GENERIC;

      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key },
        { title: REMINDER_TITLE, body, url: "/upload" },
      );

      if (result.ok) {
        sent += 1;
        await admin.from("push_subscriptions").update({ last_sent_date_key: todayKey }).eq("id", sub.id);
      } else if (result.expired) {
        expiredRemoved += 1;
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      totalSubscriptions: subscriptions.length,
      sent,
      skippedAlreadyLogged,
      skippedAlreadySentToday,
      expiredRemoved,
      failed,
    });
  } catch (error) {
    console.error("[send-daily-reminders] unhandled error", error);
    return NextResponse.json({ error: "unhandled error", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
