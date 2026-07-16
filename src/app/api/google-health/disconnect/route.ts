import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeGoogleHealthToken } from "@/lib/googleHealth/oauth";

export async function POST() {
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "ยังไม่ได้เชื่อมต่อระบบคลาวด์" }, { status: 500 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "กรุณาเข้าสู่ระบบก่อน" }, { status: 401 });
  }

  const { data: connection } = await supabase
    .from("google_health_connections")
    .select("access_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connection?.access_token) {
    await revokeGoogleHealthToken(connection.access_token);
  }

  const { error } = await supabase.from("google_health_connections").delete().eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "ยกเลิกการเชื่อมต่อไม่สำเร็จ" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
