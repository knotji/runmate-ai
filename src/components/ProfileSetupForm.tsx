"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingButton } from "@/components/LoadingButton";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import {
  loadProfileFromSupabase,
  saveProfileToSupabase,
} from "@/lib/profileStorage";
import { defaultProfile, type UserProfile } from "@/types/profile";
import { calculateAgeFromBirthDate } from "@/lib/profile/age";
import { calculateNutritionTargetsFromWeight, suggestedProteinTargetG } from "@/lib/nutritionTargets";
import { formatBpm } from "@/lib/format";
import { validateHrValues, hasBlockingHrErrors } from "@/lib/hrValidation";
import { getCoachStylePreview } from "@/lib/coachStylePreview";
import { todayBangkokDateKey } from "@/lib/date";
import { SignalDot } from "@/components/ui/SignalPill";

type Status = { tone: "idle" | "good" | "warn" | "bad"; text: string };

const SECTION_KEYS: Record<string, (keyof UserProfile)[]> = {
  basic: ["displayName", "birthDate"],
  goal: ["mainGoal", "targetDistance", "goalPriority"],
  baseline: ["currentLevel", "currentLongestRunKm", "weeklyMileageKm", "runningDaysPerWeek", "weeklyTrainingDays", "easyPace", "easyHrCap", "maxHr", "hrZoneMethod", "aerobicThresholdHr", "anaerobicThresholdHr"],
  training: ["preferredLongRunDay", "strengthTrainingDaysPerWeek", "preferredRunTime", "preferredTrainingDays", "availableTrainingDays"],
  injury: ["injuryHistory", "injuryNotes", "currentPainNotes", "riskNotes"],
  sleep: ["averageSleepHours", "normalSleepScore", "normalEnergyScore", "normalRestingHr", "normalHrv", "recoveryRules", "sleepNotes"],
  food: ["foodPreferences", "allergiesOrRestrictions"],
  coaching: ["coachingTone", "responseDetail", "language"],
  advanced: [
    "heightCm", "weightKg", "workSchedule", "timezone",
    "lactateThresholdHr", "vo2max", "averageCadence",
    "availableEquipment", "nutritionGoal", "proteinTargetG", "carbTargetRestDayG", "carbTargetEasyDayG", "carbTargetHardDayG",
    "caffeineHabit", "supplementNotes"
  ],
};

const TODAY = todayBangkokDateKey();
const IS_DEV = process.env.NODE_ENV === "development";

const HR_ZONE_METHOD_LABELS: Record<string, string> = {
  auto: "อัตโนมัติ",
  hrr: "Heart Rate Reserve",
  at_ant: "AT/AnT HR",
  max_hr: "Max HR",
  manual: "ตั้งเอง",
};

const HR_ZONE_METHOD_HELP: Record<string, string> = {
  auto: "ใช้ข้อมูลที่มีอยู่เลือกวิธีคำนวณที่แม่นที่สุดให้อัตโนมัติ",
  hrr: "ใช้ Max HR และ Resting HR เฉลี่ย เพื่อคำนวณโซนหัวใจแบบส่วนตัว",
  at_ant: "เหมาะถ้า Samsung Health มีค่า AT/AnT เช่น AT 146, AnT 172",
  max_hr: "ใช้เมื่อไม่มีข้อมูลอื่น อาจไม่แม่นเท่า HRR หรือ AT/AnT",
  manual: "กำหนด Easy HR cap เอง เช่น 145 bpm",
};

function getEasyHrNumber(val: string | undefined | null): number | null {
  if (!val) return null;
  const matches = String(val).match(/\d+/g);
  if (!matches || matches.length === 0) return null;
  const num = Number(matches[matches.length - 1]);
  return Number.isFinite(num) ? num : null;
}

export type FoodPreferencesJSON = {
  avoids?: string;
  likes?: string;
  spicy?: string;
  convenience?: string[];
  budget?: string;
  goals?: string[];
};

export function parseFoodPreferences(raw: string | undefined | null): FoodPreferencesJSON {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as FoodPreferencesJSON;
    }
  } catch {
    return { likes: raw };
  }
  return {};
}

export function ProfileSetupForm({
  profile: externalProfile,
  onProfileSaved,
  redirectOnSave = false,
  mode = "full",
}: {
  profile?: UserProfile | null;
  onProfileSaved?: (profile: UserProfile) => void;
  redirectOnSave?: boolean;
  mode?: "onboarding" | "full";
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile>(() => {
    if (externalProfile) {
      console.info("[profile-refresh]", {
        event: "ProfileSetupForm received new profile",
        updatedAt: externalProfile.updatedAt ?? null,
      });
    }
    return { ...defaultProfile, ...(externalProfile ?? {}) };
  });
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "" });
  const [saving, setSaving] = useState(false);
  const [loadingCloud, setLoadingCloud] = useState(mode === "full" && externalProfile === undefined);
  const [openSection, setOpenSection] = useState<string | null>("goal");
  const [birthDateError, setBirthDateError] = useState("");
  const [devOpen, setDevOpen] = useState(false);
  const [devStatus, setDevStatus] = useState("");


  // Generalized section-by-section editing state
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<UserProfile | null>(null);
  const [savedSections, setSavedSections] = useState<Record<string, boolean>>({});

  const hrValidationIssues = validateHrValues({
    restingHr: profile.normalRestingHr,
    maxHr: profile.maxHr,
    ltHr: profile.lactateThresholdHr,
    easyHrCap: profile.easyHrCap,
    aerobicThresholdHr: profile.aerobicThresholdHr,
    anaerobicThresholdHr: profile.anaerobicThresholdHr,
  });

  const renderFieldIssues = (fieldName: "restingHr" | "maxHr" | "ltHr" | "easyHrCap" | "aerobicThresholdHr" | "anaerobicThresholdHr") => {
    const issues = hrValidationIssues.filter((issue) => issue.field === fieldName);
    if (issues.length === 0) return null;
    return (
      <div className="mt-1 space-y-0.5">
        {issues.map((issue, idx) => (
          <p
            key={idx}
            className={`text-xs font-semibold ${
              issue.severity === "error" ? "text-red-500" : "text-amber-500"
            }`}
          >
            {issue.severity === "error" ? "🛑 " : "⚠️ "} {issue.message}
          </p>
        ))}
      </div>
    );
  };

  function startSectionEdit(section: string) {
    setSnapshot({ ...profile });
    setEditingSection(section);
    setSavedSections((prev) => ({ ...prev, [section]: false }));
  }

  function cancelSectionEdit() {
    if (snapshot) {
      setProfile(snapshot);
    }
    setEditingSection(null);
    setSnapshot(null);
  }

  function saveSectionEdit(section: string) {
    const errors = validateHrValues({
      restingHr: profile.normalRestingHr,
      maxHr: profile.maxHr,
      ltHr: profile.lactateThresholdHr,
      easyHrCap: profile.easyHrCap,
      aerobicThresholdHr: profile.aerobicThresholdHr,
      anaerobicThresholdHr: profile.anaerobicThresholdHr,
    }).filter((issue) => issue.severity === "error");

    const sectionFields = SECTION_KEYS[section] || [];
    const hasSectionError = errors.some((err) => {
      if (err.field === "restingHr" && sectionFields.includes("normalRestingHr")) return true;
      if (err.field === "maxHr" && sectionFields.includes("maxHr")) return true;
      if (err.field === "ltHr" && sectionFields.includes("lactateThresholdHr")) return true;
      if (err.field === "easyHrCap" && sectionFields.includes("easyHrCap")) return true;
      if (err.field === "aerobicThresholdHr" && sectionFields.includes("aerobicThresholdHr")) return true;
      if (err.field === "anaerobicThresholdHr" && sectionFields.includes("anaerobicThresholdHr")) return true;
      return false;
    });

    if (hasSectionError) {
      alert("กรุณากรอกข้อมูลอัตราการเต้นของหัวใจให้ถูกต้องและไม่มีข้อผิดพลาดก่อนบันทึก");
      return;
    }

    if (snapshot) {
      const keys = SECTION_KEYS[section];
      if (keys) {
        const changedKeys: string[] = [];
        for (const key of keys) {
          if (snapshot[key] !== profile[key]) {
            changedKeys.push(key);
          }
        }
        if (changedKeys.length > 0) {
          const newSources = { ...profile.fieldSources };
          for (const key of changedKeys) {
            newSources[key] = "manual";
          }
          setProfile((p) => ({ ...p, fieldSources: newSources }));
        }
      }
    }
    setEditingSection(null);
    setSnapshot(null);
    setSavedSections((prev) => ({ ...prev, [section]: true }));
    setTimeout(() => {
      setSavedSections((prev) => ({ ...prev, [section]: false }));
    }, 3000);
  }

  // Load profile from Supabase when the form owns its data. LocalStorage is no longer a data source.
  useEffect(() => {
    if (externalProfile !== undefined) return;
    if (mode !== "full") return;

    loadProfileFromSupabase().then((result) => {
      setLoadingCloud(false);
      if (result.ok && result.profile) {
        console.info("[profile-refresh]", {
          event: "ProfileSetupForm loaded profile",
          updatedAt: result.profile.updatedAt ?? null,
        });
        setProfile({ ...defaultProfile, ...result.profile });
        invalidateCoachCache();
      }
      // Silent fail here keeps the form usable; save still reports Supabase errors.
    });
  }, [externalProfile, mode]);

  function update<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((current) => {
      const nextSources = { ...(current.fieldSources ?? {}) };
      nextSources[key] = "manual";
      return { ...current, [key]: value, fieldSources: nextSources };
    });
  }





  function handleBirthDate(value: string) {
    if (value && value > TODAY) {
      setBirthDateError("วันเกิดต้องไม่ใช่อนาคต");
      return;
    }
    setBirthDateError("");
    update("birthDate", value || undefined);
  }

  // Fields present in the onboarding form — mark as "manual" on first save so the
  // history analyzer never silently overwrites what the user explicitly provided.
  const ONBOARDING_MANUAL_FIELDS: (keyof UserProfile)[] = [
    "displayName", "birthDate", "mainGoal",
    "currentLongestRunKm", "runningDaysPerWeek", "weeklyTrainingDays",
    "easyPace", "easyHrCap", "preferredLongRunDay",
    "injuryHistory", "injuryNotes", "coachingTone",
  ];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (birthDateError) return;
    if (hasBlockingHrErrors({
      restingHr: profile.normalRestingHr,
      maxHr: profile.maxHr,
      ltHr: profile.lactateThresholdHr,
      easyHrCap: profile.easyHrCap,
      aerobicThresholdHr: profile.aerobicThresholdHr,
      anaerobicThresholdHr: profile.anaerobicThresholdHr,
    })) {
      setStatus({ tone: "bad", text: "กรุณาแก้ไขข้อผิดพลาดในข้อมูลอัตราการเต้นของหัวใจก่อนบันทึก" });
      return;
    }
    invalidateCoachCache();

    // In onboarding mode, mark every filled field as "manual" before saving.
    // (Full mode marks fields via saveSectionEdit() when the user edits each section.)
    let profileToSave = profile;
    if (mode === "onboarding") {
      const newSources = { ...(profile.fieldSources ?? {}) };
      for (const key of ONBOARDING_MANUAL_FIELDS) {
        const val = profile[key];
        if (val != null && val !== "" && newSources[key] !== "manual") {
          newSources[key] = "manual";
        }
      }
      profileToSave = { ...profile, fieldSources: newSources };
    }

    setSaving(true);
    setStatus({ tone: "idle", text: "กำลังบันทึก..." });
    const result = await saveProfileToSupabase(profileToSave);
    setSaving(false);
    if (result.ok) {
      setStatus({ tone: "good", text: "บันทึกแล้ว" });
      const freshResult = await loadProfileFromSupabase();
      if (freshResult.ok && freshResult.profile) {
        setProfile({ ...defaultProfile, ...freshResult.profile });
        onProfileSaved?.(freshResult.profile);
      }
      if (redirectOnSave) router.push("/");
    } else {
      const detail = "message" in result ? result.message : result.reason;
      setStatus({ tone: "bad", text: `บันทึกไม่สำเร็จ กรุณาลองใหม่: ${detail}` });
    }
  }

  // Dev-only helpers (not shown in production)
  async function devSaveToSupabase() {
    setDevStatus("กำลังบันทึก...");
    const result = await saveProfileToSupabase(profile);
    setDevStatus(result.ok ? `บันทึกแล้ว (${result.userId?.slice(0, 8)})` : `บันทึกไม่สำเร็จ: ${"message" in result ? result.message : result.reason}`);
  }

  async function devLoadFromSupabase() {
    setDevStatus("กำลังโหลด…");
    const result = await loadProfileFromSupabase();
    if (result.ok && result.profile) {
      setProfile({ ...defaultProfile, ...result.profile });
      invalidateCoachCache();
      setDevStatus(`โหลดแล้ว (${result.userId?.slice(0, 8)})`);
    } else if (result.ok) {
      setDevStatus("ยังไม่มี profile ใน DB");
    } else {
      setDevStatus(`Error: ${"message" in result ? result.message : result.reason}`);
    }
  }

  function toggleSection(name: string) {
    setOpenSection((current) => (current === name ? null : name));
  }

  const computedAge = calculateAgeFromBirthDate(profile.birthDate);
  const hasBaselineHistorySrc = SECTION_KEYS.baseline.some((k) => profile.fieldSources?.[k] === "history_analysis");
  const suggestedProtein = suggestedProteinTargetG(profile.weightKg);
  const suggestedNutrition =
    profile.weightKg != null
      ? calculateNutritionTargetsFromWeight(profile.weightKg, profile.nutritionGoal)
      : null;
  const nutritionFromHistory = (["weightKg", "proteinTargetG", "carbTargetRestDayG", "carbTargetEasyDayG", "carbTargetHardDayG"] as const)
    .some((k) => profile.fieldSources?.[k] === "history_analysis");

  // ── Onboarding (short form) ──────────────────────────────────────────────────
  if (mode === "onboarding") {
    return (
      <form onSubmit={submit} className="card space-y-4 p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">Runner Profile</p>
          <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">ตั้งค่าเริ่มต้น</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            ข้อมูลนี้จะช่วยให้โค้ชวางแผนซ้อมได้เหมาะกับคุณ
          </p>
        </div>

        <input
          className="control"
          required
          placeholder="ชื่อเล่น / ชื่อที่อยากให้เรียก"
          value={profile.displayName}
          onChange={(e) => update("displayName", e.target.value)}
        />

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">วันเกิด</label>
          <input
            className="control"
            type="date"
            max={TODAY}
            value={profile.birthDate ?? ""}
            onChange={(e) => handleBirthDate(e.target.value)}
          />
          {birthDateError && <p className="mt-1 text-xs text-red-500">{birthDateError}</p>}
          {computedAge != null && (
            <p className="mt-1 text-xs text-slate-400">อายุประมาณ {computedAge} ปี</p>
          )}
        </div>

        <textarea
          className="control min-h-20"
          placeholder="เป้าหมายหลักตอนนี้ เช่น อยากจบมาราธอนแบบปลอดภัย"
          value={profile.mainGoal ?? ""}
          onChange={(e) => update("mainGoal", e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberInput placeholder="วิ่งไกลสุด km" value={profile.currentLongestRunKm} onChange={(v) => update("currentLongestRunKm", v)} />
          <NumberInput placeholder="วันวิ่ง/สัปดาห์" value={profile.runningDaysPerWeek ?? profile.weeklyTrainingDays} onChange={(v) => { update("runningDaysPerWeek", v); update("weeklyTrainingDays", v); }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="control" placeholder="Easy pace เช่น 7:00-8:00/km" value={profile.easyPace ?? ""} onChange={(e) => update("easyPace", e.target.value)} />
          <input className="control" placeholder="Easy HR cap เช่น &lt;145" value={profile.easyHrCap ?? ""} onChange={(e) => update("easyHrCap", e.target.value)} />
        </div>
        <input className="control" placeholder="วัน long run เช่น อาทิตย์" value={profile.preferredLongRunDay ?? ""} onChange={(e) => update("preferredLongRunDay", e.target.value)} />
        <textarea
          className="control min-h-16"
          placeholder="ประวัติบาดเจ็บ / อาการเจ็บ (ถ้ามี)"
          value={profile.injuryHistory ?? profile.injuryNotes ?? ""}
          onChange={(e) => { update("injuryHistory", e.target.value); update("injuryNotes", e.target.value); }}
        />
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">สไตล์โค้ช</p>
          <div className="grid grid-cols-2 gap-2">
            {(["friendly", "direct", "gentle", "strict"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update("coachingTone", t)}
                className={`rounded-2xl border py-2 text-sm font-semibold ${profile.coachingTone === t ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600"}`}
              >
                {toneLabel(t)}
              </button>
            ))}
          </div>
        </div>

        {status.text ? (
          <p className={`rounded-2xl p-3 text-sm font-semibold ${statusClass(status.tone)}`}>{status.text}</p>
        ) : null}

        <button className="btn-primary w-full py-3" type="submit">เริ่มใช้งาน</button>
      </form>
    );
  }

  // ── Full profile form ────────────────────────────────────────────────────────
  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">Runner Profile</p>
        <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">โปรไฟล์นักวิ่ง</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          ข้อมูลนี้ช่วยให้โค้ชวางแผนซ้อมได้เหมาะกับคุณ
        </p>
      </div>

      {/* ── 1. Basic ── */}
      <EditableSection
        title="ข้อมูลพื้นฐาน"
        open={openSection === "basic"}
        onToggle={() => toggleSection("basic")}
        isEditing={editingSection === "basic"}
        onStartEdit={() => startSectionEdit("basic")}
        onSaveEdit={() => saveSectionEdit("basic")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.basic}
        renderReadonly={() => (
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="ชื่อเล่น" value={profile.displayName || "—"} />
            <StatCard label="วันเกิด / อายุ" value={profile.birthDate ? `${profile.birthDate} (${computedAge ?? "?"} ปี)` : "—"} />
          </div>
        )}
        renderEditable={() => (
          <>
            <input
              className="control"
              required
              placeholder="ชื่อเล่น"
              value={profile.displayName}
              onChange={(e) => update("displayName", e.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">วันเกิด</label>
              <input
                className="control"
                type="date"
                max={TODAY}
                value={profile.birthDate ?? ""}
                onChange={(e) => handleBirthDate(e.target.value)}
              />
              {birthDateError && <p className="mt-1 text-xs text-red-500">{birthDateError}</p>}
              {computedAge != null && (
                <p className="mt-1 text-xs text-slate-400">อายุประมาณ {computedAge} ปี</p>
              )}
            </div>
          </>
        )}
      />

      {/* ── 2. Goal ── */}
      <EditableSection
        title="เป้าหมายระยะยาว"
        open={openSection === "goal"}
        onToggle={() => toggleSection("goal")}
        isEditing={editingSection === "goal"}
        onStartEdit={() => startSectionEdit("goal")}
        onSaveEdit={() => saveSectionEdit("goal")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.goal}
        renderReadonly={() => (
          <div className="space-y-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">เป้าหมายหลักตอนนี้</p>
              <p className="text-sm font-semibold text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{profile.mainGoal || "ยังไม่มีเป้าหมายระยะยาว"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="ระยะทางเป้าหมาย" value={profile.targetDistance || "—"} />
              <StatCard label="ความสำคัญสูงสุด" value={profile.goalPriority ? priorityLabel(profile.goalPriority) : "—"} />
            </div>
          </div>
        )}
        renderEditable={() => (
          <>
            <p className="text-xs text-slate-400 -mt-1">บอก AI ว่าคุณอยากพัฒนาตัวเองไปทางไหนในระยะยาว</p>
            <textarea
              className="control min-h-20"
              placeholder="เช่น อยากจบมาราธอนแบบปลอดภัย หรืออยากวิ่ง 10K ให้ดีขึ้น"
              value={profile.mainGoal ?? ""}
              onChange={(e) => update("mainGoal", e.target.value)}
            />
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">ระยะที่อยากไปให้ถึง</p>
              <div className="flex flex-wrap gap-2">
                {(["5K", "10K", "Half Marathon", "Full Marathon", "Custom"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => update("targetDistance", d)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${profile.targetDistance === d ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">สิ่งที่ให้ความสำคัญที่สุด</p>
              <div className="grid grid-cols-2 gap-2">
                {(["finish", "time", "injury_free", "consistency", "fitness"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => update("goalPriority", g)}
                    className={`rounded-2xl border py-2 text-xs font-semibold ${profile.goalPriority === g ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600"}`}
                  >
                    {priorityLabel(g)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      />

      {/* ── 3. Running Baseline ── */}
      <EditableSection
        title="สมรรถภาพนักวิ่ง"
        open={openSection === "baseline"}
        onToggle={() => toggleSection("baseline")}
        isEditing={editingSection === "baseline"}
        onStartEdit={() => startSectionEdit("baseline")}
        onSaveEdit={() => saveSectionEdit("baseline")}
        onCancelEdit={cancelSectionEdit}
        hasHistoryAnalysis={hasBaselineHistorySrc}
        isSaved={savedSections.baseline}
        renderReadonly={() => (
          <div className="space-y-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">ระดับนักวิ่ง</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{profile.currentLevel || "ยังไม่ได้ระบุ"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="วิ่งไกลสุด" value={profile.currentLongestRunKm != null ? `${profile.currentLongestRunKm} km` : "—"} />
              <StatCard label="km/สัปดาห์" value={profile.weeklyMileageKm != null ? `${profile.weeklyMileageKm} km` : "—"} />
              <StatCard label="วัน/สัปดาห์" value={(profile.runningDaysPerWeek ?? profile.weeklyTrainingDays) != null ? `${profile.runningDaysPerWeek ?? profile.weeklyTrainingDays} วัน` : "—"} />
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Easy pace</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {profile.easyPace
                  ? <>{profile.easyPace}<span className="ml-1 text-xs font-normal text-slate-400">นาที/กม.</span></>
                  : "ยังไม่ได้ระบุ"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="Easy HR cap"
                value={formatBpm(profile.easyHrCap)}
                note={
                  (() => {
                    const num = getEasyHrNumber(profile.easyHrCap);
                    return num !== null && num > 150
                      ? "ถ้าต้องการ recovery/easy แบบปลอดภัย อาจตั้งไว้ 140–145 bpm ได้"
                      : undefined;
                  })()
                }
              />
              <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] text-slate-400">Max HR</p>
                <p className="text-sm font-semibold text-[var(--foreground)]">
                  {profile.maxHr != null ? formatBpm(profile.maxHr) : "ยังไม่มีข้อมูล"}
                </p>
                {profile.maxHr != null && (
                  <p className="mt-0.5 text-[10px] leading-tight text-slate-400">
                    observed max จากประวัติ ไม่ใช่ max จริงทางสรีรวิทยา
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-rm-primary/20 bg-rm-primary-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[11px] text-rm-muted">
                <SignalDot tone="recovery" />
                โซนหัวใจ / Easy HR
              </p>
              <p className="text-sm font-semibold text-rm-text">
                {HR_ZONE_METHOD_LABELS[profile.hrZoneMethod ?? "auto"]}
              </p>
              {(profile.aerobicThresholdHr != null || profile.anaerobicThresholdHr != null) && (
                <p className="mt-0.5 text-[10px] leading-tight text-rm-muted">
                  AT {profile.aerobicThresholdHr ?? "—"} · AnT {profile.anaerobicThresholdHr ?? "—"}
                </p>
              )}
            </div>
          </div>
        )}
        renderEditable={() => (
          <>
            <p className="text-xs text-slate-400">ข้อมูลนี้ช่วยให้ AI ประเมิน pace, HR และระดับซ้อมที่เหมาะกับคุณ</p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">ระดับนักวิ่ง</label>
              <input className="control" placeholder="เช่น นักวิ่งระดับกลาง, วิ่ง 10K ได้" value={profile.currentLevel ?? ""} onChange={(e) => update("currentLevel", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">วิ่งไกลสุด <span className="font-normal text-slate-400">km</span></label>
                <NumberInput placeholder="เช่น 15.7" value={profile.currentLongestRunKm} onChange={(v) => update("currentLongestRunKm", v)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">รวม/สัปดาห์ <span className="font-normal text-slate-400">km</span></label>
                <NumberInput placeholder="เช่น 36.7" value={profile.weeklyMileageKm} onChange={(v) => update("weeklyMileageKm", v)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">วัน/สัปดาห์</label>
                <NumberInput placeholder="เช่น 5" value={profile.runningDaysPerWeek ?? profile.weeklyTrainingDays} onChange={(v) => { update("runningDaysPerWeek", v); update("weeklyTrainingDays", v); }} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Easy pace <span className="font-normal text-slate-400">นาที/กม.</span></label>
              <input className="control" placeholder="เช่น 7:00–8:00 /km" value={profile.easyPace ?? ""} onChange={(e) => update("easyPace", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Easy HR cap <span className="font-normal text-slate-400">bpm</span></label>
                <input className="control" placeholder="เช่น 140–145 bpm" value={profile.easyHrCap ?? ""} onChange={(e) => update("easyHrCap", e.target.value)} />
                {renderFieldIssues("easyHrCap")}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Max HR <span className="font-normal text-slate-400">bpm</span></label>
                <NumberInput placeholder="เช่น 188" value={profile.maxHr} onChange={(v) => update("maxHr", v)} />
                {renderFieldIssues("maxHr")}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-rm-recovery/25 bg-rm-recovery-soft/40 p-3">
              <div className="space-y-0.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-rm-text">
                  <SignalDot tone="recovery" />
                  โซนหัวใจ / Easy HR
                </label>
                <p className="text-[10px] text-rm-muted">ใช้กำหนดว่า easy/recovery วันนี้ควรเบาแค่ไหน</p>
              </div>
              <select
                className="control"
                aria-label="วิธีคำนวณโซนหัวใจ"
                value={profile.hrZoneMethod ?? "auto"}
                onChange={(e) => update("hrZoneMethod", e.target.value as UserProfile["hrZoneMethod"])}
              >
                <option value="auto">อัตโนมัติ</option>
                <option value="hrr">Heart Rate Reserve</option>
                <option value="at_ant">AT/AnT HR</option>
                <option value="max_hr">Max HR</option>
                <option value="manual">ตั้งเอง</option>
              </select>
              <p className="text-[10px] leading-snug text-rm-muted">
                {HR_ZONE_METHOD_HELP[profile.hrZoneMethod ?? "auto"]}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-rm-muted">AT (Aerobic) <span className="font-normal text-rm-muted/80">bpm</span></label>
                  <NumberInput placeholder="เช่น 146" value={profile.aerobicThresholdHr} onChange={(v) => update("aerobicThresholdHr", v)} />
                  {renderFieldIssues("aerobicThresholdHr")}
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-rm-muted">AnT (Anaerobic) <span className="font-normal text-rm-muted/80">bpm</span></label>
                  <NumberInput placeholder="เช่น 172" value={profile.anaerobicThresholdHr} onChange={(v) => update("anaerobicThresholdHr", v)} />
                  {renderFieldIssues("anaerobicThresholdHr")}
                </div>
              </div>
            </div>
          </>
        )}
      />

      {/* ── 4. Training Pattern ── */}
      <EditableSection
        title="รูปแบบซ้อม"
        open={openSection === "training"}
        onToggle={() => toggleSection("training")}
        isEditing={editingSection === "training"}
        onStartEdit={() => startSectionEdit("training")}
        onSaveEdit={() => saveSectionEdit("training")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.training}
        renderReadonly={() => (
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="วัน Long run" value={profile.preferredLongRunDay || "—"} />
            <StatCard label="Strength (วัน/สัปดาห์)" value={profile.strengthTrainingDaysPerWeek != null ? `${profile.strengthTrainingDaysPerWeek} วัน` : "—"} />
            <StatCard label="เวลาวิ่งที่ชอบ" value={profile.preferredRunTime ? runTimeLabel(profile.preferredRunTime) : "—"} />
            <StatCard
              label="วันซ้อมที่สะดวก"
              value={
                Array.isArray(profile.preferredTrainingDays)
                  ? profile.preferredTrainingDays.join(", ")
                  : profile.preferredTrainingDays || profile.availableTrainingDays || "—"
              }
            />
          </div>
        )}
        renderEditable={() => (
          <>
            <div className="grid grid-cols-2 gap-2">
              <SrcField label="วัน Long run" fieldKey="preferredLongRunDay" sources={profile.fieldSources}>
                <input className="control" placeholder="เช่น อาทิตย์" value={profile.preferredLongRunDay ?? ""} onChange={(e) => update("preferredLongRunDay", e.target.value)} />
              </SrcField>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Strength วัน/สัปดาห์</span>
                <NumberInput
                  placeholder="Strength วัน/สัปดาห์"
                  value={profile.strengthTrainingDaysPerWeek}
                  onChange={(v) => update("strengthTrainingDaysPerWeek", v)}
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-500">เวลาวิ่งที่ชอบ</p>
              <div className="flex flex-wrap gap-2">
                {(["morning", "evening", "night", "flexible"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => update("preferredRunTime", t)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${profile.preferredRunTime === t ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600"}`}
                  >
                    {runTimeLabel(t)}
                  </button>
                ))}
              </div>
            </div>
            <SrcField label="วันซ้อมที่สะดวก" fieldKey="preferredTrainingDays" sources={profile.fieldSources}>
              <input
                className="control"
                placeholder="เช่น จันทร์, พุธ, ศุกร์, อาทิตย์"
                value={(Array.isArray(profile.preferredTrainingDays) ? profile.preferredTrainingDays.join(", ") : profile.preferredTrainingDays) ?? profile.availableTrainingDays ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  update("preferredTrainingDays", v ? v.split(",").map((s) => s.trim()) : undefined);
                  update("availableTrainingDays", v);
                }}
              />
            </SrcField>
          </>
        )}
      />

      {/* ── 5. Injury & Risk ── */}
      <EditableSection
        title="บาดเจ็บและความเสี่ยง"
        open={openSection === "injury"}
        onToggle={() => toggleSection("injury")}
        isEditing={editingSection === "injury"}
        onStartEdit={() => startSectionEdit("injury")}
        onSaveEdit={() => saveSectionEdit("injury")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.injury}
        renderReadonly={() => (
          <div className="space-y-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">ประวัติบาดเจ็บ</p>
              <p className="text-sm font-semibold text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{profile.injuryHistory || profile.injuryNotes || "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">อาการปัจจุบัน</p>
              <p className="text-sm font-semibold text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{profile.currentPainNotes || "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">สิ่งที่ต้องระวัง</p>
              <p className="text-sm font-semibold text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{profile.riskNotes || "—"}</p>
            </div>
          </div>
        )}
        renderEditable={() => (
          <>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ประวัติบาดเจ็บ</span>
              <textarea
                className="control min-h-16"
                placeholder="ประวัติบาดเจ็บ เช่น เข่า, ข้อเท้า, เอ็น"
                value={profile.injuryHistory ?? profile.injuryNotes ?? ""}
                onChange={(e) => { update("injuryHistory", e.target.value); update("injuryNotes", e.target.value); }}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">อาการปัจจุบัน (ถ้ามี)</span>
              <textarea
                className="control min-h-14"
                placeholder="อาการปัจจุบัน (ถ้ามี)"
                value={profile.currentPainNotes ?? ""}
                onChange={(e) => update("currentPainNotes", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">สิ่งที่ต้องระวัง (ถ้ามี)</span>
              <textarea
                className="control min-h-14"
                placeholder="สิ่งที่ต้องระวัง เช่น เพิ่ง recover, หมอห้ามวิ่งเร็ว"
                value={profile.riskNotes ?? ""}
                onChange={(e) => update("riskNotes", e.target.value)}
              />
            </div>
          </>
        )}
      />

      {/* ── 6. Sleep & Recovery ── */}
      <EditableSection
        title="การนอนและ Recovery"
        open={openSection === "sleep"}
        onToggle={() => toggleSection("sleep")}
        isEditing={editingSection === "sleep"}
        onStartEdit={() => startSectionEdit("sleep")}
        onSaveEdit={() => saveSectionEdit("sleep")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.sleep}
        renderReadonly={() => (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="นอนเฉลี่ย" value={profile.averageSleepHours != null ? `${profile.averageSleepHours} ชม.` : "—"} />
              <StatCard label="Sleep score" value={profile.normalSleepScore != null ? String(profile.normalSleepScore) : "—"} />
              <StatCard label="Energy score" value={profile.normalEnergyScore != null ? String(profile.normalEnergyScore) : "—"} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Resting HR" value={formatBpm(profile.normalRestingHr)} />
              <StatCard label="HRV ปกติ" value={profile.normalHrv ? String(profile.normalHrv) : "—"} />
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">กฎ Recovery</p>
              <p className="text-sm font-semibold text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{profile.recoveryRules || profile.sleepNotes || "—"}</p>
            </div>
          </div>
        )}
        renderEditable={() => (
          <>
            <div className="grid grid-cols-3 gap-2">
              <SrcField label="นอนเฉลี่ย" unit="ชม." fieldKey="averageSleepHours" sources={profile.fieldSources}>
                <NumberInput placeholder="เช่น 7" value={profile.averageSleepHours} onChange={(v) => update("averageSleepHours", v)} />
              </SrcField>
              <SrcField label="Sleep score" fieldKey="normalSleepScore" sources={profile.fieldSources}>
                <NumberInput placeholder="เช่น 75" value={profile.normalSleepScore} onChange={(v) => update("normalSleepScore", v)} />
              </SrcField>
              <SrcField label="Energy score" fieldKey="normalEnergyScore" sources={profile.fieldSources}>
                <NumberInput placeholder="เช่น 70" value={profile.normalEnergyScore} onChange={(v) => update("normalEnergyScore", v)} />
              </SrcField>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SrcField label="Resting HR" unit="bpm" fieldKey="normalRestingHr" sources={profile.fieldSources}>
                <NumberInput placeholder="เช่น 52" value={profile.normalRestingHr} onChange={(v) => update("normalRestingHr", v)} />
                {renderFieldIssues("restingHr")}
              </SrcField>
              <SrcField label="HRV ปกติ" fieldKey="normalHrv" sources={profile.fieldSources}>
                <NumberInput placeholder="เช่น 45" value={profile.normalHrv} onChange={(v) => update("normalHrv", v)} />
              </SrcField>
            </div>
            <SrcField label="กฎ Recovery" fieldKey="recoveryRules" sources={profile.fieldSources}>
              <textarea
                className="control min-h-16"
                placeholder="เช่น ถ้า sleep score < 70 ให้ลดความหนัก"
                value={profile.recoveryRules ?? profile.sleepNotes ?? ""}
                onChange={(e) => { update("recoveryRules", e.target.value); update("sleepNotes", e.target.value); }}
              />
            </SrcField>
          </>
        )}
      />

      {/* ── 7. อาหารและความชอบ ── */}
      <EditableSection
        title="อาหารและความชอบ"
        open={openSection === "food"}
        onToggle={() => toggleSection("food")}
        isEditing={editingSection === "food"}
        onStartEdit={() => startSectionEdit("food")}
        onSaveEdit={() => saveSectionEdit("food")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.food}
        renderReadonly={() => {
          const foodPrefs = parseFoodPreferences(profile.foodPreferences);
          const hasAny = foodPrefs.avoids || profile.allergiesOrRestrictions || foodPrefs.likes || foodPrefs.spicy || (foodPrefs.convenience && foodPrefs.convenience.length > 0) || foodPrefs.budget || (foodPrefs.goals && foodPrefs.goals.length > 0);
          if (!hasAny) {
            return <p className="text-sm text-slate-500 italic">ไม่มีข้อมูลความชอบอาหาร</p>;
          }
          return (
            <div className="space-y-2">
              {foodPrefs.avoids && (
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-slate-400">ไม่กิน / เลี่ยงอาหาร</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{foodPrefs.avoids}</p>
                </div>
              )}
              {profile.allergiesOrRestrictions && (
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-slate-400 font-semibold text-red-600">แพ้อาหาร</p>
                  <p className="text-sm font-bold text-red-600">{profile.allergiesOrRestrictions}</p>
                </div>
              )}
              {foodPrefs.likes && (
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-slate-400">ชอบอาหารแบบไหน</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{foodPrefs.likes}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <StatCard label="กินเผ็ด" value={foodPrefs.spicy || "—"} />
                <StatCard label="งบประมาณต่อมื้อ" value={foodPrefs.budget || "—"} />
              </div>
              {foodPrefs.convenience && foodPrefs.convenience.length > 0 && (
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-slate-400">ความสะดวกของมื้ออาหาร</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{foodPrefs.convenience.join(", ")}</p>
                </div>
              )}
              {foodPrefs.goals && foodPrefs.goals.length > 0 && (
                <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                  <p className="text-[11px] text-slate-400">เป้าหมายอาหาร</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">{foodPrefs.goals.join(", ")}</p>
                </div>
              )}
            </div>
          );
        }}
        renderEditable={() => {
          const foodPrefs = parseFoodPreferences(profile.foodPreferences);
          
          const updateField = (key: keyof FoodPreferencesJSON, val: string | string[] | undefined) => {
            const updated = { ...foodPrefs, [key]: val };
            update("foodPreferences", JSON.stringify(updated));
          };

          const handleCheckbox = (key: "convenience" | "goals", item: string, checked: boolean) => {
            const list = [...(foodPrefs[key] || [])];
            if (checked) {
              if (!list.includes(item)) list.push(item);
            } else {
              const index = list.indexOf(item);
              if (index > -1) list.splice(index, 1);
            }
            updateField(key, list);
          };

          return (
            <div className="space-y-4">
              <p className="text-xs text-slate-400">ช่วยให้โค้ชแนะนำมื้ออาหารที่เข้ากับชีวิตจริงมากขึ้น</p>
              
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">ไม่กิน / เลี่ยงอาหาร</label>
                <input
                  className="control"
                  placeholder="เช่น เครื่องใน, นมวัว, อาหารทะเล"
                  value={foodPrefs.avoids ?? ""}
                  onChange={(e) => updateField("avoids", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">แพ้อาหาร</label>
                <input
                  className="control"
                  placeholder="เช่น ถั่ว, กุ้ง, นม"
                  value={profile.allergiesOrRestrictions ?? ""}
                  onChange={(e) => update("allergiesOrRestrictions", e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">ชอบอาหารแบบไหน</label>
                <input
                  className="control"
                  placeholder="เช่น อาหารไทย, ตามสั่ง, สุกี้, ปลา"
                  value={foodPrefs.likes ?? ""}
                  onChange={(e) => updateField("likes", e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 block">กินเผ็ดได้ไหม</label>
                <div className="flex gap-2">
                  {(["ไม่เผ็ด", "เผ็ดน้อย", "เผ็ดได้"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateField("spicy", s)}
                      className={`flex-1 rounded-2xl border py-2 text-sm font-semibold transition ${foodPrefs.spicy === s ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 block">ความสะดวกของมื้ออาหาร</label>
                <div className="flex flex-wrap gap-2">
                  {["ร้านตามสั่ง", "7-11", "food court", "ทำเอง", "delivery"].map((item) => {
                    const isChecked = (foodPrefs.convenience ?? []).includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleCheckbox("convenience", item, !isChecked)}
                        className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${isChecked ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"}`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 block">งบต่อมื้อ</label>
                <div className="flex gap-2">
                  {(["ประหยัด", "ปานกลาง", "ไม่จำกัดมาก"] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => updateField("budget", b)}
                      className={`flex-1 rounded-2xl border py-2 text-sm font-semibold transition ${foodPrefs.budget === b ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"}`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 block">เป้าหมายอาหาร</label>
                <div className="flex flex-wrap gap-2">
                  {["ลดพุง", "เพิ่มกล้าม", "วิ่งดีขึ้น", "คุมไขมัน", "กินง่ายไม่เครียด"].map((item) => {
                    const isChecked = (foodPrefs.goals ?? []).includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleCheckbox("goals", item, !isChecked)}
                        className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${isChecked ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600 bg-white hover:bg-slate-50"}`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }}
      />

      {/* ── 8. Coaching Style ── */}
      <EditableSection
        title="สไตล์โค้ช"
        open={openSection === "coaching"}
        onToggle={() => toggleSection("coaching")}
        isEditing={editingSection === "coaching"}
        onStartEdit={() => startSectionEdit("coaching")}
        onSaveEdit={() => saveSectionEdit("coaching")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.coaching}
        renderReadonly={() => {
          const previewText = getCoachStylePreview({
            tone: profile.coachingTone,
            length: profile.responseDetail,
            language: profile.language,
            easyHrCap: profile.easyHrCap,
          });
          return (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="สไตล์การพูด" value={profile.coachingTone ? toneLabel(profile.coachingTone) : "—"} />
                <StatCard label="ความละเอียดคำตอบ" value={profile.responseDetail ? detailLabel(profile.responseDetail) : "—"} />
                <StatCard label="ภาษา" value={profile.language ? langLabel(profile.language) : "—"} />
              </div>
              <div className="rounded-2xl border border-slate-100 bg-[#f8fafc] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--label-color)]">ตัวอย่างโค้ชของคุณ</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 italic">“{previewText}”</p>
              </div>
            </div>
          );
        }}
        renderEditable={() => {
          const previewText = getCoachStylePreview({
            tone: profile.coachingTone,
            length: profile.responseDetail,
            language: profile.language,
            easyHrCap: profile.easyHrCap,
          });
          return (
            <>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">สไตล์การพูด</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["friendly", "direct", "gentle", "strict"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => update("coachingTone", t)}
                      className={`rounded-2xl border py-2 text-sm font-semibold ${profile.coachingTone === t ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600"}`}
                    >
                      {toneLabel(t)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">ความละเอียดคำตอบ</p>
                <div className="flex gap-2">
                  {(["short", "medium", "detailed"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => update("responseDetail", d)}
                      className={`flex-1 rounded-2xl border py-2 text-sm font-semibold ${profile.responseDetail === d ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600"}`}
                    >
                      {detailLabel(d)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-500">ภาษา</p>
                <div className="flex gap-2">
                  {(["th", "en", "mixed"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => update("language", l)}
                      className={`flex-1 rounded-2xl border py-2 text-sm font-semibold ${profile.language === l ? "border-[var(--foreground)] bg-[var(--foreground)] text-white" : "border-slate-200 text-slate-600"}`}
                    >
                      {langLabel(l)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-[#f8fafc] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--label-color)]">ตัวอย่างโค้ชของคุณ</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 italic">“{previewText}”</p>
              </div>
            </>
          );
        }}
      />

      {/* ── 8. Advanced ── */}
      <EditableSection
        title="Advanced"
        open={openSection === "advanced"}
        onToggle={() => toggleSection("advanced")}
        isEditing={editingSection === "advanced"}
        onStartEdit={() => startSectionEdit("advanced")}
        onSaveEdit={() => saveSectionEdit("advanced")}
        onCancelEdit={cancelSectionEdit}
        isSaved={savedSections.advanced}
        renderReadonly={() => (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="ส่วนสูง" value={profile.heightCm != null ? `${profile.heightCm} cm` : "—"} />
              <StatCard label="น้ำหนัก" value={profile.weightKg != null ? `${profile.weightKg} kg` : "—"} />
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">ตารางงาน</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{profile.workSchedule || "—"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">Timezone</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{profile.timezone || "—"}</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="LT HR" value={formatBpm(profile.lactateThresholdHr)} />
              <StatCard label="VO2max" value={profile.vo2max != null ? String(profile.vo2max) : "—"} />
              <StatCard label="Cadence" value={profile.averageCadence != null ? `${profile.averageCadence} spm` : "—"} />
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">อุปกรณ์ที่มี</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {Array.isArray(profile.availableEquipment)
                  ? profile.availableEquipment.join(", ")
                  : profile.availableEquipment || "—"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">เป้าหมายโภชนาการ</p>
              <p className="text-sm font-semibold text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">{nutritionGoalLabel(profile.nutritionGoal) || "—"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="Protein target" value={profile.proteinTargetG != null ? `${profile.proteinTargetG} g` : suggestedProtein != null ? `แนะนำ ${suggestedProtein} g` : "—"} />
              <StatCard label="Carb hard day" value={profile.carbTargetHardDayG != null ? `${profile.carbTargetHardDayG} g` : "—"} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatCard label="คาเฟอีน" value={profile.caffeineHabit || "—"} />
              <StatCard label="อาหารเสริม" value={profile.supplementNotes || "—"} />
            </div>
          </div>
        )}
        renderEditable={() => (
          <>
            <p className="text-xs text-slate-400">ฟิลด์เสริมสำหรับ AI ที่ต้องการข้อมูลเพิ่มเติม</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">ส่วนสูง (cm)</span>
                <NumberInput placeholder="สูง (cm)" value={profile.heightCm} onChange={(v) => update("heightCm", v)} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">น้ำหนัก (kg)</span>
                <NumberInput placeholder="หนัก (kg)" value={profile.weightKg} onChange={(v) => update("weightKg", v)} />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ตารางงาน</span>
              <input
                className="control"
                placeholder="ตารางงาน เช่น ทำงานวันธรรมดา เลิก 18:00"
                value={profile.workSchedule ?? ""}
                onChange={(e) => update("workSchedule", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">Timezone</span>
              <input
                className="control"
                placeholder="Timezone เช่น Asia/Bangkok"
                value={profile.timezone ?? ""}
                onChange={(e) => update("timezone", e.target.value)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">LT HR</span>
                <NumberInput placeholder="LT HR" value={profile.lactateThresholdHr} onChange={(v) => update("lactateThresholdHr", v)} />
                {renderFieldIssues("ltHr")}
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">VO2max</span>
                <NumberInput placeholder="VO2max" value={profile.vo2max} onChange={(v) => update("vo2max", v)} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Cadence spm</span>
                <NumberInput placeholder="Cadence spm" value={profile.averageCadence} onChange={(v) => update("averageCadence", v)} />
              </div>
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">อุปกรณ์ที่มี</span>
              <textarea
                className="control min-h-14"
                placeholder="อุปกรณ์ที่มี เช่น treadmill, track, foam roller"
                value={(Array.isArray(profile.availableEquipment) ? profile.availableEquipment.join(", ") : profile.availableEquipment) ?? ""}
                onChange={(e) => update("availableEquipment", e.target.value ? e.target.value.split(",").map((s) => s.trim()) : undefined)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">เป้าหมายโภชนาการ</span>
              <select
                className="control min-h-14"
                value={profile.nutritionGoal ?? ""}
                onChange={(e) => update("nutritionGoal", (e.target.value || undefined) as UserProfile["nutritionGoal"])}
              >
                <option value="">ยังไม่ระบุ</option>
                <option value="recovery">Recovery / ฟื้นตัว</option>
                <option value="lean_muscle">Lean muscle / เพิ่มกล้ามแบบไม่หนักท้อง</option>
                <option value="race_fuel">Race fuel / เติมพลังเพื่อซ้อมและแข่ง</option>
                <option value="weight_control">Weight control / คุมน้ำหนักแบบไม่เสียแรงซ้อม</option>
              </select>
            </div>
            <div className="rounded-2xl bg-[#e7efea] p-3 text-xs leading-5 text-slate-600 space-y-1">
              <p>ระบบคำนวณเป้าหมายโปรตีนและคาร์บจากน้ำหนักล่าสุดและรูปแบบการซ้อม คุณแก้เองได้เสมอ</p>
              {suggestedNutrition != null ? (
                <p className="text-slate-500">คำนวณจากน้ำหนักล่าสุด {profile.weightKg} kg · protein {suggestedNutrition.proteinMultiplier} g/kg/day · ค่าแนะนำเบื้องต้นสำหรับการซ้อมและ recovery</p>
              ) : (
                <p className="text-slate-500">หากยังไม่ใส่น้ำหนัก สามารถกรอกเองได้ หรือกดวิเคราะห์จากประวัติเพื่อให้ระบบดึงค่าจากประวัติ body composition</p>
              )}
              {nutritionFromHistory && (
                <p className="text-[#42677f] font-semibold">คำนวณจากประวัติ body composition อัตโนมัติ · แก้ได้ตลอด</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Protein target (g/day)</span>
                <NumberInput
                  placeholder={suggestedNutrition != null ? String(suggestedNutrition.proteinTargetG) : suggestedProtein != null ? String(suggestedProtein) : "เช่น 90"}
                  value={profile.proteinTargetG}
                  onChange={(v) => update("proteinTargetG", v)}
                />
                <p className="text-[11px] text-slate-400">แนะนำจากน้ำหนักประมาณ {suggestedNutrition?.proteinMultiplier ?? 1.6} g/kg/day</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Carb rest day (g)</span>
                <NumberInput placeholder={suggestedNutrition != null ? String(suggestedNutrition.carbTargetRestDayG) : "เช่น 150"} value={profile.carbTargetRestDayG} onChange={(v) => update("carbTargetRestDayG", v)} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Carb easy day (g)</span>
                <NumberInput placeholder={suggestedNutrition != null ? String(suggestedNutrition.carbTargetEasyDayG) : "เช่น 200"} value={profile.carbTargetEasyDayG} onChange={(v) => update("carbTargetEasyDayG", v)} />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-slate-500">Carb hard/race day (g)</span>
                <NumberInput placeholder={suggestedNutrition != null ? String(suggestedNutrition.carbTargetHardDayG) : "เช่น 260"} value={profile.carbTargetHardDayG} onChange={(v) => update("carbTargetHardDayG", v)} />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 leading-4">คำนวณตามประเภทวันซ้อม: วันพัก / easy / hard หรือ race day</p>

            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">กาแฟ/คาเฟอีน</span>
              <input
                className="control"
                placeholder="กาแฟ/คาเฟอีน เช่น กาแฟเช้า 1 แก้ว"
                value={profile.caffeineHabit ?? ""}
                onChange={(e) => update("caffeineHabit", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">อาหารเสริม</span>
              <input
                className="control"
                placeholder="อาหารเสริม เช่น โปรตีน, วิตามิน D"
                value={profile.supplementNotes ?? ""}
                onChange={(e) => update("supplementNotes", e.target.value)}
              />
            </div>
          </>
        )}
      />

      {loadingCloud && (
        <p className="text-center text-xs text-slate-400">กำลังโหลดโปรไฟล์…</p>
      )}

      {status.text ? (
        <p className={`rounded-2xl p-3 text-sm font-semibold ${statusClass(status.tone)}`}>{status.text}</p>
      ) : null}

      <LoadingButton className="btn-primary w-full py-3" type="submit" loading={saving} loadingText="กำลังบันทึก...">
        บันทึกโปรไฟล์
      </LoadingButton>

      {IS_DEV && (
        <div className="rounded-2xl border border-dashed border-slate-200">
          <button
            type="button"
            onClick={() => setDevOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-2 text-left"
          >
            <span className="text-xs font-mono text-slate-400">Developer tools</span>
            <span className="text-slate-300 text-sm">{devOpen ? "−" : "+"}</span>
          </button>
          {devOpen && (
            <div className="space-y-2 border-t border-dashed border-slate-200 px-4 pb-3 pt-2">
              <div className="flex gap-2">
                <button type="button" className="btn-secondary flex-1 py-2 text-xs" onClick={devSaveToSupabase}>
                  บันทึกไป Supabase
                </button>
                <button type="button" className="btn-secondary flex-1 py-2 text-xs" onClick={devLoadFromSupabase}>
                  โหลดจาก Supabase
                </button>
              </div>
              {devStatus && <p className="text-xs font-mono text-slate-500">{devStatus}</p>}
            </div>
          )}
        </div>
      )}
    </form>
  );
}



function EditableSection({
  title,
  open,
  onToggle,
  isEditing,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  hasHistoryAnalysis,
  isSaved,
  renderReadonly,
  renderEditable,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  hasHistoryAnalysis?: boolean;
  isSaved?: boolean;
  renderReadonly: () => React.ReactNode;
  renderEditable: () => React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-rm-border overflow-hidden bg-rm-surface">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center justify-between px-4 py-3 text-left"
        >
          <p className="text-sm font-bold text-rm-text">{title}</p>
          <span className="text-rm-muted text-lg leading-none">{open ? "−" : "+"}</span>
        </button>
        {open && !isEditing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="mr-4 shrink-0 text-xs font-semibold text-rm-recovery hover:underline"
          >
            แก้ไข
          </button>
        )}
        {open && isEditing && (
          <div className="mr-4 flex shrink-0 gap-3">
            <button
              type="button"
              onClick={onSaveEdit}
              className="text-xs font-semibold text-rm-recovery hover:underline"
            >
              บันทึก
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs font-semibold text-rm-muted hover:underline"
            >
              ยกเลิก
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="space-y-3 border-t border-rm-border px-4 pb-4 pt-3">
          {hasHistoryAnalysis && !isEditing && (
            <p className="text-[11px] text-rm-recovery">✨ ค่าบางส่วนอัปเดตจากประวัติการซ้อมล่าสุด</p>
          )}
          {isSaved && !isEditing && (
            <p className="text-[11px] text-rm-primary-strong font-semibold">✓ บันทึก{title}แล้ว</p>
          )}
          {isEditing ? renderEditable() : renderReadonly()}
        </div>
      )}
    </div>
  );
}

function NumberInput({ placeholder, value, onChange }: { placeholder: string; value?: number; onChange: (value: number | undefined) => void }) {
  return (
    <input
      className="control"
      type="number"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
    />
  );
}

function statusClass(tone: Status["tone"]) {
  if (tone === "good") return "bg-green-50 text-green-700";
  if (tone === "warn") return "bg-amber-50 text-amber-700";
  if (tone === "bad") return "bg-red-50 text-red-700";
  return "bg-slate-50 text-slate-600";
}


function toneLabel(t: string) {
  return { friendly: "เป็นกันเอง", direct: "ตรงๆ", gentle: "นุ่มนวล", strict: "เข้มงวด" }[t] ?? t;
}
function detailLabel(d: string) {
  return { short: "สั้น", medium: "กลาง", detailed: "ละเอียด" }[d] ?? d;
}
function langLabel(l: string) {
  return { th: "ไทย", en: "English", mixed: "ผสม" }[l] ?? l;
}
function priorityLabel(g: string) {
  return { finish: "จบให้ได้", time: "ทำเวลา", injury_free: "ไม่เจ็บ", consistency: "สม่ำเสมอ", fitness: "สุขภาพดี" }[g] ?? g;
}
function nutritionGoalLabel(g?: string) {
  if (!g) return "";
  return {
    recovery: "Recovery / ฟื้นตัว",
    lean_muscle: "Lean muscle",
    race_fuel: "Race fuel",
    weight_control: "Weight control",
  }[g] ?? g;
}
function runTimeLabel(t: string) {
  return { morning: "เช้า", evening: "เย็น", night: "กลางคืน", flexible: "ยืดหยุ่น" }[t] ?? t;
}

function StatCard({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-rm-surface-soft px-3 py-2.5">
      <p className="text-[11px] text-rm-muted">{label}</p>
      <p className="text-sm font-semibold text-rm-text">{value}</p>
      {note && <p className="mt-0.5 text-[10px] leading-tight text-rm-muted">{note}</p>}
    </div>
  );
}

// Source-aware field wrapper: label + badge + children (the input)
function SrcField({
  label,
  unit,
  fieldKey,
  sources,
  children,
}: {
  label: string;
  unit?: string;
  fieldKey: string;
  sources?: UserProfile["fieldSources"];
  children: React.ReactNode;
}) {
  const src = sources?.[fieldKey];
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-rm-muted">
          {label}
          {unit && <span className="ml-1 font-normal text-rm-muted/80">{unit}</span>}
        </span>
        {src === "history_analysis" && (
          <span className="rounded-full bg-rm-recovery-soft px-1.5 py-0.5 text-[10px] font-bold text-rm-recovery">
            จากประวัติ
          </span>
        )}
        {src === "manual" && (
          <span className="rounded-full bg-rm-surface-soft px-1.5 py-0.5 text-[10px] font-bold text-rm-muted">
            แก้เอง
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
