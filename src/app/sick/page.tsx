"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { todayBangkokDateKey } from "@/lib/date";
import { buildSickLog } from "@/lib/health/illnessGuardrail";
import { readDraftIntakeNote } from "@/lib/upload/draftIntakeNote";
import { SYMPTOM_GROUPS, SICK_SYMPTOM_LABELS } from "@/types/sick";
import type { SickSymptom, SickSeverity, SickHealthStatus } from "@/types/sick";

// ── status choices ────────────────────────────────────────────────────────────

type StatusChoice = { value: SickHealthStatus; label: string; emoji: string; desc: string };

const STATUS_OPTIONS: StatusChoice[] = [
  { value: "normal",  label: "ปกติ",          emoji: "🟢", desc: "ร่างกายพร้อมซ้อม" },
  { value: "fatigue", label: "เพลีย",          emoji: "🟡", desc: "อ่อนเพลียแต่ไม่ป่วย" },
  { value: "sick",    label: "ไม่สบาย / ป่วย", emoji: "🔴", desc: "มีอาการป่วย" },
];

const SEVERITY_OPTIONS: { value: SickSeverity; label: string }[] = [
  { value: "mild",     label: "เบา" },
  { value: "moderate", label: "ปานกลาง" },
  { value: "severe",   label: "หนัก" },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function SickPage() {
  const [healthStatus, setHealthStatus] = useState<SickHealthStatus>("normal");
  const [symptoms, setSymptoms] = useState<SickSymptom[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [severity, setSeverity] = useState<SickSeverity>("mild");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const draftNote = readDraftIntakeNote("sick");
    if (draftNote) {
      queueMicrotask(() => {
        setNote(draftNote);
        setHealthStatus("sick");
      });
    }
  }, []);

  const isSick = healthStatus === "sick";
  const needsSymptomOrNote = isSick && symptoms.length === 0 && !note.trim();

  function toggleGroup(groupId: string) {
    const group = SYMPTOM_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    if (selectedGroups.includes(groupId)) {
      setSelectedGroups((prev) => prev.filter((g) => g !== groupId));
      setSymptoms((prev) => prev.filter((s) => !group.symptoms.includes(s)));
    } else {
      setSelectedGroups((prev) => [...prev, groupId]);
    }
    setSaved(false);
  }

  function toggleSymptom(sym: SickSymptom) {
    setSymptoms((prev) =>
      prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]
    );
    setSaved(false);
  }

  async function handleSave() {
    if (needsSymptomOrNote) return;
    setSaving(true);
    setSaveError("");
    try {
      const now = new Date().toISOString();
      const today = todayBangkokDateKey();
      const log = buildSickLog({
        date: today,
        createdAt: now,
        healthStatus,
        symptoms: isSick ? symptoms : [],
        severity: isSick ? severity : undefined,
        note: note.trim() || undefined,
      });
      const item = createHistoryItem("sick", log, now);
      const result = await saveHistoryItems([item]);
      if (!result.ok) {
        setSaveError(result.error ?? "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      } else {
        setSaved(true);
        // Reset form on success
        setSymptoms([]);
        setSelectedGroups([]);
        setNote("");
        setSeverity("mild");
      }
    } catch {
      setSaveError("เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell title="วันนี้ไม่สบายไหม?" subtitle="บันทึกอาการเพื่อให้ RunMate ปรับแผนไม่ให้ฝืน">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Status selection */}
        <div className="space-y-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setHealthStatus(opt.value);
                setSaved(false);
                setSaveError("");
              }}
              className={[
                "w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors border",
                healthStatus === opt.value
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-text)]",
              ].join(" ")}
            >
              <span className="text-lg">{opt.emoji}</span>
              <div>
                <p className="text-sm font-semibold text-[var(--foreground)]">{opt.label}</p>
                <p className="text-xs text-[var(--muted-text)]">{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Symptom section — shown only when sick */}
        {isSick && (
          <>
            {/* Group picker */}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--label-color)] mb-1">
                อาการอยู่ตรงไหนบ้าง
              </p>
              <p className="text-xs text-[var(--muted-text)] mb-2">
                เลือกกลุ่มอาการก่อน แล้วเลือกอาการที่ตรงที่สุด
              </p>
              <div className="grid grid-cols-3 gap-2">
                {SYMPTOM_GROUPS.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className={[
                      "rounded-xl px-2 py-2 text-xs font-semibold border transition-colors text-center leading-tight",
                      selectedGroups.includes(group.id)
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-text)]",
                    ].join(" ")}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              {/* Symptom chips for selected groups */}
              {selectedGroups.length > 0 && (
                <div className="mt-3 space-y-2">
                  {SYMPTOM_GROUPS.filter((g) => selectedGroups.includes(g.id)).map((group) => (
                    <div key={group.id} className="flex flex-wrap gap-2">
                      {group.symptoms.map((sym) => (
                        <button
                          key={sym}
                          type="button"
                          onClick={() => toggleSymptom(sym)}
                          className={[
                            "rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors",
                            symptoms.includes(sym)
                              ? "bg-rm-caution-soft border-rm-caution/40 text-rm-caution"
                              : "bg-[var(--surface-muted)] border-[var(--border)] text-[var(--muted-text)]",
                          ].join(" ")}
                        >
                          {SICK_SYMPTOM_LABELS[sym]}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Severity */}
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--label-color)] mb-2">
                ความรุนแรง
              </p>
              <div className="flex gap-2">
                {SEVERITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setSeverity(opt.value); setSaved(false); }}
                    className={[
                      "flex-1 rounded-xl py-2 text-sm font-semibold border transition-colors",
                      severity === opt.value
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--foreground)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted-text)]",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Note */}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--label-color)] mb-2">
            บันทึกเพิ่มเติม
          </p>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => { setNote(e.target.value); setSaved(false); }}
            placeholder={isSick ? "เช่น เริ่มเจ็บคอตั้งแต่เมื่อคืน มีน้ำมูก ไม่มีไข้" : "เช่น เพลียหลังนอนน้อย"}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-text)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
          />
        </div>

        {/* Validation hint */}
        {needsSymptomOrNote && (
          <p className="text-xs text-rm-caution font-medium">
            กรุณาเลือกอาการหรือเพิ่มบันทึกก่อนบันทึก
          </p>
        )}

        {/* Guardrail preview when sick */}
        {isSick && symptoms.length > 0 && (() => {
          const preview = buildSickLog({
            date: todayBangkokDateKey(),
            createdAt: new Date().toISOString(),
            healthStatus,
            symptoms,
            severity,
          });
          if (preview.riskLevel === "hard_stop") {
            return (
              <div className="rounded-xl border border-rm-stop/30 bg-rm-stop-soft px-3 py-2.5 text-xs font-medium text-rm-stop leading-5">
                🔴 <strong>วันนี้ควรพัก</strong> — อาการที่เลือกบ่งชี้ว่าควรงดออกกำลังกายและเน้นพักผ่อน
                {preview.fever && <span> ถ้ามีไข้สูงหรือไข้ไม่ลดควรพบแพทย์</span>}
              </div>
            );
          }
          if (preview.riskLevel === "mild") {
            return (
              <div className="rounded-xl border border-rm-caution/30 bg-rm-caution-soft px-3 py-2.5 text-xs font-medium text-rm-caution leading-5">
                🟡 <strong>ลดความหนักไว้ก่อน</strong> — มีอาการเหนือคอเล็กน้อย ถ้าจะขยับให้เบามากและหยุดทันทีถ้าอาการแย่ลง
              </div>
            );
          }
          return null;
        })()}

        {/* Save button */}
        <LoadingButton
          loading={saving}
          loadingText="กำลังบันทึก..."
          disabled={needsSymptomOrNote}
          onClick={handleSave}
          className="w-full rounded-xl py-3 text-sm font-semibold bg-[var(--primary)] text-white disabled:opacity-40"
        >
          บันทึกอาการวันนี้
        </LoadingButton>

        {/* Success */}
        {saved && !saveError && (
          <div className="rounded-xl bg-rm-primary-soft border border-rm-primary/30 px-3 py-2.5 text-xs font-medium text-rm-primary-strong">
            ✅ บันทึกเรียบร้อย — Today และ Coach จะปรับคำแนะนำตามอาการวันนี้
          </div>
        )}

        {/* Error */}
        {saveError && (
          <div className="rounded-xl border border-rm-stop/30 bg-rm-stop-soft px-3 py-2.5 text-xs font-medium text-rm-stop">
            {saveError}
          </div>
        )}

        {/* Safety note */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2.5 text-xs leading-5 text-rm-text/70 space-y-1">
          <p className="font-semibold text-[var(--foreground)]">ข้อมูลสำคัญ</p>
          <p>RunMate ไม่ได้วินิจฉัยโรคและไม่ใช่บริการทางการแพทย์</p>
          <p>หากมีไข้สูง หายใจลำบาก เจ็บหน้าอก เวียนหัวมาก หรืออาการแย่ลงเร็ว ควรพบแพทย์</p>
        </div>
      </div>
    </AppShell>
  );
}
