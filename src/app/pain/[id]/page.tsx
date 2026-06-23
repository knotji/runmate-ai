"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { loadHistoryItemById } from "@/lib/cloudHistory";
import type { PainLog, PainRiskLevel, PainTrainingImpact } from "@/types/pain";

// ── label maps ───────────────────────────────────────────────────────────────

const SIDE_LABELS: Record<string, string> = {
  left: "ซ้าย", right: "ขวา", both: "ทั้งสองข้าง", unknown: "ไม่แน่ใจ",
};
const STARTED_LABELS: Record<string, string> = {
  before_run: "ก่อนวิ่ง", during_run: "ระหว่างวิ่ง",
  after_run: "หลังวิ่ง", next_morning: "เช้าวันถัดไป", unknown: "ไม่แน่ใจ",
};
const PAIN_TYPE_LABELS: Record<string, string> = {
  dull: "ตื้อๆ", sharp: "แหลมคม", tight: "ตึง",
  numb: "ชา", swollen: "บวม", other: "อื่นๆ",
};
const PAINFUL_WHEN_LABELS: Record<string, string> = {
  walking: "เดิน", stairs: "ขึ้นลงบันได", running: "วิ่ง",
  weight_bearing: "รับน้ำหนัก", stretching: "ยืด", resting: "นั่งพัก",
};
const TRI_LABELS: Record<string, string> = { yes: "ใช่", no: "ไม่มี", unknown: "ไม่แน่ใจ" };
const BEAR_LABELS: Record<string, string> = { yes: "รับได้ปกติ", no: "รับไม่ได้", unknown: "ไม่แน่ใจ" };

function riskBadgeClass(risk: PainRiskLevel | string) {
  if (risk === "high")   return "bg-red-100 text-red-700";
  if (risk === "medium") return "bg-amber-100 text-amber-700";
  return "bg-[#e7efea] text-[#2a5a39]";
}
function cardClass(risk: PainRiskLevel | string) {
  if (risk === "high")   return "border-red-200 bg-red-50";
  if (risk === "medium") return "border-amber-200 bg-amber-50";
  return "border-[#d9e8df] bg-[#f5faf7]";
}
function riskLabel(risk: PainRiskLevel | string) {
  if (risk === "high")   return "ต้องระวังสูง";
  if (risk === "medium") return "ควรระวัง";
  return "ระดับต่ำ";
}
function impactLabel(impact: PainTrainingImpact | string) {
  if (impact === "seek_professional") return "ปรึกษาผู้เชี่ยวชาญก่อนซ้อม";
  if (impact === "rest")              return "พักทั้งหมด";
  if (impact === "reduce_load")       return "ลดปริมาณซ้อม 24–48 ชม.";
  return "Easy run ได้ถ้าอาการไม่แย่ลง";
}
function formatThaiDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("th-TH", {
    weekday: "short", day: "numeric", month: "short", year: "2-digit",
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function PainDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [painLog, setPainLog] = useState<PainLog | null>(null);
  const [loading, setLoading] = useState(true); // true by default; cleared in async callback
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) {
      return;
    }
    // Do not call setState synchronously here — only in the async callback below
    loadHistoryItemById(id).then((result) => {
      if (!result.ok) {
        setError("ไม่พบข้อมูลอาการเจ็บ");
      } else {
        const log = result.item.data as PainLog;
        if (!log?.painLocation) {
          setError("ข้อมูลอาการเจ็บไม่ครบถ้วน");
        } else {
          setPainLog(log);
        }
      }
      setLoading(false);
    });
  }, [id]);

  return (
    <AppShell title="รายละเอียดอาการเจ็บ" subtitle="บันทึกที่ผ่านมา" medicalDisclaimer>
      {loading && (
        <section className="card p-5 text-sm text-slate-500">กำลังโหลดข้อมูล...</section>
      )}

      {error && (
        <section className="card p-5 text-sm text-red-600">{error}</section>
      )}

      {painLog && !loading && (
        <>
          {/* ── Header risk card ──────────────────────────── */}
          <section className={`card rounded-2xl border p-5 space-y-3 ${cardClass(painLog.riskLevel)}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">
                  {formatThaiDate(painLog.createdAt)}
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#17201d]">
                  🩹 {painLog.painLocation}
                  {painLog.painSide && painLog.painSide !== "unknown" && (
                    <span className="ml-1.5 text-base font-normal text-slate-500">
                      ({SIDE_LABELS[painLog.painSide] ?? painLog.painSide})
                    </span>
                  )}
                </h2>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-2xl font-bold ${painLog.riskLevel === "high" ? "text-red-600" : painLog.riskLevel === "medium" ? "text-amber-600" : "text-[#2a5a39]"}`}>
                  {painLog.painLevel}<span className="text-sm font-normal">/10</span>
                </p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${riskBadgeClass(painLog.riskLevel)}`}>
                  {riskLabel(painLog.riskLevel)}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white/60 px-3 py-2.5">
              <p className="text-[11px] text-slate-400">ผลกระทบต่อการซ้อม</p>
              <p className="text-sm font-semibold text-[#17201d]">{impactLabel(painLog.trainingImpact)}</p>
            </div>

            {painLog.coachAdvice && (
              <p className="text-sm leading-6 text-slate-700">{painLog.coachAdvice}</p>
            )}

            {Array.isArray(painLog.redFlags) && painLog.redFlags.length > 0 && (
              <div className="rounded-xl bg-red-100/70 px-3 py-2.5 space-y-1">
                <p className="text-xs font-bold text-red-700">สัญญาณที่ควรระวัง</p>
                {painLog.redFlags.map((f, i) => (
                  <p key={i} className="text-xs text-red-600">· {f}</p>
                ))}
              </div>
            )}
          </section>

          {/* ── Form details ──────────────────────────────── */}
          <section className="card p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">รายละเอียดอาการ</p>

            <div className="grid grid-cols-2 gap-2">
              <DetailItem label="เริ่มเจ็บตอน" value={STARTED_LABELS[painLog.startedWhen] ?? painLog.startedWhen} />
              <DetailItem label="บวมหรือแดง" value={TRI_LABELS[painLog.swellingOrRedness] ?? painLog.swellingOrRedness} />
              <DetailItem label="รับน้ำหนัก" value={BEAR_LABELS[painLog.canBearWeight] ?? painLog.canBearWeight} />
            </div>

            {Array.isArray(painLog.painType) && painLog.painType.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1.5">ลักษณะอาการ</p>
                <div className="flex flex-wrap gap-1.5">
                  {painLog.painType.map((t) => (
                    <span key={t} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {PAIN_TYPE_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(painLog.painfulWhen) && painLog.painfulWhen.length > 0 && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1.5">เจ็บเมื่อ</p>
                <div className="flex flex-wrap gap-1.5">
                  {painLog.painfulWhen.map((w) => (
                    <span key={w} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {PAINFUL_WHEN_LABELS[w] ?? w}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {painLog.notes && (
              <div>
                <p className="text-[11px] text-slate-400 mb-1">หมายเหตุ</p>
                <p className="text-sm text-slate-700 leading-6">{painLog.notes}</p>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              รูปช่วยบอกตำแหน่งได้ แต่คำแนะนำนี้ไม่ใช่การวินิจฉัยทางการแพทย์
            </p>
          </section>

          {/* ── Actions ──────────────────────────────────── */}
          <SelfCareGuideCard painLog={painLog} />

          <div className="space-y-2">
            <Link
              href={`/pain?from=${encodeURIComponent(id)}`}
              className="btn-primary block w-full py-3 text-center text-sm"
            >
              อัปเดตอาการ
            </Link>
            <Link
              href="/pain"
              className="btn-secondary block w-full py-3 text-center text-sm"
            >
              แจ้งอาการใหม่
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
}

function SelfCareGuideCard({ painLog }: { painLog: PainLog }) {
  const guidance = buildSelfCareGuidance(painLog);

  return (
    <section className="card p-5 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Self-care</p>
        <h2 className="mt-1 text-xl font-bold text-[#17201d]">วิธีดูแลตัวเองวันนี้</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          คำแนะนำสำหรับการดูแลเบื้องต้น ไม่ใช่การวินิจฉัยทางการแพทย์
        </p>
      </div>

      <GuideBlock title="การซ้อมวันนี้" items={guidance.training} />
      <GuideBlock title="ประคบเย็น" items={guidance.coldTherapy} tone="blue" />

      {guidance.elevation.length > 0 ? (
        <GuideBlock title="ลดบวม / พยุงบริเวณที่เจ็บ" items={guidance.elevation} tone="amber" />
      ) : null}

      {guidance.mobility.length > 0 ? (
        <GuideBlock title="ขยับเบา ๆ" items={guidance.mobility} tone="green" />
      ) : null}

      {guidance.redFlags.length > 0 ? (
        <div className="rounded-2xl bg-red-50 p-4">
          <p className="text-sm font-bold text-red-700">สัญญาณที่ควรพบแพทย์/นักกายภาพ</p>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-red-700">
            {guidance.redFlags.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-[11px] leading-5 text-slate-400">
        ใช้เป็นแนวทางดูแลตัวเองและปรับโหลดซ้อมแบบระมัดระวัง หากอาการรุนแรงหรือกังวล ควรปรึกษาผู้เชี่ยวชาญ
      </p>
    </section>
  );
}

function GuideBlock({ title, items, tone = "slate" }: { title: string; items: string[]; tone?: "slate" | "blue" | "amber" | "green" }) {
  const toneClass =
    tone === "blue" ? "bg-blue-50 text-blue-800"
    : tone === "amber" ? "bg-amber-50 text-amber-800"
    : tone === "green" ? "bg-[#e7efea] text-[#2a5a39]"
    : "bg-slate-50 text-slate-700";

  return (
    <div className={`rounded-2xl p-4 ${toneClass}`}>
      <p className="text-sm font-bold">{title}</p>
      <ul className="mt-2 space-y-1 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>- {item}</li>
        ))}
      </ul>
    </div>
  );
}

function buildSelfCareGuidance(painLog: PainLog) {
  return {
    training: buildTrainingGuidance(painLog),
    coldTherapy: buildColdTherapyGuidance(painLog),
    elevation: buildElevationGuidance(painLog),
    mobility: buildMobilityGuidance(painLog),
    redFlags: buildSelfCareRedFlags(painLog),
  };
}

function buildTrainingGuidance(painLog: PainLog) {
  if (painLog.painLevel >= 7 || painLog.trainingImpact === "seek_professional") {
    return [
      "งดวิ่งวันนี้ และหลีกเลี่ยงกิจกรรมที่ลงแรงกระแทกซ้ำ",
      "ถ้าลงน้ำหนักแล้วปวด หรือเดินกะเผลก ควรให้แพทย์/นักกายภาพประเมินก่อนกลับไปวิ่ง",
    ];
  }

  if (painLog.painLevel >= 4 || painLog.trainingImpact === "reduce_load" || painLog.trainingImpact === "rest") {
    return [
      "ลดปริมาณซ้อม 24-48 ชม. และดูแนวโน้มอาการก่อนเพิ่มโหลด",
      "งด interval, tempo, hill, long run และการกระแทกซ้ำ ๆ",
      "เดินเบา ๆ หรือ low-impact ได้เฉพาะถ้าอาการไม่แย่ลงระหว่างทำ",
    ];
  }

  return [
    "ลดความเข้มวันนี้ และสังเกตอาการระหว่างวัน",
    "ถ้าเริ่มเจ็บระหว่างวิ่ง ให้เลี่ยง speedwork หรือ hard session ก่อน",
    "ถ้าอาการเพิ่มขึ้น ให้หยุดและเปลี่ยนเป็นเดินเบา ๆ หรือพัก",
  ];
}

function buildColdTherapyGuidance(painLog: PainLog) {
  const shouldUseCold =
    painLog.swellingOrRedness !== "no" ||
    ["during_run", "after_run", "next_morning"].includes(painLog.startedWhen) ||
    painLog.painfulWhen.includes("running") ||
    painLog.painfulWhen.includes("walking");

  const firstLine = shouldUseCold
    ? "ประคบเย็นหรือแช่น้ำเย็นเฉพาะจุด 10-20 นาที/ครั้ง ทุก 2-3 ชม. ถ้ายังปวดหรือบวมในช่วง 24-48 ชม. แรก"
    : "ถ้ามีปวดหลังใช้งาน ให้ประคบเย็นเฉพาะจุด 10-20 นาที/ครั้ง แล้วประเมินอาการ";

  return [
    firstLine,
    "อย่าให้น้ำแข็งสัมผัสผิวตรง ๆ ใช้ผ้าบาง ๆ คั่นไว้",
    "ไม่ควรเกิน 20 นาทีต่อครั้ง และหยุดทันทีถ้าชา แสบ หรือสีผิวเปลี่ยน",
  ];
}

function buildElevationGuidance(painLog: PainLog) {
  if (painLog.swellingOrRedness === "no") return [];
  return [
    "ยกบริเวณที่เจ็บให้สูงขึ้น 10-15 นาทีหลังทำกิจกรรม",
    "ใช้ผ้ายืดหรือ compression เบา ๆ ได้ถ้ารู้สึกสบาย",
    "อย่าพันแน่นจนชา ปวดเพิ่ม สีผิวเปลี่ยน หรือปลายเท้าเย็น",
  ];
}

function buildMobilityGuidance(painLog: PainLog) {
  if (painLog.canBearWeight !== "yes" || painLog.painLevel > 5) return [];

  const area = painLog.painLocation.toLowerCase();
  const movement =
    area.includes("ข้อเท้า") || area.includes("เท้า") ? "หมุนข้อเท้าเบา ๆ, กระดกปลายเท้า, ยกส้น/ปลายเท้าแบบไม่ฝืน"
    : area.includes("น่อง") ? "กระดกข้อเท้าเบา ๆ และ calf pump ช้า ๆ"
    : area.includes("เข่า") ? "งอ-เหยียดเข่าเบา ๆ ในช่วงที่ไม่เจ็บ และเกร็งต้นขาเบา ๆ"
    : area.includes("สะโพก") || area.includes("ขาหนีบ") ? "หมุนสะโพกเบา ๆ และขยับช่วงสะโพกในมุมที่ไม่เจ็บ"
    : "ขยับช่วงข้อรอบ ๆ บริเวณที่เจ็บแบบช้า ๆ และไม่ฝืน";

  return [
    movement,
    "ทำเฉพาะช่วงที่ไม่ปวด และหยุดถ้าอาการเพิ่มขึ้น",
    "หลีกเลี่ยงการยืดแรง ๆ เข้าไปในจุดที่เจ็บ",
  ];
}

function buildSelfCareRedFlags(painLog: PainLog) {
  const flags: string[] = [];
  const hasSharp = painLog.painType.includes("sharp");
  const hasNumb = painLog.painType.includes("numb");
  const painChangesForm =
    painLog.canBearWeight === "no" ||
    (painLog.painfulWhen.includes("running") && painLog.painLevel >= 5) ||
    Boolean((painLog.notes ?? "").match(/กะเผลก|ท่าวิ่ง|ลงน้ำหนักไม่ได้|แย่ลง|หนักขึ้น/));

  if (painLog.painLevel >= 7) flags.push("ปวดระดับสูง หรือปวดจนทำกิจกรรมปกติยาก");
  if (painLog.swellingOrRedness === "yes") flags.push("มีอาการบวมแดงเพิ่ม หรือร้อนบริเวณที่เจ็บ");
  if (painLog.canBearWeight === "no") flags.push("ลงน้ำหนักไม่ได้ หรือเดินแล้วปวดมาก");
  if (hasSharp) flags.push("ปวดแปลบหรือเจ็บคมชัด");
  if (hasNumb) flags.push("มีอาการชา");
  if (painChangesForm) flags.push("เจ็บจนท่าวิ่งหรือการเดินเปลี่ยน");

  if (flags.length > 0) {
    flags.push("ถ้าอาการไม่ดีขึ้นใน 48-72 ชม. ควรพบแพทย์/นักกายภาพ");
  }

  return [...new Set(flags)];
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-[#17201d]">{value}</p>
    </div>
  );
}
