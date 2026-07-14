"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { fileToDataUrl } from "@/lib/storage";
import { createHistoryItem, loadHistoryItemById, saveHistoryItems } from "@/lib/cloudHistory";
import { readDraftIntakeNote } from "@/lib/upload/draftIntakeNote";
import type { PainLog, PainAnalysisResult, PainSide, PainTriYesNo, PainRiskLevel, PainTrainingImpact } from "@/types/pain";

// ── status choice ────────────────────────────────────────────────────────────

type PainStatusChoice = "active_pain" | "improving" | "cleared_light" | "cleared_normal";

const STATUS_OPTIONS: { value: PainStatusChoice; label: string; emoji: string; desc: string }[] = [
  { value: "active_pain",    label: "ยังเจ็บอยู่",          emoji: "🔴", desc: "ยังมีอาการอยู่" },
  { value: "improving",      label: "ดีขึ้น แต่ยังระวัง",   emoji: "🟡", desc: "ดีขึ้นแต่ยังไม่ 100%" },
  { value: "cleared_light",  label: "กลับมาเบา ๆ ได้",      emoji: "🟢", desc: "กลับมาวิ่งเบา ๆ ได้" },
  { value: "cleared_normal", label: "กลับมาปกติแล้ว",       emoji: "✅", desc: "หายสนิท ซ้อมได้ตามแผน" },
];

// ── form field options ───────────────────────────────────────────────────────

const COMMON_LOCATIONS = ["เข่า", "ข้อเท้า", "น่อง", "สะโพก", "หลัง", "เท้า", "หัวเข่า", "ขาหนีบ"];

const SIDE_OPTIONS: { value: PainSide; label: string }[] = [
  { value: "left",    label: "ซ้าย" },
  { value: "right",   label: "ขวา" },
  { value: "both",    label: "ทั้งสองข้าง" },
  { value: "unknown", label: "ไม่แน่ใจ" },
];

const STARTED_WHEN_OPTIONS = [
  { value: "before_run",   label: "ก่อนวิ่ง" },
  { value: "during_run",   label: "ระหว่างวิ่ง" },
  { value: "after_run",    label: "หลังวิ่ง" },
  { value: "next_morning", label: "เช้าวันถัดไป" },
  { value: "unknown",      label: "ไม่แน่ใจ" },
];

const PAIN_TYPE_OPTIONS = [
  { value: "dull",    label: "ตื้อๆ" },
  { value: "sharp",   label: "แหลมคม" },
  { value: "tight",   label: "ตึง" },
  { value: "numb",    label: "ชา" },
  { value: "swollen", label: "บวม" },
  { value: "other",   label: "อื่นๆ" },
];

const PAINFUL_WHEN_OPTIONS = [
  { value: "walking",        label: "เดิน" },
  { value: "stairs",         label: "ขึ้นลงบันได" },
  { value: "running",        label: "วิ่ง" },
  { value: "weight_bearing", label: "รับน้ำหนัก" },
  { value: "stretching",     label: "ยืด" },
  { value: "resting",        label: "นั่งพัก" },
];

const TRI_OPTIONS: { value: PainTriYesNo; label: string }[] = [
  { value: "yes",     label: "ใช่" },
  { value: "no",      label: "ไม่มี" },
  { value: "unknown", label: "ไม่แน่ใจ" },
];

const BEAR_WEIGHT_OPTIONS: { value: PainTriYesNo; label: string }[] = [
  { value: "yes",     label: "รับได้ปกติ" },
  { value: "no",      label: "รับไม่ได้" },
  { value: "unknown", label: "ไม่แน่ใจ" },
];

// ── helpers ──────────────────────────────────────────────────────────────────

function riskColor(risk: PainRiskLevel) {
  if (risk === "high")   return "border-rm-stop/30 bg-rm-stop-soft";
  if (risk === "medium") return "border-rm-caution/30 bg-rm-caution-soft";
  return "border-rm-primary/25 bg-rm-primary-soft";
}

function riskLabel(risk: PainRiskLevel) {
  if (risk === "high")   return "ต้องระวังสูง";
  if (risk === "medium") return "ควรระวัง";
  return "ระดับต่ำ";
}

function impactLabel(impact: PainTrainingImpact) {
  if (impact === "seek_professional") return "ปรึกษาผู้เชี่ยวชาญก่อนซ้อม";
  if (impact === "rest")              return "พักทั้งหมด";
  if (impact === "reduce_load")       return "ลดปริมาณซ้อม 24–48 ชม.";
  return "Easy run ได้ถ้าอาการไม่แย่ลง";
}

function submitLabel(choice: PainStatusChoice): string {
  if (choice === "cleared_normal") return "บันทึกว่ากลับมาปกติแล้ว";
  if (choice === "cleared_light")  return "บันทึกว่ากลับมาเบา ๆ ได้";
  return "บันทึกและปรับคำแนะนำวันนี้";
}

// ── component ────────────────────────────────────────────────────────────────

function PainPageContent() {
  const searchParams = useSearchParams();
  const fromId = searchParams.get("from");

  // status selector
  const [painStatusChoice, setPainStatusChoice] = useState<PainStatusChoice>("active_pain");

  // full-form fields (used for active_pain / improving)
  const [painLocation, setPainLocation] = useState("");
  const [painSide, setPainSide] = useState<PainSide>("unknown");
  const [painLevel, setPainLevel] = useState<number>(3);
  const [startedWhen, setStartedWhen] = useState("unknown");
  const [painType, setPainType] = useState<string[]>([]);
  const [painfulWhen, setPainfulWhen] = useState<string[]>([]);
  const [swellingOrRedness, setSwellingOrRedness] = useState<PainTriYesNo>("unknown");
  const [canBearWeight, setCanBearWeight] = useState<PainTriYesNo>("unknown");
  const [notes, setNotes] = useState("");

  // image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // page state
  const [prefillComplete, setPrefillComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PainAnalysisResult | null>(null);
  const [savedStatus, setSavedStatus] = useState<PainStatusChoice | null>(null);

  const prefilling = fromId !== null && !prefillComplete;
  // Consumed once per component instance and cached in a ref (rather than re-read from
  // sessionStorage each time) so a React Strict Mode double-invoke of the reset effect
  // below can't race itself — the second invocation would otherwise find the key already
  // removed by the first and clobber it back to "".
  const consumedDraftNoteRef = useRef<string | null | undefined>(undefined);

  // Prefill from existing pain log when ?from=[id] is present
  useEffect(() => {
    if (!fromId) {
      if (consumedDraftNoteRef.current === undefined) {
        consumedDraftNoteRef.current = readDraftIntakeNote("pain");
      }
      const draftNote = consumedDraftNoteRef.current;
      queueMicrotask(() => {
        setPainStatusChoice("active_pain");
        setPainLocation("");
        setPainSide("unknown");
        setPainLevel(3);
        setStartedWhen("unknown");
        setPainType([]);
        setPainfulWhen([]);
        setSwellingOrRedness("unknown");
        setCanBearWeight("unknown");
        setNotes(draftNote ?? "");
        setImageFile(null);
        setImagePreview(null);
        setResult(null);
        setSavedStatus(null);
        setError("");
        setPrefillComplete(false);
      });
      return;
    }
    queueMicrotask(() => setPrefillComplete(false));
    loadHistoryItemById(fromId).then((res) => {
      if (res.ok) {
        const log = res.item.data as PainLog;
        if (log?.recoveryStatus) setPainStatusChoice(log.recoveryStatus);
        else if (log?.resolved || log?.status === "resolved") setPainStatusChoice("cleared_normal");
        if (log?.painLocation) setPainLocation(log.painLocation);
        if (log?.painSide)     setPainSide(log.painSide);
        if (log?.painLevel != null) setPainLevel(log.painLevel);
        if (log?.startedWhen) setStartedWhen(log.startedWhen);
        if (Array.isArray(log?.painType))    setPainType(log.painType);
        if (Array.isArray(log?.painfulWhen)) setPainfulWhen(log.painfulWhen);
        if (log?.swellingOrRedness) setSwellingOrRedness(log.swellingOrRedness);
        if (log?.canBearWeight)     setCanBearWeight(log.canBearWeight);
        if (log?.notes) setNotes(log.notes);
      }
      setPrefillComplete(true);
    });
  }, [fromId]);

  function toggleMulti(list: string[], value: string, setter: (v: string[]) => void) {
    setter(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  async function handleImageChange(file: File | null) {
    setImageFile(file);
    if (file) {
      const url = await fileToDataUrl(file);
      setImagePreview(url);
    } else {
      setImagePreview(null);
    }
  }

  // ── submit ──────────────────────────────────────────────────────────────────

  async function submit(e: React.FormEvent) {
    e.preventDefault();

    // Location required only for active/improving
    const needsLocation = painStatusChoice === "active_pain" || painStatusChoice === "improving";
    if (needsLocation && !painLocation.trim()) {
      setError("กรุณาระบุตำแหน่งที่เจ็บ");
      return;
    }

    setError("");
    setSubmitting(true);
    setResult(null);
    setSavedStatus(null);

    try {
      const now = new Date().toISOString();
      let savedAnalysis: PainAnalysisResult;
      let logResolved: boolean;
      let logPainLevel: number;
      let logNotes: string | undefined;

      if (painStatusChoice === "cleared_normal") {
        // No AI call — write directly with safe defaults
        savedAnalysis = {
          riskLevel: "low",
          trainingImpact: "run_ok_easy",
          coachAdvice: "บันทึกว่ากลับมาปกติแล้ว RunMate จะไม่ใช้อาการนี้เป็นตัวบล็อกซ้อม แต่ยังดู sleep/load/recovery อยู่",
          redFlags: [],
        };
        logResolved = true;
        logPainLevel = 0;
        logNotes = notes.trim() || undefined;
      } else if (painStatusChoice === "cleared_light") {
        savedAnalysis = {
          riskLevel: "low",
          trainingImpact: "run_ok_easy",
          coachAdvice: "เริ่มกลับมาวิ่ง easy ได้ แต่ยังไม่กด pace หรือวิ่ง interval ค่อย ๆ เพิ่มโหลดแบบคุมความรู้สึก",
          redFlags: [],
        };
        logResolved = true;
        logPainLevel = 0;
        logNotes = notes.trim() || undefined;
      } else {
        // active_pain or improving → call AI
        const imageDataUrl = imageFile ? await fileToDataUrl(imageFile) : undefined;
        const res = await fetch("/api/analyze-pain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            formData: { painLocation, painSide, painLevel, startedWhen, painType, painfulWhen, swellingOrRedness, canBearWeight, notes },
            imageDataUrl,
          }),
        });
        if (!res.ok) throw new Error("วิเคราะห์ไม่สำเร็จ");
        const json = await res.json() as { ok: boolean; data: PainAnalysisResult };
        if (!json.ok || !json.data) throw new Error("วิเคราะห์ไม่สำเร็จ");
        savedAnalysis = json.data;
        logResolved = false;
        logPainLevel = painLevel;
        logNotes = notes.trim() || undefined;
      }

      const effectiveLocation = painLocation.trim() || "ไม่ระบุ";

      const painLog: PainLog = {
        painLocation: effectiveLocation,
        painSide,
        painLevel: logPainLevel,
        startedWhen,
        painType,
        painfulWhen,
        swellingOrRedness,
        canBearWeight,
        notes: logNotes,
        riskLevel: savedAnalysis.riskLevel,
        trainingImpact: savedAnalysis.trainingImpact,
        coachAdvice: savedAnalysis.coachAdvice,
        redFlags: savedAnalysis.redFlags,
        createdAt: now,
        resolved: logResolved,
        status: logResolved ? "resolved" : "active",
        resolvedAt: logResolved ? now : undefined,
        recoveryStatus: painStatusChoice,
      };

      const item = createHistoryItem("pain", painLog, now);
      const saveResult = await saveHistoryItems([item]);
      if (!saveResult.ok) throw new Error(saveResult.error ?? "บันทึกไม่สำเร็จ");

      setResult(savedAnalysis);
      setSavedStatus(painStatusChoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกอาการเจ็บไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPainStatusChoice("active_pain");
    setPainLocation("");
    setPainSide("unknown");
    setPainLevel(3);
    setStartedWhen("unknown");
    setPainType([]);
    setPainfulWhen([]);
    setSwellingOrRedness("unknown");
    setCanBearWeight("unknown");
    setNotes("");
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setSavedStatus(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  if (prefilling) {
    return (
      <AppShell title={fromId ? "อัปเดตอาการ" : "แจ้งอาการเจ็บ"} subtitle="กำลังโหลดข้อมูล..." medicalDisclaimer>
        <section className="card p-5 text-sm text-rm-muted">กำลังโหลดข้อมูล...</section>
      </AppShell>
    );
  }

  // ── success views ────────────────────────────────────────────────────────────

  if (result && savedStatus === "cleared_normal") {
    return (
      <AppShell title="อัปเดตอาการ" subtitle="บันทึกสถานะการฟื้นตัว" medicalDisclaimer>
        <div className="card rounded-2xl border border-rm-primary/25 bg-rm-primary-soft p-5 space-y-3" data-testid="cleared-normal-success">
          <p className="text-base font-bold text-rm-primary-strong">กลับมาปกติแล้ว ✅</p>
          <p className="text-sm leading-6 text-rm-text">
            ดีมาก RunMate จะไม่ใช้อาการนี้เป็นตัวบล็อกซ้อมหนักอีกต่อไป
            แต่ยังดู sleep / load / recovery อยู่ตามปกติ
          </p>
          <p className="text-xs text-rm-muted leading-5">
            สัญญาณ Today จะแสดง <strong>ไม่มีเจ็บ</strong> ตั้งแต่รอบข้อมูลถัดไป
          </p>
          <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
            รายงานอาการใหม่
          </button>
        </div>
      </AppShell>
    );
  }

  if (result && savedStatus === "cleared_light") {
    return (
      <AppShell title="อัปเดตอาการ" subtitle="บันทึกสถานะการฟื้นตัว" medicalDisclaimer>
        <div className="card rounded-2xl border border-rm-caution/30 bg-rm-caution-soft p-5 space-y-3">
          <p className="text-base font-bold text-rm-caution">กลับมาเบา ๆ ได้ 🟢</p>
          <p className="text-sm leading-6 text-rm-text">
            {result.coachAdvice}
          </p>
          <p className="text-xs text-rm-muted leading-5">
            วันนี้สัญญาณ Today จะแสดง <strong>เบา ๆ ได้</strong> — ยังงด interval และ tempo
          </p>
          <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
            รายงานอาการใหม่
          </button>
        </div>
      </AppShell>
    );
  }

  if (result && savedStatus) {
    return (
      <AppShell title={fromId ? "อัปเดตอาการ" : "แจ้งอาการเจ็บ"} subtitle="ประเมินผลกระทบต่อการซ้อม · ไม่ใช่การวินิจฉัยทางการแพทย์" medicalDisclaimer>
        <div className={`card rounded-2xl border p-5 space-y-3 ${riskColor(result.riskLevel)}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-rm-text">บันทึกอาการเจ็บแล้ว</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${result.riskLevel === "high" ? "bg-rm-stop-soft text-rm-stop" : result.riskLevel === "medium" ? "bg-rm-caution-soft text-rm-caution" : "bg-rm-primary-soft text-rm-primary-strong"}`}>
              {riskLabel(result.riskLevel)}
            </span>
          </div>
          <div className="rounded-xl bg-white/60 px-3 py-2.5">
            <p className="text-[11px] text-rm-muted/80">ผลกระทบต่อการซ้อม</p>
            <p className="text-sm font-semibold text-rm-text">{impactLabel(result.trainingImpact)}</p>
          </div>
          <p className="text-sm leading-6 text-slate-700">{result.coachAdvice}</p>
          {result.redFlags.length > 0 && (
            <div className="rounded-xl bg-rm-stop-soft px-3 py-2.5 space-y-1">
              <p className="text-xs font-bold text-rm-stop">สัญญาณที่ควรระวัง</p>
              {result.redFlags.map((f, i) => <p key={i} className="text-xs text-rm-stop">· {f}</p>)}
            </div>
          )}
          <p className="text-[11px] text-rm-muted/80 leading-4">
            รูปช่วยบอกตำแหน่งได้ แต่คำแนะนำนี้ไม่ใช่การวินิจฉัยทางการแพทย์
          </p>
          <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
            รายงานอาการใหม่
          </button>
        </div>
      </AppShell>
    );
  }

  // ── form ─────────────────────────────────────────────────────────────────────

  const showFullForm  = painStatusChoice === "active_pain" || painStatusChoice === "improving";
  const showLightForm = painStatusChoice === "cleared_light";
  const showNormalCard = painStatusChoice === "cleared_normal";

  return (
    <AppShell
      title={fromId ? "อัปเดตอาการ" : "แจ้งอาการเจ็บ"}
      subtitle="ประเมินผลกระทบต่อการซ้อม · ไม่ใช่การวินิจฉัยทางการแพทย์"
      medicalDisclaimer
    >
      <form onSubmit={submit} className="space-y-4">

        {/* ── Status selector (always visible) ─────────────────────────── */}
        <div className="card p-4 space-y-3" data-testid="pain-status-selector">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-rm-muted">สถานะอาการตอนนี้</p>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPainStatusChoice(opt.value)}
                className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  painStatusChoice === opt.value
                    ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface"
                    : "border-rm-border text-rm-muted hover:border-rm-primary/40 bg-rm-surface"
                }`}
              >
                <span className="block text-sm font-semibold">{opt.emoji} {opt.label}</span>
                <span className={`block text-[11px] mt-0.5 ${painStatusChoice === opt.value ? "text-rm-surface/70" : "text-rm-muted"}`}>{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── cleared_normal: calm confirmation card ────────────────────── */}
        {showNormalCard && (
          <div className="card rounded-2xl border border-rm-primary/25 bg-rm-primary-soft/60 p-4 space-y-2" data-testid="cleared-normal-info">
            <p className="text-sm font-semibold text-rm-primary-strong">
              ดีมาก ถ้ากลับมาปกติแล้ว RunMate จะไม่ใช้ pain เป็นตัวบล็อกซ้อมหนัก
            </p>
            <p className="text-xs leading-5 text-rm-muted">
              แต่ยังดู sleep / load / recovery อยู่ตามปกติ — ถ้าอาการกลับมาให้รายงานใหม่ได้เลย
            </p>
          </div>
        )}

        {/* ── cleared_light: brief note card ───────────────────────────── */}
        {showLightForm && (
          <div className="card rounded-2xl border border-rm-caution/25 bg-rm-caution-soft/60 p-4 space-y-1">
            <p className="text-sm font-semibold text-rm-caution">
              เริ่มกลับมาเบา ๆ ได้ — ยังงด interval และ tempo
            </p>
            <p className="text-xs leading-5 text-rm-muted">
              RunMate จะปรับ loadTarget เป็น easy และยังจับตา recovery อยู่
            </p>
          </div>
        )}

        {/* ── Full form (active_pain / improving) ──────────────────────── */}
        {showFullForm && (
          <>
            {/* Image upload (optional) */}
            <div className="card p-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-rm-muted">รูปบริเวณที่เจ็บ <span className="normal-case font-normal text-rm-muted/80">(ถ้ามี)</span></p>
              <label className={`flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors ${imageFile ? "border-rm-recovery bg-rm-recovery-soft/40" : "border-rm-border bg-rm-surface-soft hover:border-rm-primary/40 hover:bg-rm-surface"}`}>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => void handleImageChange(e.target.files?.[0] ?? null)}
                />
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview} alt="ตัวอย่าง" className="max-h-32 rounded-xl object-contain" />
                ) : (
                  <>
                    <span className="text-2xl">📷</span>
                    <p className="text-xs text-rm-muted">กดเพื่อเลือกรูป (ไม่บังคับ)</p>
                  </>
                )}
              </label>
              {imageFile && (
                <button type="button" onClick={() => void handleImageChange(null)} className="text-xs text-rm-muted/80 underline underline-offset-2">
                  ลบรูป
                </button>
              )}
            </div>

            {/* Location */}
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-rm-muted">
                ตำแหน่งที่เจ็บ
                {painStatusChoice === "improving" && <span className="normal-case font-normal text-rm-muted/80"> (ถ้ามี)</span>}
              </p>
              <input
                className="control"
                placeholder="เช่น เข่าซ้าย, น่องขวา, ข้อเท้า"
                value={painLocation}
                onChange={(e) => setPainLocation(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {COMMON_LOCATIONS.map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    onClick={() => setPainLocation(loc)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${painLocation === loc ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface" : "border-rm-border text-rm-muted hover:border-rm-primary/40"}`}
                  >
                    {loc}
                  </button>
                ))}
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-rm-muted">ข้าง</p>
                <div className="grid grid-cols-4 gap-2">
                  {SIDE_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setPainSide(opt.value)}
                      className={`rounded-xl border py-2 text-xs font-semibold ${painSide === opt.value ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface" : "border-rm-border text-rm-muted"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Pain level */}
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-rm-muted">ระดับความเจ็บปวด</p>
                <span className={`text-2xl font-bold ${painLevel >= 7 ? "text-rm-stop" : painLevel >= 4 ? "text-rm-caution" : "text-rm-primary-strong"}`}>{painLevel}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={painLevel}
                onChange={(e) => setPainLevel(Number(e.target.value))}
                className="w-full accent-[#42677f]"
                title="ระดับความเจ็บปวด 0-10"
                aria-label="ระดับความเจ็บปวด"
              />
              <div className="flex justify-between text-[11px] text-rm-muted/80">
                <span>0 — ไม่เจ็บ</span>
                <span>5 — ปานกลาง</span>
                <span>10 — ทนไม่ได้</span>
              </div>
            </div>

            {/* Pain type + started when */}
            <div className="card p-4 space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.15em] text-rm-muted">ลักษณะอาการ <span className="normal-case font-normal text-rm-muted/80">(เลือกได้หลายข้อ)</span></p>
                <div className="flex flex-wrap gap-2">
                  {PAIN_TYPE_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button"
                      onClick={() => toggleMulti(painType, opt.value, setPainType)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${painType.includes(opt.value) ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface" : "border-rm-border text-rm-muted hover:border-rm-primary/40"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-rm-muted">เริ่มเจ็บตอนไหน</p>
                <div className="flex flex-wrap gap-2">
                  {STARTED_WHEN_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setStartedWhen(opt.value)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${startedWhen === opt.value ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface" : "border-rm-border text-rm-muted hover:border-rm-primary/40"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Painful when */}
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-rm-muted">เจ็บเมื่อ <span className="normal-case font-normal text-rm-muted/80">(เลือกได้หลายข้อ)</span></p>
              <div className="flex flex-wrap gap-2">
                {PAINFUL_WHEN_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button"
                    onClick={() => toggleMulti(painfulWhen, opt.value, setPainfulWhen)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${painfulWhen.includes(opt.value) ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface" : "border-rm-border text-rm-muted hover:border-rm-primary/40"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Swelling + bear weight */}
            <div className="card p-4 space-y-4">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-rm-muted">บวมหรือแดง</p>
                <div className="grid grid-cols-3 gap-2">
                  {TRI_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setSwellingOrRedness(opt.value)}
                      className={`rounded-xl border py-2 text-xs font-semibold ${swellingOrRedness === opt.value ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface" : "border-rm-border text-rm-muted"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-rm-muted">รับน้ำหนักได้ไหม</p>
                <div className="grid grid-cols-3 gap-2">
                  {BEAR_WEIGHT_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setCanBearWeight(opt.value)}
                      className={`rounded-xl border py-2 text-xs font-semibold ${canBearWeight === opt.value ? "border-rm-primary-strong bg-rm-primary-strong text-rm-surface" : "border-rm-border text-rm-muted"}`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Notes — visible for all statuses */}
        <div className="card p-4 space-y-2">
          <p className="text-xs font-semibold text-rm-muted">
            {showLightForm ? "ยังรู้สึกอะไรอยู่ไหม" : "หมายเหตุเพิ่มเติม"}
            <span className="font-normal text-rm-muted/80"> (ถ้ามี)</span>
          </p>
          <textarea
            className="control min-h-[70px]"
            data-testid="pain-notes-input"
            placeholder={
              showNormalCard ? "บันทึกสั้น ๆ ถ้าอยากจดไว้..."
              : showLightForm ? "เช่น ยังตึงเล็กน้อยตอนเช้า แต่ดีขึ้นเรื่อย ๆ"
              : "เช่น เริ่มเจ็บหลังวิ่ง tempo เมื่อวาน, มีประวัติบาดเจ็บบริเวณนี้ก่อนหน้า"
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-2xl bg-rm-stop-soft p-3 text-sm font-semibold text-rm-stop">{error}</p>
        )}

        <LoadingButton
          type="submit"
          loading={submitting}
          loadingText="กำลังบันทึก..."
          className="btn-primary w-full py-3 text-sm"
          data-testid="pain-submit-btn"
        >
          {submitLabel(painStatusChoice)}
        </LoadingButton>

        {!submitting && (
          <p className="mt-2 text-center text-xs text-rm-muted font-medium animate-fadeIn" data-testid="submit-helper-copy">
            ข้อมูลนี้จะใช้ปรับ Today, Coach และ Race plan วันนี้
          </p>
        )}
        {submitting && showFullForm && (
          <p className="text-center text-xs text-rm-muted/80 mt-2">AI กำลังประเมินอาการ กรุณารอสักครู่…</p>
        )}
      </form>
    </AppShell>
  );
}

export default function PainPage() {
  return (
    <Suspense fallback={
      <AppShell title="วิเคราะห์อาการเจ็บ" subtitle="กำลังโหลด..." medicalDisclaimer>
        <section className="card p-5 text-sm text-rm-muted">กำลังโหลด...</section>
      </AppShell>
    }>
      <PainPageContent />
    </Suspense>
  );
}
