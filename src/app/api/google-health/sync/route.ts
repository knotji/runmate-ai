import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncGoogleHealthForConnection } from "@/lib/googleHealth/syncUser";
import { yesterdayBangkokDateKey } from "@/lib/date";

export const maxDuration = 60;

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

  const yesterdayKey = yesterdayBangkokDateKey();

  const { data: connections, error: connError } = await admin.from("google_health_connections").select("*");
  if (connError || !connections) {
    return NextResponse.json({ error: "failed to load connections" }, { status: 500 });
  }

  let usersSynced = 0;
  let sleepImported = 0;
  let workoutsImported = 0;
  let sleepSkippedManual = 0;
  let workoutsSkippedManual = 0;
  let failed = 0;

  for (const connection of connections) {
    const result = await syncGoogleHealthForConnection(admin, connection, yesterdayKey, { generateCoach: true });
    if (result.ok) {
      usersSynced += 1;
    } else {
      failed += 1;
    }
    sleepImported += result.sleepImported;
    workoutsImported += result.workoutsImported;
    sleepSkippedManual += result.sleepSkippedManual;
    workoutsSkippedManual += result.workoutsSkippedManual;
  }

  return NextResponse.json({
    ok: true,
    totalConnections: connections.length,
    usersSynced,
    sleepImported,
    workoutsImported,
    sleepSkippedManual,
    workoutsSkippedManual,
    failed,
  });
}
