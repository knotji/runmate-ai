"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { RaceGoal, RacePlan } from "@/types/race";
import { LoadingButton } from "@/components/LoadingButton";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { saveRaceGoalAndPlan } from "@/lib/raceStorage";

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
    let alive = true;
    loadProfileFromSupabase().then((result) => {
    if (!alive || !result.ok) return;
    const profile = result.profile;
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
    });
    return () => {
      alive = false;
    };
  }, []);

  const hasAnyAutoFill = Object.values(autoFilledFields).some(Boolean);

  function update<K extends keyof RaceGoal>(key: K, value: RaceGoal[K]) {
    setGoal((current) => ({ ...current, [key]: value }));
    setAutoFilledFields((prev) => ({ ...prev, [key]: false }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const context = await buildCoachContextFromSupabase();
    const response = await fetch("/api/generate-race-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal, context }),
    });
    const result = await response.json();
    const saveResult = await saveRaceGoalAndPlan(goal, result.data);
    if (!saveResult.ok) {
      setLoading(false);
      return;
    }
    invalidateCoachCache();
    onCreated(saveResult.goal, saveResult.plan);
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
        <RaceDateInput
          value={goal.raceDate}
          onChange={(value) => update("raceDate", value)}
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
          placeholder={targetTimePlaceholder(goal.raceDistance)}
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

      <LoadingButton className="btn-primary w-full py-3 font-bold" loading={loading} loadingText="กำลังสร้าง..." type="submit">
        สร้างแผนซ้อม
      </LoadingButton>
    </form>
  );
}

function RaceDateInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const [displayValue, setDisplayValue] = useState(() => formatDateForDisplay(value));

  const parsedDisplay = parseDisplayDateToIso(displayValue);
  const isInvalidDisplay = Boolean(displayValue) && !parsedDisplay;

  useEffect(() => {
    textRef.current?.setCustomValidity(isInvalidDisplay ? "กรุณาใส่วันที่รูปแบบ dd/mm/yyyy" : "");
  }, [isInvalidDisplay]);

  function openPicker() {
    const picker = pickerRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!picker) return;
    if (typeof picker.showPicker === "function") {
      picker.showPicker();
      return;
    }
    picker.focus();
    picker.click();
  }

  function updateDisplay(nextDisplay: string) {
    const next = formatDateInput(nextDisplay);
    setDisplayValue(next);
    const iso = parseDisplayDateToIso(next);
    onChange(iso ?? "");
  }

  function commitIsoDate(isoDate: string) {
    setDisplayValue(formatDateForDisplay(isoDate));
    onChange(isoDate);
  }

  return (
    <div className="relative">
      <input
        ref={textRef}
        className="control pr-12"
        required
        inputMode="numeric"
        placeholder="dd/mm/yyyy"
        value={displayValue}
        onChange={(event) => updateDisplay(event.target.value)}
        onBlur={() => {
          if (parsedDisplay) setDisplayValue(formatDateForDisplay(parsedDisplay));
        }}
        aria-label="วันแข่ง รูปแบบ dd/mm/yyyy"
      />
      <button
        type="button"
        aria-label="เลือกวันแข่ง"
        onClick={openPicker}
        className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
      >
        <span aria-hidden="true" className="text-xs font-bold">เลือก</span>
      </button>
      <input
        ref={pickerRef}
        className="sr-only"
        tabIndex={-1}
        type="date"
        value={value}
        onChange={(event) => commitIsoDate(event.target.value)}
        aria-hidden="true"
      />
    </div>
  );
}

function formatDateForDisplay(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function parseDisplayDateToIso(displayDate: string): string | null {
  const match = displayDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function targetTimePlaceholder(distance: string): string {
  if (distance === "5K") return "เช่น 25:00 หรือ 30 นาที";
  if (distance === "10K") return "เช่น 55:00 หรือ 1:05 ชั่วโมง";
  if (distance === "Half Marathon") return "เช่น 2:00 ชั่วโมง หรือ 1:55:00";
  if (distance === "Full Marathon") return "เช่น 4:30 ชั่วโมง หรือ 4:15:00";
  return "เช่น 55 นาที หรือ 1:30 ชั่วโมง";
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
