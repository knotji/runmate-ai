"use client";

import { useState } from "react";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { todayBangkokDateKey, dateKeyToRecordedAt } from "@/lib/date";
import type { LocalHistoryItem } from "@/lib/localHistory";

export type DayCheckIn = {
  source: "manual_checkin";
  mood: "good" | "ok" | "tired" | "stressed" | "sore";
  planFollowThrough: "done" | "partial" | "rest" | "missed";
  painToday: "none" | "mild" | "clear";
  note: string;
  dateKey: string;
  recordedAt: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (item: LocalHistoryItem) => void;
};

const MOOD_OPTIONS: { value: DayCheckIn["mood"]; label: string }[] = [
  { value: "good", label: "ดี" },
  { value: "ok", label: "พอใช้" },
  { value: "tired", label: "ล้า" },
  { value: "stressed", label: "เครียด" },
  { value: "sore", label: "เจ็บ/ตึง" },
];

const PLAN_OPTIONS: { value: DayCheckIn["planFollowThrough"]; label: string }[] = [
  { value: "done", label: "ทำตามแผน" },
  { value: "partial", label: "ทำบางส่วน" },
  { value: "rest", label: "พัก" },
  { value: "missed", label: "ไม่ได้ทำ" },
];

const PAIN_OPTIONS: { value: DayCheckIn["painToday"]; label: string }[] = [
  { value: "none", label: "ไม่มี" },
  { value: "mild", label: "มีเล็กน้อย" },
  { value: "clear", label: "มีชัดเจน" },
];

function OptionButton<T extends string>({
  value,
  selected,
  label,
  onSelect,
}: {
  value: T;
  selected: boolean;
  label: string;
  onSelect: (v: T) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-2xl px-3 py-2 text-sm font-semibold transition-colors
        ${selected
          ? "bg-[var(--primary)] text-white"
          : "bg-slate-100 text-slate-600 hover:bg-[var(--primary-soft)] hover:text-[var(--primary-strong)]"
        }`}
    >
      {label}
    </button>
  );
}

export function EndOfDayCheckInModal({ open, onClose, onSaved }: Props) {
  const [mood, setMood] = useState<DayCheckIn["mood"]>("ok");
  const [plan, setPlan] = useState<DayCheckIn["planFollowThrough"]>("done");
  const [pain, setPain] = useState<DayCheckIn["painToday"]>("none");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const dateKey = todayBangkokDateKey();
      const recordedAt = dateKeyToRecordedAt(dateKey);
      const checkIn: DayCheckIn = {
        source: "manual_checkin",
        mood,
        planFollowThrough: plan,
        painToday: pain,
        note: note.trim(),
        dateKey,
        recordedAt,
      };
      const item = createHistoryItem("summary", checkIn, recordedAt);
      const result = await saveHistoryItems([item]);
      if (!result.ok) throw new Error(result.error ?? "save failed");
      window.dispatchEvent(new CustomEvent("runmate:cloud-data-updated"));
      onSaved(item);
      onClose();
      // reset for next use
      setMood("ok");
      setPlan("done");
      setPain("none");
      setNote("");
    } catch {
      setError("บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-3xl bg-white p-6 pb-8 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#17201d]">สรุปท้ายวัน</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">
            ✕
          </button>
        </div>

        {/* Mood */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">วันนี้เป็นยังไงบ้าง?</p>
          <div className="flex flex-wrap gap-2">
            {MOOD_OPTIONS.map((o) => (
              <OptionButton key={o.value} value={o.value} selected={mood === o.value} label={o.label} onSelect={setMood} />
            ))}
          </div>
        </div>

        {/* Plan */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">ทำตามแผนได้ไหม?</p>
          <div className="flex flex-wrap gap-2">
            {PLAN_OPTIONS.map((o) => (
              <OptionButton key={o.value} value={o.value} selected={plan === o.value} label={o.label} onSelect={setPlan} />
            ))}
          </div>
        </div>

        {/* Pain */}
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">มีอาการเจ็บไหม?</p>
          <div className="flex flex-wrap gap-2">
            {PAIN_OPTIONS.map((o) => (
              <OptionButton key={o.value} value={o.value} selected={pain === o.value} label={o.label} onSelect={setPain} />
            ))}
          </div>
        </div>

        {/* Note */}
        <div className="space-y-2">
          <label htmlFor="eod-note" className="text-sm font-semibold text-slate-700">note สั้น ๆ (ไม่บังคับ)</label>
          <textarea
            id="eod-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เช่น งานหนัก นอนน้อย แต่ยังเดินเบาได้"
            maxLength={200}
            rows={2}
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[var(--primary)] focus:outline-none"
          />
        </div>

        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full rounded-2xl bg-[var(--primary)] py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? "กำลังบันทึก…" : "บันทึกสรุปท้ายวัน"}
        </button>
      </div>
    </div>
  );
}
