"use client";

import { useState, useEffect } from "react";
import { loadRoutinesFromSupabase, saveRoutineToSupabase, deleteRoutineFromSupabase, logCompletedStrength, DEFAULT_ROUTINES } from "@/lib/strength";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import type { StrengthRoutine, AIPrescription, StrengthExercise } from "@/types/strength";

function getShortName(r: StrengthRoutine) {
  if (r.id === "recovery") return "Recovery";
  if (r.id === "fullbody") return "Full Body";
  if (r.id === "core") return "Core & Abs";
  return r.name;
}

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

export function StrengthRoutineManager() {
  const [routines, setRoutines] = useState<StrengthRoutine[]>([]);
  const [selectedRoutine, setSelectedRoutine] = useState<StrengthRoutine | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<StrengthRoutine | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [context, setContext] = useState<CoachContext | null>(null);
  const [prescription, setPrescription] = useState<AIPrescription | null>(null);

  // States for loaders/notifications
  const [loading, setLoading] = useState(true);
  const [loadingAI, setLoadingAI] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [logging, setLogging] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    refreshData();
    buildCoachContextFromSupabase().then((ctx) => setContext(ctx));
  }, []);

  async function refreshData() {
    setLoading(true);
    try {
      const data = await loadRoutinesFromSupabase();
      setRoutines(data);
      if (data.length > 0) {
        // Keep selected routine if it still exists
        setSelectedRoutine((prev) => {
          const match = prev ? data.find((r) => r.id === prev.id) : null;
          return match || data[0];
        });
      } else {
        setSelectedRoutine(null);
      }
    } catch {
      setError("โหลดข้อมูลเทมเพลตล้มเหลว");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    const target = editingRoutine;
    if (!target || !target.name.trim()) {
      setError("กรุณากรอกชื่อโปรแกรม");
      return;
    }
    setSaving(true);
    setError("");
    const res = await saveRoutineToSupabase(target);
    setSaving(false);
    if (res.ok) {
      setFeedback("บันทึกรูทีนเวทเรียบร้อยแล้ว");
      setEditingRoutine(null);
      setIsAdding(false);
      refreshData();
      setTimeout(() => setFeedback(""), 3000);
    } else {
      setError(res.error ?? "บันทึกไม่สำเร็จ");
    }
  }

  async function handleDelete(routine: StrengthRoutine) {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบโปรแกรม "${routine.name}"?`)) return;
    setDeleting(true);
    setError("");
    const res = await deleteRoutineFromSupabase(routine.id);
    setDeleting(false);
    if (res.ok) {
      setFeedback("ลบโปรแกรมเรียบร้อยแล้ว");
      refreshData();
      setTimeout(() => setFeedback(""), 3000);
    } else {
      setError(res.error ?? "ลบโปรแกรมไม่สำเร็จ");
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
    setLogging(true);
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

    setLogging(false);
    if (res.ok) {
      setFeedback("🏋️ บันทึกการฝึกซ้อมวันนี้สำเร็จแล้ว!");
      setPrescription(null);
      setTimeout(() => setFeedback(""), 5000);
    } else {
      setError(res.error ?? "บันทึกการฝึกซ้อมไม่สำเร็จ");
    }
  }

  function handleStartAdd() {
    setIsAdding(true);
    setEditingRoutine({
      id: `custom-${Date.now()}`,
      name: "",
      description: "",
      warmupMin: 5,
      cooldownMin: 5,
      exercises: [
        { name: "Squats", sets: 3, reps: "12", restSec: 45 }
      ]
    });
  }

  function handleUpdateExercise(index: number, key: keyof StrengthExercise, value: string | number | undefined) {
    if (!editingRoutine) return;
    const updatedExercises = [...editingRoutine.exercises];
    updatedExercises[index] = { ...updatedExercises[index], [key]: value };
    setEditingRoutine({ ...editingRoutine, exercises: updatedExercises });
  }

  function handleAddExercise() {
    if (!editingRoutine) return;
    setEditingRoutine({
      ...editingRoutine,
      exercises: [...editingRoutine.exercises, { name: "", sets: 3, reps: "10", restSec: 45 }]
    });
  }

  function handleRemoveExercise(index: number) {
    if (!editingRoutine || editingRoutine.exercises.length <= 1) return;
    setEditingRoutine({
      ...editingRoutine,
      exercises: editingRoutine.exercises.filter((_, i) => i !== index)
    });
  }

  const isDefaultRoutine = (id: string) => DEFAULT_ROUTINES.some((d) => d.id === id);

  if (loading) {
    return (
      <section className="card p-5 text-sm text-slate-500">กำลังโหลดโปรแกรมเวท...</section>
    );
  }

  if (editingRoutine) {
    return (
      <section className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#17201d]">
              {isAdding ? "สร้างโปรแกรมเวทใหม่" : `แก้ไข: ${editingRoutine.name}`}
            </h3>
            <p className="text-xs text-slate-500">ปรับเปลี่ยนโครงสร้างและจำนวนครั้ง</p>
          </div>
          {!isAdding && !isDefaultRoutine(editingRoutine.id) && (
            <button
              type="button"
              onClick={() => handleDelete(editingRoutine)}
              disabled={deleting}
              className="text-xs font-bold text-red-600 hover:underline"
            >
              {deleting ? "กำลังลบ..." : "ลบโปรแกรมนี้"}
            </button>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">ชื่อโปรแกรม</label>
            <input
              className="control font-bold"
              placeholder="เช่น ขาและแกนกลางลำตัว"
              value={editingRoutine.name}
              onChange={(e) => setEditingRoutine({ ...editingRoutine, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">คำอธิบาย</label>
            <input
              className="control"
              placeholder="คำแนะนำหรือลักษณะโปรแกรม"
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
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-500">ท่าออกกำลังกาย</label>
              <button
                type="button"
                onClick={handleAddExercise}
                className="text-xs text-[#42677f] font-bold hover:underline"
              >
                + เพิ่มท่า
              </button>
            </div>

            {editingRoutine.exercises.map((ex, index) => (
              <div key={index} className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-2 relative">
                {editingRoutine.exercises.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveExercise(index)}
                    className="absolute right-2 top-2 text-slate-400 hover:text-red-500 text-xs"
                    title="ลบท่านี้"
                  >
                    ✕
                  </button>
                )}
                <input
                  className="control font-bold pr-6 text-sm"
                  value={ex.name}
                  onChange={(e) => handleUpdateExercise(index, "name", e.target.value)}
                  placeholder="ชื่อท่า เช่น Bodyweight Squats"
                  required
                />
                <div className="grid grid-cols-3 gap-2">
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
                    <span className="text-[10px] text-slate-400">ครั้ง/เซ็ต</span>
                    <input
                      className="control text-xs"
                      value={ex.reps}
                      onChange={(e) => handleUpdateExercise(index, "reps", e.target.value)}
                      placeholder="เช่น 12"
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
              disabled={saving}
              onClick={handleSave}
              className="btn-primary py-2.5 text-sm"
            >
              {saving ? "กำลังบันทึก…" : "บันทึกรูทีน"}
            </button>
            <button
              type="button"
              onClick={() => { setEditingRoutine(null); setIsAdding(false); }}
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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#17201d]">รูทีนเวท</h2>
          <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
            จัดการรูทีนและให้ AI ปรับตามสภาพร่างกายวันนี้
          </p>
        </div>
        <button
          type="button"
          onClick={handleStartAdd}
          className="rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 whitespace-nowrap flex-shrink-0"
        >
          + เพิ่มรูทีน
        </button>
      </div>

      {feedback && <p className="text-xs font-semibold text-green-700 bg-green-50 p-3 rounded-2xl">{feedback}</p>}
      {error && <p className="text-xs font-semibold text-red-600 bg-red-50 p-3 rounded-2xl">{error}</p>}

      {/* Routine Selector Dropdown/Tabs */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          {routines.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setSelectedRoutine(r);
                setPrescription(null);
              }}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all border ${selectedRoutine?.id === r.id ? "bg-[#17201d] text-white border-[#17201d]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {getShortName(r)}
            </button>
          ))}
        </div>

        {selectedRoutine && (
          <div className="space-y-4">
            <div className="flex justify-between items-center gap-4">
              <div>
                <h4 className="text-base font-bold text-[#17201d]">{selectedRoutine.name}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{selectedRoutine.description}</p>
                <p className="text-xs text-slate-400 mt-1.5">
                  Warm-up {selectedRoutine.warmupMin} นาที · Cool down {selectedRoutine.cooldownMin} นาที
                </p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setEditingRoutine({ ...selectedRoutine })}
                  className="text-xs text-[#42677f] font-bold hover:underline"
                >
                  แก้ไข
                </button>
                {!isDefaultRoutine(selectedRoutine.id) && (
                  <>
                    <span className="text-slate-200">|</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(selectedRoutine)}
                      disabled={deleting}
                      className="text-xs text-red-600 font-bold hover:underline"
                    >
                      {deleting ? "กำลังลบ..." : "ลบ"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* List Exercises */}
            <div className="space-y-2 bg-slate-50/50 rounded-2xl p-3 border border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">ท่าในรูทีน</p>
              <div className="divide-y divide-slate-100">
                {selectedRoutine.exercises.map((ex, i) => (
                  <div key={i} className="text-xs flex justify-between items-center py-2">
                    <p className="font-semibold text-slate-700">{ex.name}</p>
                    <p className="text-slate-500 font-medium shrink-0 ml-2">
                      {formatRepsDuration(ex)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Prescription Display */}
            {prescription ? (
              <div className="rounded-2xl border border-green-200 bg-[#f5faf7] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-[10px] font-bold">AI Prescription</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${prescription.intensity === "easy" ? "bg-green-100 text-green-700" : prescription.intensity === "hard" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                    ระดับ {prescription.intensity}
                  </span>
                </div>
                <h5 className="text-sm font-bold text-[#17201d]">{prescription.recommendedTitle}</h5>
                <p className="text-xs text-slate-600 leading-relaxed"><strong>คำวิเคราะห์จากโค้ช AI:</strong> {prescription.reason}</p>

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

                <div className="flex flex-col gap-2 sm:flex-row pt-1">
                  <button
                    type="button"
                    disabled={logging}
                    onClick={() => handleLogWorkout("ai_prescription")}
                    className="btn-primary flex-1 py-2.5 text-xs font-bold"
                  >
                    {logging ? "กำลังบันทึก…" : "บันทึกวันนี้"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrescription(null)}
                    className="btn-secondary flex-1 py-2.5 text-xs font-bold"
                  >
                    ใช้แผนปกติ
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={loadingAI}
                  onClick={handleAIPrescription}
                  className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  {loadingAI && <div className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-600" />}
                  {loadingAI ? "AI กำลังปรับ…" : "AI ปรับให้วันนี้"}
                </button>
                <button
                  type="button"
                  disabled={logging}
                  onClick={() => handleLogWorkout("saved_routine")}
                  className="btn-secondary flex-1 py-2.5 text-xs font-bold"
                >
                  {logging ? "กำลังบันทึก…" : "บันทึกวันนี้"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
