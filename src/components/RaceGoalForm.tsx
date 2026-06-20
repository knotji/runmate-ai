"use client";

import { FormEvent, useState, useEffect } from "react";
import type { RaceGoal, RacePlan } from "@/types/race";
import { LoadingState } from "@/components/LoadingState";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { readLocalProfile } from "@/lib/profileStorage";

export function RaceGoalForm({ onCreated }: { onCreated: (goal: RaceGoal, plan: RacePlan) => void }) {
  const [loading, setLoading] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(true);
  const [autoFilledFields, setAutoFilledFields] = useState<Record<string, boolean>>({});
  
  const [goal, setGoal] = useState<RaceGoal>({
    raceName: "",
    raceDate: "",
    raceDistance: "5K",
    goalType: "แค่อยากจบ",
    targetTime: "",
    currentLongestRunKm: 10,
    trainingDaysPerWeek: 4,
    preferredLongRunDay: "อาทิตย์",
    planPreference: "ค่อยเป็นค่อยไป",
    injuryNotes: "",
  });

  useEffect(() => {
    const profile = readLocalProfile();
    if (!profile) return;

    const filled: Record<string, boolean> = {};
    const newGoal: Partial<RaceGoal> = {};

    if (profile.currentLongestRunKm != null) {
      newGoal.currentLongestRunKm = profile.currentLongestRunKm;
      filled.currentLongestRunKm = true;
    }
    const days = profile.runningDaysPerWeek ?? profile.weeklyTrainingDays;
    if (days != null) {
      newGoal.trainingDaysPerWeek = days;
      filled.trainingDaysPerWeek = true;
    }
    if (profile.preferredLongRunDay) {
      newGoal.preferredLongRunDay = profile.preferredLongRunDay;
      filled.preferredLongRunDay = true;
    }
    const injury = profile.currentPainNotes || profile.injuryNotes || profile.injuryHistory;
    if (injury) {
      newGoal.injuryNotes = injury;
      filled.injuryNotes = true;
    }
    const planPref = (profile as Record<string, unknown>).planPreference;
    if (typeof planPref === "string" && planPref) {
      newGoal.planPreference = planPref;
      filled.planPreference = true;
    }

    const hasBaselineValues = profile.currentLongestRunKm != null && days != null && !!profile.preferredLongRunDay;

    queueMicrotask(() => {
      setGoal((prev) => ({
        ...prev,
        ...newGoal,
      }));
      setAutoFilledFields(filled);
      if (hasBaselineValues) {
        setSectionOpen(false);
      }
    });
  }, []);

  const hasAnyAutoFill = Object.values(autoFilledFields).some(Boolean);

  function update<K extends keyof RaceGoal>(key: K, value: RaceGoal[K]) {
    setGoal((current) => ({ ...current, [key]: value }));
    setAutoFilledFields((prev) => ({ ...prev, [key]: false }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const { buildCoachContext } = await import("@/lib/buildCoachContext");
    const context = buildCoachContext();
    const response = await fetch("/api/generate-race-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, context }),
    });
    const result = await response.json();
    localStorage.setItem("runmate.raceGoal", JSON.stringify(goal));
    localStorage.setItem("runmate.racePlan", JSON.stringify(result.data));
    invalidateCoachCache();
    onCreated(goal, result.data);
    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-5">
      <div>
        <h2 className="text-xl font-bold">สร้าง Race Goal</h2>
        {hasAnyAutoFill && (
          <p className="mt-1 text-xs text-[#42677f] font-semibold bg-[#e7efea] px-3 py-2 rounded-xl">
            ✨ บางค่าถูกเติมจากโปรไฟล์และประวัติการซ้อมล่าสุด คุณแก้ไขได้ก่อนสร้างแผน
          </p>
        )}
      </div>

      {/* ── Section 1: Race-specific (top) ── */}
      <Field label="ชื่อสนาม / เป้าหมาย">
        <input
          className="control"
          required
          placeholder="เช่น ก้าวท้าใจ 5K"
          value={goal.raceName}
          onChange={(e) => update("raceName", e.target.value)}
        />
      </Field>

      <Field label="วันแข่ง">
        <input
          className="control"
          required
          type="date"
          value={goal.raceDate}
          onChange={(e) => update("raceDate", e.target.value)}
        />
      </Field>

      <Field label="ระยะทาง">
        <select className="control" value={goal.raceDistance} onChange={(e) => update("raceDistance", e.target.value as RaceGoal["raceDistance"])}>
          {["5K", "10K", "Half Marathon", "Full Marathon", "Custom"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </Field>

      <Field label="เป้าหมาย">
        <select className="control" value={goal.goalType} onChange={(e) => update("goalType", e.target.value)}>
          {["แค่อยากจบ", "ทำเวลา", "วิ่งไม่เจ็บ", "เพิ่มความสม่ำเสมอ"].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </Field>

      <Field label="เป้าหมายเวลา (ไม่บังคับ)">
        <input
          className="control"
          placeholder="เช่น 4:30 ชั่วโมง หรือ 55 นาที"
          value={goal.targetTime ?? ""}
          onChange={(e) => update("targetTime", e.target.value)}
        />
      </Field>

      {/* ── Section 2: Collapsible Baseline info ── */}
      <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white/40">
        <button
          type="button"
          onClick={() => setSectionOpen(!sectionOpen)}
          className="flex w-full items-center justify-between px-4 py-3 text-left font-bold text-xs text-slate-500 uppercase tracking-wide"
        >
          <span>ข้อมูลพื้นฐานจากโปรไฟล์</span>
          <span className="text-slate-400 text-lg leading-none">{sectionOpen ? "−" : "+"}</span>
        </button>
        {sectionOpen && (
          <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3 bg-white/10">
            <div className="grid grid-cols-2 gap-3">
              <Field label="วิ่งนานสุดตอนนี้ (km)" isAutoFilled={autoFilledFields.currentLongestRunKm}>
                <input
                  className="control"
                  type="number"
                  min="0"
                  step="0.5"
                  value={goal.currentLongestRunKm ?? ""}
                  onChange={(e) => update("currentLongestRunKm", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Field>
              <Field label="วันซ้อม / สัปดาห์" isAutoFilled={autoFilledFields.trainingDaysPerWeek}>
                <input
                  className="control"
                  type="number"
                  min="1"
                  max="7"
                  value={goal.trainingDaysPerWeek ?? ""}
                  onChange={(e) => update("trainingDaysPerWeek", e.target.value ? Number(e.target.value) : undefined)}
                />
              </Field>
            </div>

            <Field label="วัน Long Run" isAutoFilled={autoFilledFields.preferredLongRunDay}>
              <select className="control" value={goal.preferredLongRunDay ?? ""} onChange={(e) => update("preferredLongRunDay", e.target.value)}>
                {["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>

            <Field label="ความหนักเบาของแผน" isAutoFilled={autoFilledFields.planPreference}>
              <select className="control" value={goal.planPreference ?? "ค่อยเป็นค่อยไป"} onChange={(e) => update("planPreference", e.target.value)}>
                {["ค่อยเป็นค่อยไป", "ท้าทาย"].map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Field>

            <Field label="อาการเจ็บ / หมายเหตุ" isAutoFilled={autoFilledFields.injuryNotes}>
              <textarea
                className="control min-h-20"
                placeholder="เช่น เจ็บเข่าซ้ายเล็กน้อย หรือ ไม่มี"
                value={goal.injuryNotes ?? ""}
                onChange={(e) => update("injuryNotes", e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      <button className="btn-primary w-full py-3 font-bold" disabled={loading} type="submit">
        {loading ? "กำลังสร้างแผน…" : "สร้างแผนซ้อม"}
      </button>
      {loading && <LoadingState />}
    </form>
  );
}

function Field({ label, isAutoFilled, children }: { label: string; isAutoFilled?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</p>
        {isAutoFilled && (
          <span className="rounded-full bg-[#e7efea] px-1.5 py-0.5 text-[9px] font-bold text-[#42677f]">
            จากโปรไฟล์
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
