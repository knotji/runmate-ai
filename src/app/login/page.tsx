"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const GOOGLE_SIGNIN_ERROR = "เข้าสู่ระบบด้วย Google ไม่สำเร็จ ลองใหม่อีกครั้ง";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");

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

  async function signInWithGoogle() {
    setGoogleError("");
    setGoogleLoading(true);

    const supabase = createClient();
    if (!supabase) {
      setGoogleError(GOOGLE_SIGNIN_ERROR);
      setGoogleLoading(false);
      return;
    }

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      if (process.env.NODE_ENV !== "production") {
        console.debug("[google-auth] redirectTo", redirectTo);
      }

      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });

      if (err) {
        setGoogleError(GOOGLE_SIGNIN_ERROR);
        setGoogleLoading(false);
      }
    } catch {
      setGoogleError(GOOGLE_SIGNIN_ERROR);
      setGoogleLoading(false);
    }
  }

  const anyLoading = loading || googleLoading;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f4f7f5] px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-3xl">🏃</p>
          <h1 className="mt-2 text-xl font-bold text-[var(--foreground)]">RunMate AI</h1>
          <p className="text-sm text-slate-500">โค้ชวิ่งส่วนตัว</p>
        </div>

        <div className="card space-y-3 p-6">
          <button
            type="button"
            data-testid="google-signin-btn"
            onClick={signInWithGoogle}
            disabled={anyLoading}
            className="btn-secondary flex w-full items-center justify-center gap-2 py-3 disabled:opacity-50"
          >
            {!googleLoading && (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 6.294C4.672 4.168 6.656 3.58 9 3.58Z"/>
              </svg>
            )}
            <span>{googleLoading ? "กำลังไปที่ Google..." : "เข้าสู่ระบบด้วย Google"}</span>
          </button>
          {googleError && (
            <p className="text-sm text-red-500" data-testid="google-signin-error">{googleError}</p>
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          <div className="h-px flex-1 bg-[var(--border-warm)]" />
          <span className="text-[11px] text-[var(--color-text-muted)]">หรือใช้อีเมล</span>
          <div className="h-px flex-1 bg-[var(--border-warm)]" />
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <h2 className="text-base font-bold text-[var(--foreground)]">
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

          <button type="submit" disabled={anyLoading} className="btn-primary w-full py-3 disabled:opacity-50">
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
