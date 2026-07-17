import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotification } from "@/lib/push/webPush";
import { getBangkokDateKey } from "@/lib/date";

export const maxDuration = 60;

const REMINDER_TITLE = "RunMate AI";

// Only fire at these countdown points to avoid spamming — every other day this
// cron simply finds nothing to send. Bangkok-day granularity (not exact hours),
// matching how the rest of the app computes daysUntilRace.
const MILESTONE_DAYS = new Set([7, 3, 1, 0]);

export function buildMessage(daysUntilRace: number, raceName: string): string {
  if (daysUntilRace === 0) return `วันนี้วันแข่ง ${raceName} แล้ว! สู้ๆ นะ 🏃‍♂️🔥`;
  if (daysUntilRace === 1) return `พรุ่งนี้วันแข่ง ${raceName} แล้ว! เตรียมอุปกรณ์ให้พร้อม นอนแต่หัวค่ำนะ 🏁`;
  if (daysUntilRace === 3) return `อีก 3 วันจะแข่ง ${raceName} แล้ว! นอนให้พอ ลดความหนักซ้อมลง 💪`;
  return `เหลืออีก ${daysUntilRace} วันก่อนแข่ง ${raceName} 🎯 เข้าสู่ช่วง taper ได้แล้ว`;
}

export function daysUntil(raceDate: string, todayKey: string): number {
  const raceMs = Date.parse(`${raceDate}T12:00:00+07:00`);
  const todayMs = Date.parse(`${todayKey}T12:00:00+07:00`);
  return Math.round((raceMs - todayMs) / 86_400_000);
}

/**
 * Race-countdown push notifications (see vercel.json). Separate from the daily
 * "haven't logged today" reminder — different trigger condition (proximity to
 * an active race goal, not today's log activity) and tracked via its own
 * last_race_reminder_date_key column so the two notification types can't
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

  const todayKey = getBangkokDateKey();

  const { data: raceGoals, error: goalsError } = await admin
    .from("race_goals")
    .select("user_id, race_name, race_date")
    .not("status", "eq", "completed");

  if (goalsError || !raceGoals) {
    return NextResponse.json({ error: "failed to load race goals" }, { status: 500 });
  }

  // A user could technically have more than one non-completed goal; keep the
  // soonest upcoming one per user, matching loadActiveRaceGoalAndPlan's intent.
  const raceByUser = new Map<string, { raceName: string; raceDate: string; daysUntilRace: number }>();
  for (const goal of raceGoals) {
    const daysUntilRace = daysUntil(goal.race_date as string, todayKey);
    if (!MILESTONE_DAYS.has(daysUntilRace)) continue;
    const existing = raceByUser.get(goal.user_id as string);
    if (!existing || daysUntilRace < existing.daysUntilRace) {
      raceByUser.set(goal.user_id as string, {
        raceName: goal.race_name as string,
        raceDate: goal.race_date as string,
        daysUntilRace,
      });
    }
  }

  if (raceByUser.size === 0) {
    return NextResponse.json({ ok: true, eligibleUsers: 0, sent: 0, skippedAlreadySentToday: 0, expiredRemoved: 0, failed: 0 });
  }

  const { data: subscriptions, error: subError } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key, last_race_reminder_date_key")
    .in("user_id", [...raceByUser.keys()]);

  if (subError || !subscriptions) {
    return NextResponse.json({ error: "failed to load subscriptions" }, { status: 500 });
  }

  let sent = 0;
  let skippedAlreadySentToday = 0;
  let expiredRemoved = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    if (sub.last_race_reminder_date_key === todayKey) {
      skippedAlreadySentToday += 1;
      continue;
    }

    const race = raceByUser.get(sub.user_id as string);
    if (!race) continue;

    const result = await sendPushNotification(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key },
      { title: REMINDER_TITLE, body: buildMessage(race.daysUntilRace, race.raceName), url: "/race-goal" },
    );

    if (result.ok) {
      sent += 1;
      await admin.from("push_subscriptions").update({ last_race_reminder_date_key: todayKey }).eq("id", sub.id);
    } else if (result.expired) {
      expiredRemoved += 1;
      await admin.from("push_subscriptions").delete().eq("id", sub.id);
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    eligibleUsers: raceByUser.size,
    sent,
    skippedAlreadySentToday,
    expiredRemoved,
    failed,
  });
}
