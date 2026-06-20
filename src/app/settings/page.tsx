"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";
import { ProfileHistoryAnalyzer } from "@/components/ProfileHistoryAnalyzer";
import { SamsungHealthImport } from "@/components/SamsungHealthImport";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { createClient } from "@/lib/supabase/client";
import { pullAndMergeHistory } from "@/lib/historySync";
import { loadProfileFromSupabase } from "@/lib/profileStorage";

const RUNMATE_KEYS = [
  "runmate.profile",
  "runmate.raceGoal",
  "runmate.racePlan",
  "runmate.latestSleep",
  "runmate.latestMeal",
  "runmate.latestWorkout",
  "runmate.latestBody",
  "runmate.dailySummary",
  "runmate.history.sleep",
  "runmate.history.meal",
  "runmate.history.workout",
  "runmate.history.body",
  "runmate.history.summary",
  "runmate.chatHistory",
  "runmate.importHistory",
  "runmate.lastSyncedAt",
  "runmate.lastSyncStatus",
];

type Tab = "profile" | "sync" | "account";

type ImportLog = {
  id: string;
  date: string;
  sleep: number;
  workout: number;
  body: number;
};

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
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState(false);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  const [lastSyncedStr, setLastSyncedStr] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [envDebug, setEnvDebug] = useState<EnvDebug | null>(null);

  // Import history state
  const [importHistory, setImportHistory] = useState<ImportLog[]>([]);

  function loadImportHistory() {
    try {
      const raw = localStorage.getItem("runmate.importHistory");
      if (raw) {
        setImportHistory(JSON.parse(raw) as ImportLog[]);
      } else {
        setImportHistory([]);
      }
    } catch {
      setImportHistory([]);
    }
  }

  useEffect(() => {
    // Load sync status and import history from localStorage on mount
    const savedTime = localStorage.getItem("runmate.lastSyncedAt");
    const savedStatus = localStorage.getItem("runmate.lastSyncStatus");

    queueMicrotask(() => {
      if (savedTime) setLastSyncedStr(savedTime);
      if (savedStatus === "success" || savedStatus === "error" || savedStatus === "syncing" || savedStatus === "idle") {
        setSyncStatus(savedStatus);
      }
      loadImportHistory();
    });

    const onDataUpdated = () => {
      loadImportHistory();
    };
    window.addEventListener("runmate:data-updated", onDataUpdated);
    return () => window.removeEventListener("runmate:data-updated", onDataUpdated);
  }, []);

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

  function clearAll() {
    for (const key of RUNMATE_KEYS) {
      localStorage.removeItem(key);
    }
    invalidateCoachCache({ clearChat: true });
    setConfirmed(false);
    setDone(true);
    setImportHistory([]);
    setLastSyncedStr(null);
    setSyncStatus("idle");
  }

  async function triggerSync() {
    setSyncStatus("syncing");
    setSyncError(null);
    localStorage.setItem("runmate.lastSyncStatus", "syncing");
    try {
      // Pull history from database
      const histRes = await pullAndMergeHistory();
      if (!histRes.ok) {
        throw new Error(histRes.error || "history sync failed");
      }

      // Load profile from database
      const profRes = await loadProfileFromSupabase();
      if (!profRes.ok && profRes.reason !== "missing-env" && profRes.reason !== "not-authenticated") {
        throw new Error("message" in profRes ? profRes.message : "profile sync failed");
      }
      if (!profRes.ok) {
        throw new Error("message" in profRes ? profRes.message : profRes.reason);
      }

      const nowStr = new Date().toLocaleString("th-TH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      setSyncStatus("success");
      setLastSyncedStr(nowStr);
      localStorage.setItem("runmate.lastSyncedAt", nowStr);
      localStorage.setItem("runmate.lastSyncStatus", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync failed";
      console.error("[supabase-sync-error]", { operation: "manual-sync", message });
      setSyncStatus("error");
      setSyncError(message);
      localStorage.setItem("runmate.lastSyncStatus", "error");
    }
  }

  function formatThaiDate(isoStr: string) {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("th-TH", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  }

  return (
    <AppShell title="Settings" subtitle="จัดการโปรไฟล์และข้อมูลการซ้อมของคุณ">
      {/* ── Tabs navigation ── */}
      <div className="flex border-b border-slate-100 mb-5 bg-white/40 rounded-2xl p-1 gap-1">
        <button
          type="button"
          className={`flex-1 py-2 text-xs font-bold text-center rounded-xl transition-all ${
            activeTab === "profile"
              ? "bg-[#17201d] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
          onClick={() => setActiveTab("profile")}
        >
          โปรไฟล์
        </button>
        <button
          type="button"
          className={`flex-1 py-2 text-xs font-bold text-center rounded-xl transition-all ${
            activeTab === "sync"
              ? "bg-[#17201d] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
          onClick={() => setActiveTab("sync")}
        >
          ซิงก์ข้อมูล
        </button>
        <button
          type="button"
          className={`flex-1 py-2 text-xs font-bold text-center rounded-xl transition-all ${
            activeTab === "account"
              ? "bg-[#17201d] text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
          }`}
          onClick={() => setActiveTab("account")}
        >
          บัญชี
        </button>
      </div>

      {/* ── Tab: Profile ── */}
      {activeTab === "profile" && (
        <div className="space-y-4">
          <section className="card space-y-3 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">AI Analysis</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">วิเคราะห์โปรไฟล์จากประวัติ</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                ให้ AI อ่านประวัติการซ้อมและการนอน 90 วันล่าสุด แล้วแนะนำค่าโปรไฟล์ที่เหมาะกับคุณ
              </p>
            </div>
            <ProfileHistoryAnalyzer />
          </section>

          <ProfileSetupForm />
        </div>
      )}

      {/* ── Tab: Data Sync ── */}
      {activeTab === "sync" && (
        <div className="space-y-4">
          {/* Sync Status Widget */}
          <section className="card p-5 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Sync Status</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">สถานะการซิงก์ข้อมูล</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 font-normal">
                ซิงก์ข้อมูลประวัติการซ้อมและโปรไฟล์ของคุณกับระบบคลาวด์เพื่อป้องกันข้อมูลสูญหาย
              </p>
              <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs leading-5 text-amber-700">
                ข้อมูลที่บันทึกบน localhost จะไม่ย้ายมาบนเว็บ Vercel อัตโนมัติ หากยังไม่ได้ซิงก์ขึ้นระบบ
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 flex items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-xs text-slate-400">สถานะปัจจุบัน</p>
                <p className="text-sm font-bold text-[#17201d]">
                  {syncStatus === "syncing" && "กำลังซิงก์..."}
                  {syncStatus === "success" && (lastSyncedStr ? `ซิงก์ล่าสุดเมื่อ ${lastSyncedStr}` : "ซิงก์ล่าสุดแล้ว")}
                  {syncStatus === "error" && "ซิงก์ไม่สำเร็จ"}
                  {syncStatus === "idle" && "บันทึกในเครื่องแล้ว"}
                </p>
                {lastSyncedStr && (
                  <p className="text-[10px] text-slate-400">
                    ซิงก์ล่าสุดเมื่อ {lastSyncedStr}
                  </p>
                )}
                {syncError && <p className="text-[10px] font-semibold text-red-500">{syncError}</p>}
              </div>
              <button
                type="button"
                disabled={syncStatus === "syncing"}
                onClick={triggerSync}
                className="rounded-full bg-[#17201d] text-white hover:bg-slate-800 disabled:opacity-40 transition-colors px-4 py-2 text-xs font-bold shrink-0 flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-3 w-3 ${syncStatus === "syncing" ? "animate-spin" : ""}`}
                >
                  <path
                    fillRule="evenodd"
                    d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                    clipRule="evenodd"
                  />
                </svg>
                ซิงก์ข้อมูลตอนนี้
              </button>
            </div>
          </section>

          <section className="card p-5 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Deployment Debug</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">ตรวจ Supabase Runtime</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 font-normal">
                ใช้เช็คว่า localhost และ Vercel อ่าน env ถูกชุดไหม โดยไม่แสดงค่า secret
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

          {/* Samsung Health Importer */}
          <section className="card space-y-3 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Data Import</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">นำเข้า Samsung Health</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 font-normal">
                Export ข้อมูลจาก Samsung Health app → My data → Export data → ZIP แล้วอัปโหลดที่นี่เพื่อดึง sleep, workout และ body composition เข้าประวัติซ้อม
              </p>
            </div>
            <SamsungHealthImport />
          </section>

          {/* Import History */}
          <section className="card p-5 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Import History</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">ประวัติการนำเข้าไฟล์</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500 font-normal">
                ประวัติรายการไฟล์ที่คุณเคยนำเข้าข้อมูลเข้าระบบ
              </p>
            </div>
            {importHistory.length === 0 ? (
              <p className="text-xs text-slate-400 py-2 text-center">ยังไม่มีประวัติการนำเข้าข้อมูล</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {importHistory.map((log) => (
                  <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 text-xs flex justify-between items-center gap-3">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-700">นำเข้าไฟล์ ZIP สำเร็จ</p>
                      <p className="text-[10px] text-slate-400">{formatThaiDate(log.date)}</p>
                    </div>
                    <div className="text-right text-[10px] text-slate-500 space-y-0.5 font-medium">
                      <p>นอน {log.sleep} คืน</p>
                      <p>ออกกำลังกาย {log.workout} ครั้ง</p>
                      <p>น้ำหนัก {log.body} รายการ</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Tab: Account ── */}
      {activeTab === "account" && (
        <div className="space-y-4">
          <section className="card space-y-3 p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-red-400">Danger Zone</p>
              <h2 className="mt-1 text-xl font-bold text-[#17201d]">ล้างข้อมูลในเครื่อง</h2>
            </div>
            <p className="text-sm leading-6 text-slate-500 font-normal">
              ลบ profile, race goal, cache, history และบันทึกทั้งหมดออกจาก browser เครื่องนี้
            </p>

            {done ? (
              <p className="rounded-2xl bg-green-50 p-3 text-sm font-bold text-green-600">ล้างข้อมูลเรียบร้อยแล้ว</p>
            ) : confirmed ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-full bg-red-500 py-3 text-sm font-bold text-white"
                  onClick={clearAll}
                >
                  ยืนยัน ลบทั้งหมด
                </button>
                <button
                  type="button"
                  className="flex-1 btn-secondary text-sm"
                  onClick={() => setConfirmed(false)}
                >
                  ยกเลิก
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full rounded-full border border-red-300 py-3 text-sm font-bold text-red-500"
                onClick={() => setConfirmed(true)}
              >
                Clear Local Data
              </button>
            )}
          </section>

          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={logout}
              className="text-sm font-bold text-red-500 hover:text-red-700 bg-red-50 px-6 py-3 rounded-full transition-colors w-full text-center"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
