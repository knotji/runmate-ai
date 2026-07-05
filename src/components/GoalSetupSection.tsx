"use client";

import { useEffect, useState } from "react";
import {
  BODY_GOALS,
  BODY_GOAL_TYPE_LABEL,
  GOAL_LABEL_TH,
  GUARDRAIL_OPTIONS,
  RACE_GOALS,
  SECONDARY_GOAL_OPTIONS,
} from "@/lib/goals/goalTypes";
import type { BodyGoal, GoalType, LifestyleGoal, RaceGoalConfig, UserGoalProfile } from "@/lib/goals/goalTypes";
import { DEFAULT_GOAL_PROFILE, goalProfileSummaryTh, mergeGoalProfile } from "@/lib/goals/goalProfile";
import { loadGoalProfileFromSupabase, saveGoalProfileToSupabase } from "@/lib/goals/goalStorage";

type Step = 1 | 2 | 3 | 4;

const PRIMARY_GOAL_OPTIONS: { goal: GoalType; desc: string }[] = [
  { goal: "race_performance", desc: "อยากทำเวลาในการแข่งขัน มีเป้าหมาย race ที่ชัดเจน" },
  { goal: "running_consistency", desc: "วิ่งสม่ำเสมอ ค่อย ๆ สะสม km ไม่บาดเจ็บ" },
  { goal: "general_health", desc: "แค่อยากสุขภาพดี active และมีพลังงาน" },
  { goal: "fat_loss", desc: "ลดน้ำหนัก ลดไขมัน หุ่น lean" },
  { goal: "six_pack", desc: "Six pack / core แน่น" },
  { goal: "muscle_gain", desc: "เพิ่มกล้าม สร้างกล้ามเนื้อ" },
  { goal: "injury_recovery", desc: "กำลังฟื้นจากบาดเจ็บ อยากกลับมาวิ่งได้" },
  { goal: "sleep_better", desc: "นอนหลับให้ดีขึ้น ฟื้นตัวเต็มที่" },
  { goal: "stress_balance", desc: "ลดความเครียด สมดุลชีวิต" },
];

function parseTimeInput(value: string): number | undefined {
  const parts = value.trim().split(":").map(Number);
  if (parts.length === 2 && parts.every((p) => !Number.isNaN(p))) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every((p) => !Number.isNaN(p))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return undefined;
}

function formatSeconds(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function GoalSetupSection() {
  const [step, setStep] = useState<Step>(1);
  const [profile, setProfile] = useState<UserGoalProfile>(DEFAULT_GOAL_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Race sub-form local state
  const [raceDistanceKm, setRaceDistanceKm] = useState("");
  const [raceDate, setRaceDate] = useState("");
  const [raceTargetTime, setRaceTargetTime] = useState("");

  useEffect(() => {
    loadGoalProfileFromSupabase().then((res) => {
      if (res.ok) {
        setProfile(res.goalProfile);
        const rg = res.goalProfile.raceGoal;
        if (rg?.enabled) {
          if (rg.distanceKm) setRaceDistanceKm(String(rg.distanceKm));
          if (rg.raceDate) setRaceDate(rg.raceDate);
          if (rg.targetTimeSec) setRaceTargetTime(formatSeconds(rg.targetTimeSec));
        }
      }
      setLoading(false);
    });
  }, []);

  function toggleSecondary(goal: GoalType) {
    setProfile((prev) => {
      const already = prev.secondaryGoals.includes(goal);
      if (already) {
        return { ...prev, secondaryGoals: prev.secondaryGoals.filter((g) => g !== goal) };
      }
      if (prev.secondaryGoals.length >= 2) return prev;
      return { ...prev, secondaryGoals: [...prev.secondaryGoals, goal] };
    });
  }

  function toggleGuardrail(goal: GoalType) {
    setProfile((prev) => {
      const already = prev.guardrailGoals.includes(goal);
      if (already) {
        return { ...prev, guardrailGoals: prev.guardrailGoals.filter((g) => g !== goal) };
      }
      return { ...prev, guardrailGoals: [...prev.guardrailGoals, goal] };
    });
  }

  function buildRaceGoal(): RaceGoalConfig {
    const distanceKm = raceDistanceKm ? Number(raceDistanceKm) : undefined;
    const targetTimeSec = parseTimeInput(raceTargetTime);
    const targetRacePaceSecPerKm =
      distanceKm && targetTimeSec ? Math.round(targetTimeSec / distanceKm) : undefined;
    return {
      enabled: true,
      distanceKm: distanceKm && !Number.isNaN(distanceKm) ? distanceKm : undefined,
      raceDate: raceDate || null,
      targetTimeSec,
      targetRacePaceSecPerKm,
    };
  }

  function buildBodyGoal(): BodyGoal {
    const type = (
      profile.primaryGoal === "six_pack" ? "six_pack"
      : profile.primaryGoal === "fat_loss" ? "fat_loss"
      : profile.primaryGoal === "muscle_gain" ? "muscle_gain"
      : profile.secondaryGoals.find((g) => BODY_GOALS.includes(g))
    ) as BodyGoal["type"];
    return { enabled: true, type };
  }

  function buildLifestyleGoal(): LifestyleGoal {
    return profile.lifestyleGoal ?? {};
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      let finalProfile = { ...profile };

      if (RACE_GOALS.includes(profile.primaryGoal)) {
        finalProfile = mergeGoalProfile(finalProfile, { raceGoal: buildRaceGoal() });
      } else if (!finalProfile.raceGoal?.enabled) {
        finalProfile = mergeGoalProfile(finalProfile, { raceGoal: { enabled: false } });
      }

      const hasBody = BODY_GOALS.includes(profile.primaryGoal) ||
        profile.secondaryGoals.some((g) => BODY_GOALS.includes(g));
      if (hasBody) {
        finalProfile = mergeGoalProfile(finalProfile, { bodyGoal: buildBodyGoal() });
      } else {
        finalProfile = mergeGoalProfile(finalProfile, { bodyGoal: { enabled: false } });
      }

      finalProfile = mergeGoalProfile(finalProfile, { lifestyleGoal: buildLifestyleGoal() });

      const res = await saveGoalProfileToSupabase(finalProfile);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      setProfile(finalProfile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const needsRaceDetails = RACE_GOALS.includes(profile.primaryGoal);
  const needsBodyDetails = BODY_GOALS.includes(profile.primaryGoal) ||
    profile.secondaryGoals.some((g) => BODY_GOALS.includes(g));

  if (loading) {
    return (
      <section className="card p-5">
        <p className="text-sm text-[var(--muted-text)]">กำลังโหลดเป้าหมาย...</p>
      </section>
    );
  }

  return (
    <section className="card space-y-5 p-5" data-testid="goal-setup-section">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เป้าหมายของคุณ</p>
        <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">ตั้งเป้าหมาย</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted-text)]">
          โค้ชจะปรับคำแนะนำให้ตรงกับเป้าหมายของคุณ
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStep(s)}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              s === step
                ? "bg-[var(--primary-strong)]"
                : s < step
                ? "bg-[var(--primary-strong)]/40"
                : "bg-[var(--border-warm)]"
            }`}
            aria-label={`ขั้นตอน ${s}`}
          />
        ))}
      </div>

      {/* Step 1: Primary Goal */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--foreground)]">เป้าหมายหลักคืออะไร?</p>
          <div className="space-y-2">
            {PRIMARY_GOAL_OPTIONS.map(({ goal, desc }) => {
              const active = profile.primaryGoal === goal;
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => setProfile((prev) => ({
                    ...prev,
                    primaryGoal: goal,
                    secondaryGoals: prev.secondaryGoals.filter((g) => g !== goal),
                  }))}
                  className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${
                    active
                      ? "border-[var(--primary-strong)] bg-[var(--primary-soft)]/40"
                      : "border-[var(--border-warm)] bg-white/70 hover:bg-[var(--primary-soft)]/20"
                  }`}
                  data-testid={`primary-goal-${goal}`}
                >
                  <p className={`text-sm font-bold ${active ? "text-[var(--primary-strong)]" : "text-[var(--foreground)]"}`}>
                    {GOAL_LABEL_TH[goal]}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted-text)] leading-relaxed">{desc}</p>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="btn-primary w-full py-3 text-sm font-bold"
          >
            ถัดไป →
          </button>
        </div>
      )}

      {/* Step 2: Secondary Goals */}
      {step === 2 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">มีเป้าหมายรองไหม? (ไม่เกิน 2)</p>
            <p className="text-xs text-[var(--muted-text)] mt-1">ข้ามได้ถ้าไม่มี</p>
          </div>
          <div className="space-y-2">
            {SECONDARY_GOAL_OPTIONS.filter((g) => g !== profile.primaryGoal).map((goal) => {
              const active = profile.secondaryGoals.includes(goal);
              const disabled = !active && profile.secondaryGoals.length >= 2;
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => !disabled && toggleSecondary(goal)}
                  disabled={disabled}
                  className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${
                    active
                      ? "border-[var(--primary-strong)] bg-[var(--primary-soft)]/40"
                      : disabled
                      ? "border-[var(--border-warm)] bg-[var(--surface-muted)] opacity-40 cursor-not-allowed"
                      : "border-[var(--border-warm)] bg-white/70 hover:bg-[var(--primary-soft)]/20"
                  }`}
                  data-testid={`secondary-goal-${goal}`}
                >
                  <p className={`text-sm font-semibold ${active ? "text-[var(--primary-strong)]" : "text-[var(--foreground)]"}`}>
                    {GOAL_LABEL_TH[goal]}
                    {active && <span className="ml-2 text-xs">✓</span>}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(1)} className="flex-1 btn-secondary py-3 text-sm">
              ← ย้อนกลับ
            </button>
            <button type="button" onClick={() => setStep(3)} className="flex-1 btn-primary py-3 text-sm font-bold">
              ถัดไป →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Guardrail Goals */}
      {step === 3 && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">มีอะไรที่ต้องระวังเป็นพิเศษ?</p>
            <p className="text-xs text-[var(--muted-text)] mt-1">โค้ชจะหลีกเลี่ยงการแนะนำที่อาจขัดกับสิ่งนี้</p>
          </div>
          <div className="space-y-2">
            {GUARDRAIL_OPTIONS.map((goal) => {
              const active = profile.guardrailGoals.includes(goal);
              return (
                <button
                  key={goal}
                  type="button"
                  onClick={() => toggleGuardrail(goal)}
                  className={`w-full text-left rounded-2xl border px-4 py-3 transition-all ${
                    active
                      ? "border-[var(--primary-strong)] bg-[var(--primary-soft)]/40"
                      : "border-[var(--border-warm)] bg-white/70 hover:bg-[var(--primary-soft)]/20"
                  }`}
                  data-testid={`guardrail-goal-${goal}`}
                >
                  <p className={`text-sm font-semibold ${active ? "text-[var(--primary-strong)]" : "text-[var(--foreground)]"}`}>
                    {GOAL_LABEL_TH[goal]}
                    {active && <span className="ml-2 text-xs">✓</span>}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(2)} className="flex-1 btn-secondary py-3 text-sm">
              ← ย้อนกลับ
            </button>
            <button type="button" onClick={() => setStep(4)} className="flex-1 btn-primary py-3 text-sm font-bold">
              ถัดไป →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Details + Save */}
      {step === 4 && (
        <div className="space-y-4">
          <p className="text-sm font-bold text-[var(--foreground)]">รายละเอียดเพิ่มเติม</p>

          {/* Race details */}
          {needsRaceDetails && (
            <div className="rounded-2xl border border-[var(--border-warm)] p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เป้าหมาย Race</p>
              <div className="space-y-2">
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--foreground)]">ระยะทาง (km)</span>
                  <input
                    type="number"
                    value={raceDistanceKm}
                    onChange={(e) => setRaceDistanceKm(e.target.value)}
                    placeholder="42.195"
                    className="mt-1 w-full rounded-xl border border-[var(--border-warm)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--foreground)]">วันแข่ง (ไม่บังคับ)</span>
                  <input
                    type="date"
                    value={raceDate}
                    onChange={(e) => setRaceDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border-warm)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-[var(--foreground)]">เวลาเป้าหมาย เช่น 3:30:00 หรือ 25:00 (ไม่บังคับ)</span>
                  <input
                    type="text"
                    value={raceTargetTime}
                    onChange={(e) => setRaceTargetTime(e.target.value)}
                    placeholder="3:30:00"
                    className="mt-1 w-full rounded-xl border border-[var(--border-warm)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Body details */}
          {needsBodyDetails && (
            <div className="rounded-2xl border border-[var(--border-warm)] p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เป้าหมายร่างกาย</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(BODY_GOAL_TYPE_LABEL).map(([key, label]) => {
                  const active = profile.bodyGoal?.type === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setProfile((prev) => ({
                        ...prev,
                        bodyGoal: { ...(prev.bodyGoal ?? { enabled: true }), enabled: true, type: key as BodyGoal["type"] },
                      }))}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                        active
                          ? "border-[var(--primary-strong)] bg-[var(--primary-soft)]/40 text-[var(--primary-strong)]"
                          : "border-[var(--border-warm)] bg-white/70 text-[var(--foreground)] hover:bg-[var(--primary-soft)]/20"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Lifestyle */}
          <div className="rounded-2xl border border-[var(--border-warm)] p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เป้าหมายไลฟ์สไตล์ (ไม่บังคับ)</p>
            <div className="space-y-2">
              <label className="block">
                <span className="text-xs font-semibold text-[var(--foreground)]">นอนกี่ชั่วโมงต่อคืน</span>
                <input
                  type="number"
                  value={profile.lifestyleGoal?.sleepTargetHours ?? ""}
                  onChange={(e) => setProfile((prev) => ({
                    ...prev,
                    lifestyleGoal: {
                      ...(prev.lifestyleGoal ?? {}),
                      sleepTargetHours: e.target.value ? Number(e.target.value) : null,
                    },
                  }))}
                  placeholder="7.5"
                  step="0.5"
                  min="4"
                  max="12"
                  className="mt-1 w-full rounded-xl border border-[var(--border-warm)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-[var(--foreground)]">ออกกำลังกายกี่วันต่อสัปดาห์</span>
                <input
                  type="number"
                  value={profile.lifestyleGoal?.weeklyWorkoutDays ?? ""}
                  onChange={(e) => setProfile((prev) => ({
                    ...prev,
                    lifestyleGoal: {
                      ...(prev.lifestyleGoal ?? {}),
                      weeklyWorkoutDays: e.target.value ? Number(e.target.value) : null,
                    },
                  }))}
                  placeholder="4"
                  min="1"
                  max="7"
                  className="mt-1 w-full rounded-xl border border-[var(--border-warm)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </label>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)] mb-1">สรุปเป้าหมาย</p>
            <pre className="text-xs text-[var(--foreground)] whitespace-pre-wrap leading-relaxed font-sans">
              {goalProfileSummaryTh(profile)}
            </pre>
          </div>

          {error && (
            <p className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-semibold text-red-600">{error}</p>
          )}

          <div className="flex gap-2">
            <button type="button" onClick={() => setStep(3)} className="flex-1 btn-secondary py-3 text-sm">
              ← ย้อนกลับ
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 btn-primary py-3 text-sm font-bold disabled:opacity-50"
              data-testid="goal-save-btn"
            >
              {saving ? "กำลังบันทึก..." : saved ? "บันทึกแล้ว ✓" : "บันทึกเป้าหมาย"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
