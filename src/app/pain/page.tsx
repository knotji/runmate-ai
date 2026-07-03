"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { fileToDataUrl } from "@/lib/storage";
import { createHistoryItem, loadHistoryItemById, saveHistoryItems } from "@/lib/cloudHistory";
import type { PainLog, PainAnalysisResult, PainSide, PainTriYesNo, PainRiskLevel, PainTrainingImpact } from "@/types/pain";

// ── form field options ───────────────────────────────────────────────────────

const COMMON_LOCATIONS = ["เข่า", "ข้อเท้า", "น่อง", "สะโพก", "หลัง", "เท้า", "หัวเข่า", "ขาหนีบ"];

const SIDE_OPTIONS: { value: PainSide; label: string }[] = [
  { value: "left",    label: "ซ้าย" },
  { value: "right",   label: "ขวา" },
  { value: "both",    label: "ทั้งสองข้าง" },
  { value: "unknown", label: "ไม่แน่ใจ" },
];

const STARTED_WHEN_OPTIONS = [
  { value: "before_run",     label: "ก่อนวิ่ง" },
  { value: "during_run",     label: "ระหว่างวิ่ง" },
  { value: "after_run",      label: "หลังวิ่ง" },
  { value: "next_morning",   label: "เช้าวันถัดไป" },
  { value: "unknown",        label: "ไม่แน่ใจ" },
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
  if (risk === "high")   return "border-red-200 bg-red-50";
  if (risk === "medium") return "border-amber-200 bg-amber-50";
  return "border-green-200 bg-[#e7efea]";
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

function cleanRoboticNotes(rawNotes: string): string {
  const parts = rawNotes.split(/\s*·\s*/);
  const cleanParts = parts.filter(p => {
    const trimmed = p.trim();
    if (!trimmed) return false;
    if (trimmed.includes("อาการหายแล้วจากหน้า Today")) return false;
    if (trimmed.includes("อาการหายแล้ว")) return false;
    if (trimmed.includes("ไม่มีอาการขณะเดินหรือวิ่งเบา")) return false;
    if (trimmed.includes("ไม่มีอาการตอนเดินหรือวิ่งเบา")) return false;
    return true;
  });
  return cleanParts.join(" · ").trim();
}

// ── component ────────────────────────────────────────────────────────────────

function PainPageContent() {
  const searchParams = useSearchParams();
  const fromId = searchParams.get("from");

  // form
  const [painLocation, setPainLocation] = useState("");
  const [painSide, setPainSide] = useState<PainSide>("unknown");
  const [painLevel, setPainLevel] = useState<number>(3);
  const [startedWhen, setStartedWhen] = useState("unknown");
  const [painType, setPainType] = useState<string[]>([]);
  const [painfulWhen, setPainfulWhen] = useState<string[]>([]);
  const [swellingOrRedness, setSwellingOrRedness] = useState<PainTriYesNo>("unknown");
  const [canBearWeight, setCanBearWeight] = useState<PainTriYesNo>("unknown");
  const [notes, setNotes] = useState("");
  const [markResolved, setMarkResolved] = useState(false);

  // image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // state
  const [prefillComplete, setPrefillComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PainAnalysisResult | null>(null);
  const [saved, setSaved] = useState(false);

  // Derive: show loading spinner while waiting for prefill (only when ?from is present)
  const prefilling = fromId !== null && !prefillComplete;

  // Prefill from existing pain log when ?from=[id] is present or reset if not
  useEffect(() => {
    if (!fromId) {
      queueMicrotask(() => {
        setPainLocation("");
        setPainSide("unknown");
        setPainLevel(3);
        setStartedWhen("unknown");
        setPainType([]);
        setPainfulWhen([]);
        setSwellingOrRedness("unknown");
        setCanBearWeight("unknown");
        setNotes("");
        setMarkResolved(false);
        setImageFile(null);
        setImagePreview(null);
        setResult(null);
        setSaved(false);
        setError("");
        setPrefillComplete(false);
      });
      return;
    }
    queueMicrotask(() => setPrefillComplete(false));
    // Do not call setState synchronously here — only in the async callback below
    loadHistoryItemById(fromId).then((res) => {
      if (res.ok) {
        const log = res.item.data as PainLog;
        if (log?.painLocation) setPainLocation(log.painLocation);
        if (log?.painSide)     setPainSide(log.painSide);
        if (log?.painLevel != null) setPainLevel(log.painLevel);
        if (log?.startedWhen) setStartedWhen(log.startedWhen);
        if (Array.isArray(log?.painType))    setPainType(log.painType);
        if (Array.isArray(log?.painfulWhen)) setPainfulWhen(log.painfulWhen);
        if (log?.swellingOrRedness) setSwellingOrRedness(log.swellingOrRedness);
        if (log?.canBearWeight)     setCanBearWeight(log.canBearWeight);
        if (log?.notes) setNotes(log.notes);
        setMarkResolved(Boolean(log?.resolved || log?.status === "resolved"));
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!painLocation.trim()) {
      setError("กรุณาระบุตำแหน่งที่เจ็บ");
      return;
    }
    setError("");
    setSubmitting(true);
    setResult(null);
    setSaved(false);

    try {
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

      const analysis = json.data;
      const hasRedFlags = analysis.redFlags.length > 0 || swellingOrRedness === "yes" || canBearWeight === "no";
      const canSaveResolved = painLevel === 0 && markResolved && !hasRedFlags;
      const savedAnalysis: PainAnalysisResult = canSaveResolved
        ? {
          riskLevel: "low",
          trainingImpact: "run_ok_easy",
          coachAdvice: "ล่าสุดบันทึกว่าอาการหายแล้ว ค่อย ๆ เพิ่มโหลดกลับแบบคุมความรู้สึก และหยุดทันทีถ้ามีอาการกลับมา",
          redFlags: [],
        }
        : analysis;
      setResult(savedAnalysis);

      // Build and save history item
      const now = new Date().toISOString();
      const painLog: PainLog = {
        painLocation: painLocation.trim(),
        painSide,
        painLevel,
        startedWhen,
        painType,
        painfulWhen,
        swellingOrRedness,
        canBearWeight,
        notes: canSaveResolved
          ? (() => {
              const cleaned = cleanRoboticNotes(notes);
              return cleaned
                ? `${cleaned} · ผู้ใช้บันทึกว่าอาการดีขึ้นแล้ว และตอนนี้ไม่มีอาการขณะเดินหรือวิ่งเบา ๆ`
                : "วันนี้ไม่มีอาการตอนเดินหรือวิ่งเบา ๆ";
            })()
          : (cleanRoboticNotes(notes) || undefined),
        riskLevel: savedAnalysis.riskLevel,
        trainingImpact: savedAnalysis.trainingImpact,
        coachAdvice: savedAnalysis.coachAdvice,
        redFlags: savedAnalysis.redFlags,
        createdAt: now,
        resolved: canSaveResolved,
        status: canSaveResolved ? "resolved" : "active",
        resolvedAt: canSaveResolved ? now : undefined,
      };

      const item = createHistoryItem("pain", painLog, now);
      const saveResult = await saveHistoryItems([item]);
      if (!saveResult.ok) throw new Error(saveResult.error ?? "บันทึกไม่สำเร็จ");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกอาการเจ็บไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setPainLocation("");
    setPainSide("unknown");
    setPainLevel(3);
    setStartedWhen("unknown");
    setPainType([]);
    setPainfulWhen([]);
    setSwellingOrRedness("unknown");
    setCanBearWeight("unknown");
    setNotes("");
    setMarkResolved(false);
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setSaved(false);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  if (prefilling) {
    return (
      <AppShell title={fromId ? "อัปเดตอาการ" : "แจ้งอาการเจ็บ"} subtitle="กำลังโหลดข้อมูล..." medicalDisclaimer>
        <section className="card p-5 text-sm text-slate-500">กำลังโหลดข้อมูล...</section>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={fromId ? "อัปเดตอาการ" : "แจ้งอาการเจ็บ"}
      subtitle="ประเมินผลกระทบต่อการซ้อม · ไม่ใช่การวินิจฉัยทางการแพทย์"
      medicalDisclaimer
    >

      {/* Result card */}
      {result && saved && (
        <div className={`card rounded-2xl border p-5 space-y-3 ${riskColor(result.riskLevel)}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#17201d]">บันทึกอาการเจ็บแล้ว</p>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${result.riskLevel === "high" ? "bg-red-100 text-red-700" : result.riskLevel === "medium" ? "bg-amber-100 text-amber-700" : "bg-[#e7efea] text-[#2a5a39]"}`}>
              {riskLabel(result.riskLevel)}
            </span>
          </div>
          <div className="rounded-xl bg-white/60 px-3 py-2.5">
            <p className="text-[11px] text-slate-400">ผลกระทบต่อการซ้อม</p>
            <p className="text-sm font-semibold text-[#17201d]">{impactLabel(result.trainingImpact)}</p>
          </div>
          <p className="text-sm leading-6 text-slate-700">{result.coachAdvice}</p>
          {result.redFlags.length > 0 && (
            <div className="rounded-xl bg-red-100/70 px-3 py-2.5 space-y-1">
              <p className="text-xs font-bold text-red-700">สัญญาณที่ควรระวัง</p>
              {result.redFlags.map((f, i) => <p key={i} className="text-xs text-red-600">· {f}</p>)}
            </div>
          )}
          <p className="text-[11px] text-slate-400 leading-4">
            รูปช่วยบอกตำแหน่งได้ แต่คำแนะนำนี้ไม่ใช่การวินิจฉัยทางการแพทย์
          </p>
          <button type="button" onClick={reset} className="btn-secondary w-full text-sm">
            รายงานอาการใหม่
          </button>
        </div>
      )}

      {!result && (
        <form onSubmit={submit} className="space-y-4">

          {/* Image upload (optional) */}
          <div className="card p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">รูปบริเวณที่เจ็บ <span className="normal-case font-normal text-slate-400">(ถ้ามี)</span></p>
            <label className={`flex min-h-[100px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors ${imageFile ? "border-[#42677f] bg-[#f5faf7]" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"}`}>
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
                  <p className="text-xs text-slate-500">กดเพื่อเลือกรูป (ไม่บังคับ)</p>
                </>
              )}
            </label>
            {imageFile && (
              <button type="button" onClick={() => void handleImageChange(null)} className="text-xs text-slate-400 underline underline-offset-2">
                ลบรูป
              </button>
            )}
            <p className="text-[11px] text-slate-400">รูปช่วยบอกตำแหน่งได้ แต่คำแนะนำนี้ไม่ใช่การวินิจฉัยทางการแพทย์</p>
          </div>

          {/* Location */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">ตำแหน่งที่เจ็บ</p>
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
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${painLocation === loc ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}
                >
                  {loc}
                </button>
              ))}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">ข้าง</p>
              <div className="grid grid-cols-4 gap-2">
                {SIDE_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setPainSide(opt.value)}
                    className={`rounded-xl border py-2 text-xs font-semibold ${painSide === opt.value ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pain level */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">ระดับความเจ็บปวด</p>
              <span className={`text-2xl font-bold ${painLevel >= 7 ? "text-red-500" : painLevel >= 4 ? "text-amber-500" : "text-[#2a5a39]"}`}>{painLevel}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={painLevel}
              onChange={(e) => {
                const next = Number(e.target.value);
                setPainLevel(next);
                if (next !== 0) setMarkResolved(false);
              }}
              className="w-full accent-[#42677f]"
            />
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>0 — ไม่เจ็บ</span>
              <span>5 — ปานกลาง</span>
              <span>10 — ทนไม่ได้</span>
            </div>
          </div>

          {painLevel === 0 && (
            <div className="space-y-2">
              <label className="flex items-start gap-3 rounded-2xl bg-[#f5faf7] p-3 text-sm text-[#17201d]">
                <input
                  type="checkbox"
                  checked={markResolved}
                  onChange={(e) => setMarkResolved(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#42677f]"
                />
                <span>
                  <span className="font-bold">ตอนนี้หายแล้ว / ไม่มีอาการตอนเดินหรือวิ่งเบา ๆ</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    ระบบจะบันทึกเป็นสถานะหายแล้ว และใช้เป็นอาการล่าสุดในการแนะนำซ้อม
                  </span>
                </span>
              </label>
              {markResolved && (
                <p className="px-3 text-xs leading-5 text-[#2e7d32] font-semibold animate-fadeIn" data-testid="resolved-helper-copy">
                  ถึงไม่มีอาการแล้ว RunMate จะยังให้กลับมาเบา ๆ ก่อน จนกว่าอาการจะนิ่งต่อเนื่อง
                </p>
              )}
            </div>
          )}

          {/* Pain type + started when */}
          <div className="card p-4 space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">ลักษณะอาการ <span className="normal-case font-normal text-slate-400">(เลือกได้หลายข้อ)</span></p>
              <div className="flex flex-wrap gap-2">
                {PAIN_TYPE_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button"
                    onClick={() => toggleMulti(painType, opt.value, setPainType)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${painType.includes(opt.value) ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">เริ่มเจ็บตอนไหน</p>
              <div className="flex flex-wrap gap-2">
                {STARTED_WHEN_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setStartedWhen(opt.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${startedWhen === opt.value ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Painful when */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">เจ็บเมื่อ <span className="normal-case font-normal text-slate-400">(เลือกได้หลายข้อ)</span></p>
            <div className="flex flex-wrap gap-2">
              {PAINFUL_WHEN_OPTIONS.map((opt) => (
                <button key={opt.value} type="button"
                  onClick={() => toggleMulti(painfulWhen, opt.value, setPainfulWhen)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${painfulWhen.includes(opt.value) ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Swelling + bear weight */}
          <div className="card p-4 space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">บวมหรือแดง</p>
              <div className="grid grid-cols-3 gap-2">
                {TRI_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setSwellingOrRedness(opt.value)}
                    className={`rounded-xl border py-2 text-xs font-semibold ${swellingOrRedness === opt.value ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">รับน้ำหนักได้ไหม</p>
              <div className="grid grid-cols-3 gap-2">
                {BEAR_WEIGHT_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => setCanBearWeight(opt.value)}
                    className={`rounded-xl border py-2 text-xs font-semibold ${canBearWeight === opt.value ? "border-[#17201d] bg-[#17201d] text-white" : "border-slate-200 text-slate-600"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="card p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500">หมายเหตุเพิ่มเติม <span className="font-normal text-slate-400">(ถ้ามี)</span></p>
            <textarea
              className="control min-h-[80px]"
              placeholder="เช่น เริ่มเจ็บหลังวิ่ง tempo เมื่อวาน, มีประวัติบาดเจ็บบริเวณนี้ก่อนหน้า"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-600">{error}</p>
          )}

          <LoadingButton
            type="submit"
            loading={submitting}
            loadingText="กำลังวิเคราะห์..."
            className="btn-primary w-full py-3 text-sm"
          >
            บันทึกและปรับคำแนะนำวันนี้
          </LoadingButton>
          {!submitting && (
            <p className="mt-2 text-center text-xs text-slate-500 font-medium animate-fadeIn" data-testid="submit-helper-copy">
              ข้อมูลนี้จะใช้ปรับ Today, Coach และ Race plan วันนี้
            </p>
          )}
          {submitting && (
            <p className="text-center text-xs text-slate-400 mt-2">AI กำลังประเมินอาการ กรุณารอสักครู่…</p>
          )}
        </form>
      )}
    </AppShell>
  );
}

export default function PainPage() {
  return (
    <Suspense fallback={
      <AppShell title="วิเคราะห์อาการเจ็บ" subtitle="กำลังโหลด..." medicalDisclaimer>
        <section className="card p-5 text-sm text-slate-500">กำลังโหลด...</section>
      </AppShell>
    }>
      <PainPageContent />
    </Suspense>
  );
}
