import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ connected: false });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ connected: false });
  }

  const { data: connection } = await supabase
    .from("google_health_connections")
    .select("connected_at, last_synced_at, last_sync_error")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    connected: Boolean(connection),
    connectedAt: connection?.connected_at ?? null,
    lastSyncedAt: connection?.last_synced_at ?? null,
    lastSyncError: connection?.last_sync_error ?? null,
  });
}
