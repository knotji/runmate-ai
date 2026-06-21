"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import { ProfileHistoryAnalyzer } from "@/components/ProfileHistoryAnalyzer";
import { SamsungHealthImport } from "@/components/SamsungHealthImport";
import { StrengthRoutineManager } from "@/components/StrengthRoutineManager";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/types/profile";

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
  const [runnerProfile, setRunnerProfile] = useState<UserProfile | null>(null);
  const [envDebug, setEnvDebug] = useState<EnvDebug | null>(null);
  const [versionCopied, setVersionCopied] = useState(false);
  const profileFormKey = runnerProfile?.updatedAt ?? runnerProfile?.id ?? "empty-profile";
  const buildMeta = getBuildMetadata();

  useEffect(() => {
    fetch("/api/debug/env")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: EnvDebug | null) => setEnvDebug(data))
      .catch((error) => {
        console.warn("[env-debug-error]", error instanceof Error ? error.message : String(error));
      });
  }, []);

  useEffect(() => {
    loadProfileFromSupabase().then((result) => {
      if (result.ok && result.profile) {
        console.info("[profile-refresh]", {
          event: "settings-profile-loaded",
          updatedAt: result.profile.updatedAt ?? null,
        });
        setRunnerProfile(result.profile);
      }
    });
  }, []);

  function handleProfileUpdated(profile: UserProfile) {
    console.info("[profile-refresh]", {
      event: "onProfileUpdated called",
      updatedAt: profile.updatedAt ?? null,
    });
    setRunnerProfile(profile);
  }

  async function logout() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  async function copyBuildInfo() {
    const text = [
      `RunMate AI v${buildMeta.version}`,
      `Build: ${buildMeta.fullSha}`,
      `Environment: ${buildMeta.environment}`,
      `Updated: ${buildMeta.rawBuildTime}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setVersionCopied(true);
      window.setTimeout(() => setVersionCopied(false), 1800);
    } catch (error) {
      console.warn("[version-copy-error]", error instanceof Error ? error.message : String(error));
    }
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
            <ProfileHistoryAnalyzer onProfileUpdated={handleProfileUpdated} />
          </section>
          <ProfileSetupForm key={profileFormKey} profile={runnerProfile} onProfileSaved={handleProfileUpdated} />
          <StrengthRoutineManager />
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

          {process.env.NODE_ENV === "development" && (
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
          )}
        </div>
      )}

      {activeTab === "account" && (
        <div className="space-y-4">
          <button type="button" onClick={logout} className="w-full rounded-full bg-[#fff0ee] px-6 py-3 text-center text-sm font-bold text-[var(--status-rest)] transition-colors hover:bg-[#ffe5e1]">
            ออกจากระบบ
          </button>
        </div>
      )}

      <section className="mt-5 rounded-3xl border border-[var(--border-warm)] bg-white/45 px-4 py-3 text-xs text-[var(--muted-text)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">เกี่ยวกับแอป</p>
            <p className="mt-1 font-semibold text-[var(--foreground)]">RunMate AI v{buildMeta.version}</p>
            <p className="mt-0.5">
              Build {buildMeta.shortSha} · {buildMeta.environment}
            </p>
            <p className="mt-0.5">Updated {buildMeta.displayBuildTime}</p>
          </div>
          <button
            type="button"
            onClick={() => void copyBuildInfo()}
            className="shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--muted-text)] hover:bg-[var(--primary-soft)]"
          >
            {versionCopied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </div>
      </section>
    </AppShell>
  );
}

type BuildMetadata = {
  version: string;
  fullSha: string;
  shortSha: string;
  rawBuildTime: string;
  displayBuildTime: string;
  environment: string;
};

function getBuildMetadata(): BuildMetadata {
  const version = cleanMeta(process.env.NEXT_PUBLIC_APP_VERSION) || "dev";
  const fullSha = cleanMeta(process.env.NEXT_PUBLIC_GIT_SHA) || "local";
  const deployEnv = cleanMeta(process.env.NEXT_PUBLIC_DEPLOY_ENV) || "local";
  const rawBuildTime = cleanMeta(process.env.NEXT_PUBLIC_BUILD_TIME) || "-";
  return {
    version,
    fullSha,
    shortSha: fullSha === "local" ? "local" : fullSha.slice(0, 7),
    rawBuildTime,
    displayBuildTime: formatBuildTime(rawBuildTime),
    environment: formatDeployEnv(deployEnv),
  };
}

function cleanMeta(value: string | undefined): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function formatDeployEnv(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "production") return "Production";
  if (normalized === "preview") return "Preview";
  if (normalized === "development") return "Development";
  if (normalized === "local") return "Local";
  return value || "Local";
}

function formatBuildTime(value: string): string {
  if (!value || value === "-" || value === "local") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("th-TH-u-ca-gregory", {
      timeZone: "Asia/Bangkok",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return value;
  }
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`flex-1 rounded-xl py-2 text-center text-xs font-bold transition-all ${
        active
          ? "bg-[var(--primary)] text-white shadow-sm"
          : "text-[var(--muted-text)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
