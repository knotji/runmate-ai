"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) { setError("ยังไม่ได้เชื่อมต่อระบบคลาวด์"); return; }
    setLoading(true);
    setError("");
    setDone("");

    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
      router.replace("/");
    } else {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
      setDone("สร้างบัญชีสำเร็จ — เข้าสู่ระบบได้เลย");
      setMode("signin");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f7f5] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-3xl">🏃</p>
          <h1 className="mt-2 text-xl font-bold text-[#17201d]">RunMate AI</h1>
          <p className="text-sm text-slate-500">โค้ชวิ่งส่วนตัว</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-[#17201d]">
            {mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
          </h2>

          <div className="space-y-3">
            <input
              type="email"
              required
              placeholder="อีเมล"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="control w-full"
              autoComplete="email"
            />
            <input
              type="password"
              required
              placeholder="รหัสผ่าน"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="control w-full"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {done && <p className="text-sm text-green-600">{done}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full py-3 disabled:opacity-50">
            {loading ? "กำลังดำเนินการ…" : mode === "signin" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
          </button>

          <button
            type="button"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setDone(""); }}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
          >
            {mode === "signin" ? "ยังไม่มีบัญชี? สร้างบัญชีใหม่" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
