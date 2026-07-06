"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import { ProfileHistoryAnalyzer } from "@/components/ProfileHistoryAnalyzer";
import { SamsungHealthImport } from "@/components/SamsungHealthImport";
import { CsvHistoryImporter } from "@/components/import/CsvHistoryImporter";
import { StrengthRoutineManager } from "@/components/StrengthRoutineManager";
import { GoalSetupSection } from "@/components/GoalSetupSection";
import { ReleaseNotesSection } from "@/components/settings/ReleaseNotesSection";
import { DevCoachContextPanel } from "@/components/settings/DevCoachContextPanel";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/types/profile";

type Tab = "profile" | "goals" | "data" | "account";

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
  const [historyImportMode, setHistoryImportMode] = useState<"samsung" | "sleep-csv" | "workout-csv" | null>("samsung");
  const [runnerProfile, setRunnerProfile] = useState<UserProfile | null>(null);
  const [envDebug, setEnvDebug] = useState<EnvDebug | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get("tab");
    const importParam = params.get("import");

    const timer = setTimeout(() => {
      if (tabParam === "data" || tabParam === "account" || tabParam === "profile" || tabParam === "goals") {
        setActiveTab((prev) => (prev !== tabParam ? (tabParam as Tab) : prev));
      }
      if (importParam) {
        let nextMode: typeof historyImportMode = "samsung";
        if (importParam === "sleep-csv") nextMode = "sleep-csv";
        else if (importParam === "workout-csv") nextMode = "workout-csv";
        else if (importParam === "samsung-health" || importParam === "samsung") nextMode = "samsung";
        setHistoryImportMode((prev) => (prev !== nextMode ? nextMode : prev));
      }
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  const [versionCopied, setVersionCopied] = useState(false);
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
      outcome: "accepted" | "dismissed";
      platform: string;
    }>;
    prompt(): Promise<void>;
  }

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other");
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const nav = window.navigator as unknown as { standalone?: boolean };
      const isStandaloneMode = window.matchMedia("(display-mode: standalone)").matches || !!nav.standalone;

      const ua = navigator.userAgent;
      const isIos = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
      const isAndroid = /Android/.test(ua);

      window.setTimeout(() => {
        setIsStandalone(!!isStandaloneMode);
        if (isIos) {
          setPlatform("ios");
        } else if (isAndroid) {
          setPlatform("android");
        } else {
          setPlatform("other");
        }
      }, 0);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const profileFormKey = runnerProfile?.updatedAt ?? runnerProfile?.id ?? "empty-profile";
  const buildMeta = getBuildMetadata();

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
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
      buildMeta.version === "dev" ? "RunMate AI" : `RunMate AI v${buildMeta.version}`,
      buildMeta.version === "dev" ? "Version: dev" : null,
      `Build: ${buildMeta.fullSha}`,
      `Environment: ${buildMeta.environment}`,
      buildMeta.hasBuildTime ? `Updated: ${buildMeta.rawBuildTime}` : "Updated: unknown",
    ].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setVersionCopied(true);
      window.setTimeout(() => setVersionCopied(false), 1800);
    } catch (error) {
      console.warn("[version-copy-error]", error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <AppShell title="ตั้งค่า" subtitle="จัดการโปรไฟล์ โค้ช และข้อมูลของแอป">
      <div className="mb-5 segmented-control">
        <TabButton active={activeTab === "profile"} onClick={() => setActiveTab("profile")}>โปรไฟล์</TabButton>
        <TabButton active={activeTab === "goals"} onClick={() => setActiveTab("goals")}>เป้าหมาย</TabButton>
        <TabButton active={activeTab === "data"} onClick={() => setActiveTab("data")}>ข้อมูล</TabButton>
        <TabButton active={activeTab === "account"} onClick={() => setActiveTab("account")}>บัญชี</TabButton>
      </div>

      {activeTab === "profile" && (
        <div className="space-y-4">
          <section className="card space-y-3 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">วิเคราะห์โปรไฟล์อัตโนมัติ</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">วิเคราะห์โปรไฟล์จากประวัติ</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-text)]">
                ระบบจะดู pace, HR, sleep, pain และ workout ที่บันทึกไว้ เพื่อแนะนำค่า easy pace / HR / recovery routine ที่ปลอดภัยและเหมาะกับคุณโดยเฉพาะ
              </p>
            </div>
            <ProfileHistoryAnalyzer onProfileUpdated={handleProfileUpdated} />
          </section>
          <ProfileSetupForm key={profileFormKey} profile={runnerProfile} onProfileSaved={handleProfileUpdated} />
          <StrengthRoutineManager />
        </div>
      )}

      {activeTab === "goals" && (
        <div className="space-y-4">
          <GoalSetupSection />
        </div>
      )}

      {activeTab === "data" && (
        <div className="space-y-4">
          <section className="card space-y-4 p-5" data-testid="history-import-card">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">นำเข้าข้อมูล</p>
              <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">นำเข้าประวัติ</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-text)]">
                รวมไฟล์จาก Samsung Health, Garmin, Apple Health หรือ CSV อื่น ๆ เพื่อเติมประวัติการนอนและการซ้อม
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3" data-testid="history-import-selector">
              <button
                type="button"
                onClick={() => setHistoryImportMode("samsung")}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  historyImportMode === "samsung"
                    ? "border-[var(--primary-strong)] bg-[var(--primary-soft)]/40"
                    : "border-[var(--border-warm)] bg-white/70 hover:bg-[var(--primary-soft)]/20"
                }`}
                data-testid="import-samsung-btn"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5 select-none">📱</span>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--foreground)]">Samsung Health ZIP</h3>
                    <p className="text-xs text-[var(--muted-text)] mt-1 leading-relaxed">นำเข้าไฟล์ .zip ที่ export จาก Samsung Health</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setHistoryImportMode("sleep-csv")}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  historyImportMode === "sleep-csv"
                    ? "border-[var(--primary-strong)] bg-[var(--primary-soft)]/40"
                    : "border-[var(--border-warm)] bg-white/70 hover:bg-[var(--primary-soft)]/20"
                }`}
                data-testid="import-sleep-csv-btn"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5 select-none">🌙</span>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--foreground)]">CSV การนอน</h3>
                    <p className="text-xs text-[var(--muted-text)] mt-1 leading-relaxed">นำเข้าไฟล์ .csv การนอน เช่น duration, score, HRV, resting HR</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setHistoryImportMode("workout-csv")}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  historyImportMode === "workout-csv"
                    ? "border-[var(--primary-strong)] bg-[var(--primary-soft)]/40"
                    : "border-[var(--border-warm)] bg-white/70 hover:bg-[var(--primary-soft)]/20"
                }`}
                data-testid="import-workout-csv-btn"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl mt-0.5 select-none">🏃</span>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--foreground)]">CSV การซ้อม</h3>
                    <p className="text-xs text-[var(--muted-text)] mt-1 leading-relaxed">นำเข้าไฟล์ .csv กิจกรรม เช่น ระยะ เวลา pace HR และ calories</p>
                  </div>
                </div>
              </button>
            </div>

            {historyImportMode === "samsung" && (
              <div className="mt-2 pt-4 border-t border-[var(--border-warm)]/50" data-testid="samsung-import-zone">
                <SamsungHealthImport />
              </div>
            )}

            {historyImportMode === "sleep-csv" && (
              <div className="mt-2 pt-4 border-t border-[var(--border-warm)]/50" data-testid="sleep-csv-import-zone">
                <CsvHistoryImporter type="sleep" />
              </div>
            )}

            {historyImportMode === "workout-csv" && (
              <div className="mt-2 pt-4 border-t border-[var(--border-warm)]/50" data-testid="workout-csv-import-zone">
                <CsvHistoryImporter type="workout" />
              </div>
            )}
          </section>

          {!isStandalone && (
            <section className="card space-y-4 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เพิ่ม RunMate ไว้หน้า Home</p>
                <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">เปิดจากมือถือเพื่อใช้เหมือนแอป</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-text)]">
                  เพิ่ม RunMate ไว้ที่หน้าจอโฮมเพื่อเข้าใช้งานได้ง่าย รวดเร็ว และทำงานแบบออฟไลน์ได้
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--surface-muted)] p-4 text-xs leading-relaxed text-[var(--muted-text)]">
                {platform === "ios" ? (
                  <div className="flex items-start gap-3">
                    <span className="text-base select-none">📲</span>
                    <div>
                      <p className="font-bold text-[var(--foreground)]">คำแนะนำสำหรับ iOS / Safari</p>
                      <p className="mt-1">กดปุ่ม Share (แชร์) แล้วเลือก &ldquo;Add to Home Screen&rdquo; (เพิ่มไปยังหน้าจอโฮม)</p>
                    </div>
                  </div>
                ) : platform === "android" ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-base select-none">📲</span>
                      <div>
                        <p className="font-bold text-[var(--foreground)]">คำแนะนำสำหรับ Android / Chrome</p>
                        <p className="mt-1">กดเมนู ⋮ แล้วเลือก &ldquo;Install app&rdquo; (ติดตั้งแอป) หรือ &ldquo;Add to Home screen&rdquo; (เพิ่มไปยังหน้าจอโฮม)</p>
                      </div>
                    </div>
                    {deferredPrompt && (
                      <button
                        type="button"
                        onClick={handleInstallClick}
                        className="btn-primary w-full py-2.5 text-xs font-bold text-center cursor-pointer"
                      >
                        ติดตั้งแอป
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className="text-base select-none">📲</span>
                    <div>
                      <p className="font-bold text-[var(--foreground)]">วิธีติดตั้งไว้หน้า Home</p>
                      <p className="mt-1">เปิดแอปบนบราวเซอร์มือถือของคุณ แล้วเลือกตัวเลือก &ldquo;เพิ่มลงในหน้าจอหลัก&rdquo; (Add to Home Screen)</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {isStandalone && (
            <section className="card p-5">
              <div className="flex items-center gap-3">
                <span className="text-lg">✅</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">ติดตั้ง RunMate เรียบร้อยแล้ว</h3>
                  <p className="text-xs text-slate-500 mt-0.5">คุณกำลังใช้งานผ่านแอปหน้าจอหลักโดยตรง</p>
                </div>
              </div>
            </section>
          )}

          <section className="card p-4">
            <details className="group cursor-pointer text-xs">
              <summary className="list-none flex items-center justify-between font-bold text-[var(--foreground)]">
                <div className="flex flex-col gap-0.5">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[var(--label-color)]">ข้อมูลและความเป็นส่วนตัว</p>
                  <p className="text-sm">ดูสรุปความโปร่งใสและการเก็บรักษาข้อมูล</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--primary)] font-bold shrink-0">
                  <span className="group-open:hidden">แสดง</span>
                  <span className="hidden group-open:inline">ซ่อน</span>
                  <span className="transition-transform group-open:rotate-180">▾</span>
                </div>
              </summary>
              <div className="mt-4 divide-y divide-slate-100/70 border-t border-slate-100 pt-3 cursor-default">
                <PrivacyItem icon="🗂️" title="Report คือข้อมูลหลัก" desc="ข้อมูลที่กดบันทึกจาก Upload จะเข้า Report และถูกใช้เป็นบริบทให้โค้ชตอบได้แม่นขึ้น" />
                <PrivacyItem icon="💬" title="แชทกับโค้ชเป็นชั่วคราว" desc="ข้อความในแชทจะไม่ถูกเพิ่มเข้า Report อัตโนมัติ เว้นแต่คุณบันทึกผ่าน Upload/Report" />
                <PrivacyItem icon="📎" title="ไฟล์อัปโหลดไม่ถูกเก็บเป็นต้นฉบับ" desc="ระบบใช้รูปหรือ PDF เพื่อวิเคราะห์เท่านั้น และบันทึกเฉพาะผลสรุปที่คุณกดยืนยัน" />
                <PrivacyItem icon="🩺" title="ผลตรวจสุขภาพ" desc="Health Check จะบันทึกเฉพาะค่าที่สรุปแล้ว ไม่บันทึกไฟล์ PDF ต้นฉบับหรือข้อความดิบ" />
                <PrivacyItem icon="🗑️" title="ลบข้อมูลได้" desc="คุณสามารถลบรายการที่บันทึกไว้จากหน้า Report ได้" />
                <PrivacyItem icon="⚕️" title="คำแนะนำไม่ใช่การวินิจฉัย" desc="คำแนะนำเป็นแนวทางทั่วไปจากข้อมูลที่บันทึกไว้ ไม่ใช่คำแนะนำทางการแพทย์ หากกังวลเรื่องสุขภาพควรปรึกษาแพทย์" />
              </div>
            </details>
          </section>

          {process.env.NODE_ENV === "development" && (
            <>
              <section className="card p-5 space-y-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">Deployment Debug</p>
                  <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">ตรวจ Supabase Runtime</h2>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    ใช้เช็คว่า Vercel อ่าน env ถูกชุดไหม โดยไม่แสดงค่า secret
                  </p>
                </div>
                <div className="space-y-2 rounded-2xl bg-[var(--surface-muted)] p-4 text-xs">
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
              <DevCoachContextPanel />
            </>
          )}
        </div>
      )}

      {activeTab === "account" && (
        <div className="space-y-4">
          <button type="button" onClick={logout} className="btn-danger-soft w-full px-6 py-3 text-center text-sm">
            ออกจากระบบ
          </button>
        </div>
      )}

      <ReleaseNotesSection />

      <section className="soft-panel mt-3 px-4 py-3 text-xs text-[var(--muted-text)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เกี่ยวกับแอป</p>
            <p className="mt-1 font-semibold text-[var(--foreground)]">
              {buildMeta.version === "dev" ? "RunMate AI" : `RunMate AI v${buildMeta.version}`}
            </p>
            {buildMeta.version === "dev" && <p className="mt-0.5">Version dev</p>}
            <p className="mt-0.5">
              Build {buildMeta.shortSha} · {buildMeta.environment}
            </p>
            {buildMeta.hasBuildTime && <p className="mt-0.5">Updated {buildMeta.displayBuildTime}</p>}
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
  hasBuildTime: boolean;
  environment: string;
};

function getBuildMetadata(): BuildMetadata {
  const version = cleanMeta(process.env.NEXT_PUBLIC_APP_VERSION) || "dev";
  const fullSha = cleanMeta(process.env.NEXT_PUBLIC_GIT_SHA) || "local";
  const deployEnv = cleanMeta(process.env.NEXT_PUBLIC_DEPLOY_ENV) || "local";
  const rawBuildTime = cleanMeta(process.env.NEXT_PUBLIC_BUILD_TIME);
  const hasBuildTime = Boolean(rawBuildTime && rawBuildTime !== "local" && rawBuildTime !== "-");
  return {
    version,
    fullSha,
    shortSha: fullSha === "local" ? "local" : fullSha.slice(0, 7),
    rawBuildTime: rawBuildTime || "unknown",
    displayBuildTime: formatBuildTime(rawBuildTime),
    hasBuildTime,
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

function PrivacyItem({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className="shrink-0 text-lg leading-none select-none">{icon}</span>
      <div className="space-y-0.5">
        <h4 className="text-sm font-bold text-[var(--foreground)]">{title}</h4>
        <p className="text-xs leading-5 text-slate-500">{desc}</p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`flex-1 rounded-xl py-2 text-center text-xs font-bold transition-all ${
        active
          ? "bg-[var(--primary-soft)] text-[var(--primary-strong)] shadow-sm"
          : "text-[var(--muted-text)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
