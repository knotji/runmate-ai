"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import { ProfileHistoryAnalyzer } from "@/components/ProfileHistoryAnalyzer";
import { SamsungHealthImport } from "@/components/SamsungHealthImport";
import { createClient } from "@/lib/supabase/client";

type Tab = "profile" | "data" | "account";

type EnvDebug = {
  runtime: {
    nodeEnv: string;
    vercel: boolean;
    vercelEnv: string | null;
  };
  env: Record<string, { exists: boolean; value?: string | null }>;
};

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [envDebug, setEnvDebug] = useState<EnvDebug | null>(null);

  useEffect(() => {
    fetch("/api/debug/env")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EnvDebug | null) => setEnvDebug(data))
      .catch((error) => {
        console.warn("[env-debug-error]", error instanceof Error ? error.message : String(error));
      });
  }, []);

  async function logout() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AppShell title="Settings" subtitle="จัดการโปรไฟล์และข้อมูลการซ้อมของคุณ">
      <div className="mb-5 flex gap-1 rounded-2xl border-b border-slate-100 bg-white/40 p-1">
        <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")}>โปรไฟล์</TabButton>
        <TabButton active={activeTab === "data"} onClick={() => setActiveTab("data")}>ข้อมูล</TabButton>
        <TabButton active={activeTab === "account"} onClick={() => setActiveTab("account")}>บัญชี</TabButton>
      </div>

      {activeTab === "profile" && (
        <div className="space-y-4">
          <section className="card space-y-3 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">AI Analysis</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">วิเคราะห์โปรไฟล์จากประวัติ</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                ให้ AI อ่านประวัติการซ้อมและการนอนจาก Supabase แล้วแนะนำค่าโปรไฟล์ที่เหมาะกับคุณ
              </p>
            </div>
            <ProfileHistoryAnalyzer />
          </section>
          <ProfileSetupForm />
        </div>
      )}

      {activeTab === "data" && (
        <div className="space-y-4">
          <section className="card space-y-3 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Data Import</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">นำเข้า Samsung Health</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                อัปโหลดไฟล์ ZIP เพื่อบันทึก sleep, workout และ body composition เข้า Supabase
              </p>
            </div>
            <SamsungHealthImport />
          </section>

          <section className="card p-5 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Deployment Debug</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">ตรวจ Supabase Runtime</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                ใช้เช็คว่า Vercel อ่าน env ถูกชุดไหม โดยไม่แสดงค่า secret
              </p>
            </div>
            <div className="space-y-2 rounded-2xl bg-slate-50 p-4 text-xs">
              <p className="font-semibold text-slate-600">
                Runtime: {envDebug?.runtime.vercel ? `Vercel (${envDebug.runtime.vercelEnv ?? "unknown"})` : "Local browser"}
              </p>
              {envDebug ? (
                <div className="space-y-1 text-slate-500">
                  {Object.entries(envDebug.env).map(([name, info]) => (
                    <div key={name} className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px]">{name}</span>
                      <span className={info.exists ? "font-bold text-green-600" : "font-bold text-red-500"}>
                        {info.exists ? "มีค่า" : "ไม่มีค่า"}
                      </span>
                    </div>
                  ))}
                  {envDebug.env.NEXT_PUBLIC_SUPABASE_URL?.value && (
                    <p className="break-all pt-2 font-mono text-[10px] text-slate-400">
                      Supabase URL (dev): {envDebug.env.NEXT_PUBLIC_SUPABASE_URL.value}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-slate-400">กำลังตรวจ env...</p>
              )}
            </div>
          </section>
        </div>
      )}

      {activeTab === "account" && (
        <div className="space-y-4">
          <button type="button" onClick={logout} className="w-full rounded-full bg-red-50 px-6 py-3 text-center text-sm font-bold text-red-500 transition-colors hover:text-red-700">
            ออกจากระบบ
          </button>
        </div>
      )}
    </AppShell>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`flex-1 rounded-xl py-2 text-center text-xs font-bold transition-all ${
        active ? "bg-[#17201d] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
