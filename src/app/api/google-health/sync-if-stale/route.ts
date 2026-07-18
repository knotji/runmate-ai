import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncGoogleHealthForConnection } from "@/lib/googleHealth/syncUser";
import { yesterdayBangkokDateKey } from "@/lib/date";

export const maxDuration = 30;

// Vercel Hobby caps cron jobs at once/day, so the background cron (3x/day,
// see vercel.json) can't get closer to "live" than that on its own. This
// route fills the gap: called once per app load (see
// GoogleHealthSyncOnOpen.tsx), it re-syncs the current user's own Google
// Health connection if their last sync is more than 5 minutes old — cheap
// no-op the rest of the time. Runs as the authenticated user themselves
// (session-scoped client, not the admin/service-role one the cron uses),
// since it only ever touches that one user's own rows.
const STALE_AFTER_MS = 5 * 60 * 1000;

export function isStale(lastSyncedAt: string | null, nowMs: number): boolean {
  const lastSyncedMs = lastSyncedAt ? new Date(lastSyncedAt).getTime() : 0;
  return nowMs - lastSyncedMs >= STALE_AFTER_MS;
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ synced: false, reason: "not-configured" });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ synced: false, reason: "not-authenticated" });
  }

  const { data: connection } = await supabase
    .from("google_health_connections")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ synced: false, reason: "not-connected" });
  }

  if (!isStale(connection.last_synced_at, Date.now())) {
    return NextResponse.json({ synced: false, reason: "fresh" });
  }

  try {
    const result = await syncGoogleHealthForConnection(supabase, connection, yesterdayBangkokDateKey(), { generateCoach: true });
    return NextResponse.json({ synced: result.ok, reason: result.ok ? "synced" : "sync-failed", ...result });
  } catch (error) {
    console.error("[google-health-sync-if-stale] unhandled error", error);
    return NextResponse.json({ synced: false, reason: "unhandled-error", detail: error instanceof Error ? error.message : String(error) });
  }
}
