"use client";

import { useState, useEffect } from "react";
import { loadRoutinesFromSupabase, saveRoutineToSupabase, logCompletedStrength } from "@/lib/strength";
import type { StrengthRoutine, AIPrescription, StrengthExercise } from "@/types/strength";
import type { CoachContext } from "@/lib/buildCoachContext";

function formatRepsDuration(ex: StrengthExercise) {
  if (ex.durationSec) {
    return `${ex.sets} เซ็ต × ${ex.durationSec} วิ`;
  }
  const reps = String(ex.reps || "");
  if (reps.includes("ครั้ง") || reps.includes("วิ")) {
    return `${ex.sets} เซ็ต × ${reps}`;
  }
  return `${ex.sets} เซ็ต × ${reps} ครั้ง`;
}

export function StrengthWorkoutCard({
  context,
  onLogCompleted
}: {
  context: CoachContext | null;
  onLogCompleted: () => void;
}) {
  const [routines, setRoutines] = useState<StrengthRoutine[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<StrengthRoutine | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<StrengthRoutine | null>(null);
  const [prescription, setPrescription] = useState<AIPrescription | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loggingWorkout, setLoggingWorkout] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadRoutinesFromSupabase().then((data) => {
      setRoutines(data);
      if (data.length > 0) setSelectedRoutine(data[0]);
    });
  }, []);

  async function handleSaveTemplate() {
    if (!editingRoutine) return;
    setSavingTemplate(true);
    setError("");
    const res = await saveRoutineToSupabase(editingRoutine);
    setSavingTemplate(false);
    if (res.ok) {
      setRoutines((prev) => prev.map((r) => (r.id === editingRoutine.id ? editingRoutine : r)));
      setSelectedRoutine(editingRoutine);
      setEditingRoutine(null);
      setFeedback("บันทึกเทมเพลตเรียบร้อยแล้ว");
      setTimeout(() => setFeedback(""), 3000);
    } else {
      setError(res.error ?? "บันทึกเทมเพลตไม่สำเร็จ");
    }
  }

  async function handleAIPrescription() {
    if (!selectedRoutine || !context) return;
    setLoadingAI(true);
    setError("");
    setPrescription(null);
    try {
      const res = await fetch("/api/analyze-strength", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routine: selectedRoutine, context }),
      });
      if (!res.ok) throw new Error("API error");
      const json = await res.json() as { ok: boolean; data: AIPrescription };
      if (json.ok && json.data) {
        setPrescription(json.data);
      } else {
        throw new Error("วิเคราะห์ไม่สำเร็จ");
      }
    } catch {
      setError("AI ปรับแผนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoadingAI(false);
    }
  }

  async function handleLogWorkout(source: "saved_routine" | "ai_prescription") {
    if (!selectedRoutine) return;
    setLoggingWorkout(true);
    setError("");
    setFeedback("");

    const exercises = source === "ai_prescription" && prescription ? prescription.exercises : selectedRoutine.exercises;
    const routineName = source === "ai_prescription" && prescription ? prescription.routineName : selectedRoutine.name;
    const intensity = source === "ai_prescription" && prescription ? prescription.intensity : (selectedRoutine.id === "fullbody" ? "moderate" : "easy");
    const durationMin = source === "ai_prescription" && prescription ? prescription.estimatedDurationMin : (selectedRoutine.warmupMin + selectedRoutine.cooldownMin + 15);
    const coachReason = source === "ai_prescription" && prescription ? prescription.reason : undefined;

    const res = await logCompletedStrength({
      type: "strength",
      routineId: selectedRoutine.id,
      routineName,
      source,
      intensity,
      durationMin,
      exercises,
      notes: selectedRoutine.notes,
      coachReason,
      createdAt: new Date().toISOString()
    });

    setLoggingWorkout(false);
    if (res.ok) {
      setFeedback("🏋️ บันทึกการฝึกซ้อมเข้า Supabase สำเร็จแล้ว!");
      onLogCompleted();
      setTimeout(() => setFeedback(""), 5000);
    } else {
      setError(res.error ?? "บันทึกการฝึกซ้อมไม่สำเร็จ");
    }
  }

  function handleUpdateExercise(index: number, key: keyof StrengthExercise, value: string | number | undefined) {
    if (!editingRoutine) return;
    const updatedExercises = [...editingRoutine.exercises];
    updatedExercises[index] = { ...updatedExercises[index], [key]: value };
    setEditingRoutine({ ...editingRoutine, exercises: updatedExercises });
  }

  if (editingRoutine) {
    return (
      <section className="card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[#17201d]">แก้ไข: {editingRoutine.name}</h2>
          <p className="text-xs text-slate-500">ปรับเปลี่ยนแผนสำหรับบันทึกใช้ในครั้งถัดไป</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">คำอธิบาย</label>
            <input
              className="control"
              value={editingRoutine.description}
              onChange={(e) => setEditingRoutine({ ...editingRoutine, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">วอร์ม (นาที)</label>
              <input
                type="number"
                className="control"
                value={editingRoutine.warmupMin}
                onChange={(e) => setEditingRoutine({ ...editingRoutine, warmupMin: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 mb-1 block">คูลดาวน์ (นาที)</label>
              <input
                type="number"
                className="control"
                value={editingRoutine.cooldownMin}
                onChange={(e) => setEditingRoutine({ ...editingRoutine, cooldownMin: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-500 block">ท่าออกกำลังกาย</label>
            {editingRoutine.exercises.map((ex, index) => (
              <div key={index} className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2">
                <input
                  className="control font-bold"
                  value={ex.name}
                  onChange={(e) => handleUpdateExercise(index, "name", e.target.value)}
                  placeholder="ชื่อท่า"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <label className="block">
                    <span className="text-[10px] text-slate-400">เซ็ต</span>
                    <input
                      type="number"
                      className="control text-xs"
                      value={ex.sets}
                      onChange={(e) => handleUpdateExercise(index, "sets", Number(e.target.value))}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-400">จำนวนครั้ง</span>
                    <input
                      className="control text-xs"
                      value={ex.reps}
                      onChange={(e) => handleUpdateExercise(index, "reps", e.target.value)}
                      placeholder="เช่น 12 หรือ 8/ข้าง"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-400">พัก (วิ)</span>
                    <input
                      type="number"
                      className="control text-xs"
                      value={ex.restSec}
                      onChange={(e) => handleUpdateExercise(index, "restSec", Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-2xl">{error}</p>}

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              disabled={savingTemplate}
              onClick={handleSaveTemplate}
              className="btn-primary py-2.5 text-sm"
            >
              {savingTemplate ? "กำลังบันทึก…" : "บันทึกเทมเพลต"}
            </button>
            <button
              type="button"
              onClick={() => setEditingRoutine(null)}
              className="btn-secondary py-2.5 text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card p-5 space-y-4">
      {/* Selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-400">เลือกโปรแกรม</label>
        <div className="flex gap-2">
          {routines.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setSelectedRoutine(r);
                setPrescription(null);
              }}
              className={`flex-1 rounded-xl py-2 px-1 text-xs font-bold border transition-colors ${selectedRoutine?.id === r.id ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600 bg-white"}`}
            >
              {r.id === "recovery" ? "Recovery" : r.id === "fullbody" ? "Full Body" : "Core & Abs"}
            </button>
          ))}
        </div>
      </div>

      {selectedRoutine && (
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-lg font-bold text-[#17201d]">{selectedRoutine.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5 leading-5">{selectedRoutine.description}</p>
            <div className="flex gap-4 mt-2 text-xs text-slate-400">
              <span>วอร์ม: {selectedRoutine.warmupMin} นาที</span>
              <span>คูลดาวน์: {selectedRoutine.cooldownMin} นาที</span>
            </div>
          </div>

          {/* AI prescription block */}
          {prescription ? (
            <div className="rounded-2xl border border-[#d9e8df] bg-[#f5faf7] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-bold">AI Prescription</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${prescription.intensity === "easy" ? "bg-green-100 text-green-700" : prescription.intensity === "hard" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  ระดับ {prescription.intensity}
                </span>
              </div>
              <h4 className="text-sm font-bold text-[#17201d]">{prescription.recommendedTitle}</h4>
              <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap"><strong>โค้ชวิเคราะห์:</strong> {prescription.reason}</p>
              
              {prescription.warnings && prescription.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                  {prescription.warnings.map((w, i) => (
                    <p key={i} className="text-[10px] font-semibold text-amber-800 flex items-start gap-1">
                      <span className="shrink-0">⚠️</span>
                      <span>{w}</span>
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                {prescription.exercises.map((ex, i) => (
                  <div key={i} className="text-xs flex justify-between items-start border-b border-slate-100/50 pb-1.5 last:border-0">
                    <div>
                      <p className="font-semibold text-slate-800">{ex.name}</p>
                      {ex.modificationNote && (
                        <p className="text-[10px] text-slate-500 mt-0.5 italic">
                          💡 {ex.modificationNote}
                        </p>
                      )}
                    </div>
                    <p className="text-slate-500 font-medium shrink-0 ml-2">
                      {formatRepsDuration(ex)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={loggingWorkout}
                  onClick={() => handleLogWorkout("ai_prescription")}
                  className="btn-primary py-2 text-xs"
                >
                  {loggingWorkout ? "กำลังบันทึก…" : "บันทึกวันนี้"}
                </button>
                <button
                  type="button"
                  onClick={() => setPrescription(null)}
                  className="btn-secondary py-2 text-xs"
                >
                  ใช้แผนปกติ
                </button>
              </div>
            </div>
          ) : (
            /* Regular list of exercises */
            <div className="space-y-3">
              <div className="space-y-1.5">
                {selectedRoutine.exercises.map((ex, i) => (
                  <div key={i} className="text-xs flex justify-between items-center border-b border-slate-100 pb-2 last:border-0">
                    <p className="font-semibold text-slate-700">{ex.name}</p>
                    <p className="text-slate-500 font-medium shrink-0 ml-2">
                      {formatRepsDuration(ex)}
                    </p>
                  </div>
                ))}
              </div>

              {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-2xl">{error}</p>}
              {feedback && <p className="text-xs font-semibold text-green-700 bg-green-50 p-3 rounded-2xl">{feedback}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  disabled={loggingWorkout}
                  onClick={() => handleLogWorkout("saved_routine")}
                  className="btn-primary flex-1 py-2.5 text-xs font-bold"
                >
                  {loggingWorkout ? "กำลังบันทึก…" : "บันทึกการฝึกซ้อม"}
                </button>
                <button
                  type="button"
                  disabled={loadingAI}
                  onClick={handleAIPrescription}
                  className="btn-secondary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1"
                >
                  {loadingAI && <div className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-600" />}
                  {loadingAI ? "AI กำลังปรับ…" : "✨ AI ปรับให้วันนี้"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRoutine({ ...selectedRoutine })}
                  className="rounded-full bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                >
                  แก้ไข
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
