import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncGoogleHealthForConnection } from "@/lib/googleHealth/syncUser";
import { daysAgoBangkokDateKey } from "@/lib/date";

export const maxDuration = 60;

const BACKFILL_DAYS = 30;

// One-time historical import for the current user, triggered manually from Settings
// (not the daily cron). Uses the user's own session — RLS already scopes every table
// touched here to auth.uid() = user_id, so no service-role client is needed. Skips
// per-item AI coach generation (see syncGoogleHealthForConnection) to stay inside the
// serverless time budget when importing up to 30 days of sleep + exercise at once.
export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: connection, error: connError } = await supabase
    .from("google_health_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connError || !connection) {
    return NextResponse.json({ error: "not connected" }, { status: 404 });
  }

  const sinceDateKey = daysAgoBangkokDateKey(BACKFILL_DAYS);
  const result = await syncGoogleHealthForConnection(supabase, connection, sinceDateKey, { generateCoach: false });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "backfill failed" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    sinceDateKey,
    sleepImported: result.sleepImported,
    workoutsImported: result.workoutsImported,
    sleepSkippedManual: result.sleepSkippedManual,
    workoutsSkippedManual: result.workoutsSkippedManual,
    workoutsSkippedDuplicate: result.workoutsSkippedDuplicate,
    sleepSkippedNap: result.sleepSkippedNap,
  });
}
