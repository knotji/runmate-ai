import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/webPush";
import { getBangkokDateKey, daysAgoBangkokDateKey, getHistoryItemDateKey } from "@/lib/date";
import { dedupeSleepItems } from "@/lib/sleepDedupe";
import { detectRestingHRTrend } from "@/lib/trendInsights";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis } from "@/types/logs";

export const maxDuration = 60;

const REMINDER_TITLE = "RunMate AI";

// Only ping at these streak lengths — otherwise this cron would push a
// notification every single day the trend persists (annoying). Firing at a
// few spaced-out milestones still reminds the user periodically as it
// continues, without spamming daily, and naturally stops once the streak breaks.
const MILESTONE_STREAK_DAYS = new Set([3, 5, 7]);

// Widest lookback detectRestingHRTrend needs for the largest milestone above,
// with a little headroom for a day or two without a sleep log mid-window.
const LOOKBACK_DAYS = 10;

export function buildMessage(streakDays: number, latestRestingHR: number, riseBpm: number): string {
  return `ชีพจรขณะพักสูงขึ้นต่อเนื่อง ${streakDays} วันแล้ว (ล่าสุด ${latestRestingHR} bpm, สูงขึ้น ${riseBpm} bpm) ลองพักเพิ่มอีกนิด ฟังร่างกายก่อนซ้อมหนักนะ 💙`;
}

/**
 * Resting-HR trend push notifications (see vercel.json). Separate from the
 * daily "haven't logged today" reminder and the race-countdown reminder —
 * different trigger condition (a detected multi-day trend, not today's log
 * activity or race proximity) and tracked via its own
 * last_trend_alert_date_key column so the three notification types can't
 * suppress each other.
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
  // Vercel's function logs instead of vanishing behind a bare 500.
  try {
    const todayKey = getBangkokDateKey();
    const sinceKey = daysAgoBangkokDateKey(LOOKBACK_DAYS);

    const { data: subscriptions, error: subError } = await admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth_key, last_trend_alert_date_key");

    if (subError || !subscriptions) {
      console.error("[send-trend-alerts] failed to load subscriptions", subError);
      return NextResponse.json({ error: "failed to load subscriptions", detail: subError?.message }, { status: 500 });
    }

    const userIds = [...new Set(subscriptions.map((s) => s.user_id as string))];
    if (userIds.length === 0) {
      return NextResponse.json({ ok: true, eligibleUsers: 0, sent: 0, skippedAlreadySentToday: 0, skippedNoTrend: 0, expiredRemoved: 0, failed: 0 });
    }

    const { data: sleepRows, error: sleepError } = await admin
      .from("history_items")
      .select("id, user_id, created_at, data")
      .in("user_id", userIds)
      .eq("type", "sleep")
      .gte("data->>dateKey", sinceKey);

    if (sleepError || !sleepRows) {
      console.error("[send-trend-alerts] failed to load sleep history", sleepError);
      return NextResponse.json({ error: "failed to load sleep history", detail: sleepError?.message }, { status: 500 });
    }

    const itemsByUser = new Map<string, LocalHistoryItem[]>();
    for (const row of sleepRows) {
      const item: LocalHistoryItem = {
        id: row.id as string,
        type: "sleep",
        createdAt: row.created_at as string,
        data: row.data,
      };
      const list = itemsByUser.get(row.user_id as string) ?? [];
      list.push(item);
      itemsByUser.set(row.user_id as string, list);
    }

    let sent = 0;
    let skippedAlreadySentToday = 0;
    let skippedNoTrend = 0;
    let expiredRemoved = 0;
    let failed = 0;

    for (const sub of subscriptions) {
      if (sub.last_trend_alert_date_key === todayKey) {
        skippedAlreadySentToday += 1;
        continue;
      }

      const items = itemsByUser.get(sub.user_id as string) ?? [];
      const rows = dedupeSleepItems(items).map((item) => ({
        date: getHistoryItemDateKey(item),
        restingHR: (item.data as SleepAnalysis | null)?.extracted?.restingHR ?? null,
      }));

      const trend = detectRestingHRTrend(rows);
      if (!trend || !MILESTONE_STREAK_DAYS.has(trend.streakDays)) {
        skippedNoTrend += 1;
        continue;
      }

      const result = await sendPushNotification(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key },
        { title: REMINDER_TITLE, body: buildMessage(trend.streakDays, trend.latestRestingHR, trend.riseBpm), url: "/" },
      );

      if (result.ok) {
        sent += 1;
        await admin.from("push_subscriptions").update({ last_trend_alert_date_key: todayKey }).eq("id", sub.id);
      } else if (result.expired) {
        expiredRemoved += 1;
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      eligibleUsers: userIds.length,
      sent,
      skippedAlreadySentToday,
      skippedNoTrend,
      expiredRemoved,
      failed,
    });
  } catch (error) {
    console.error("[send-trend-alerts] unhandled error", error);
    return NextResponse.json({ error: "unhandled error", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
