import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { extractPdfText } from "@/lib/server/extractPdfText";
import type { HealthCheckAnalysis, LabValue } from "@/types/logs";

export const runtime = "nodejs";

const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_CHARS = 24000;

const EMPTY_FLAGS: HealthCheckAnalysis["nutritionFlags"] = {
  watchLDL: false,
  watchTotalCholesterol: false,
  watchTriglyceride: false,
  watchBloodSugar: false,
  watchUricAcid: false,
  watchLiverEnzymes: false,
  watchKidney: false,
};

const FALLBACK: HealthCheckAnalysis = {
  checkupDate: null,
  sourceLabel: "Health check PDF",
  labs: {},
  nutritionFlags: EMPTY_FLAGS,
  coachSummary: "ยังอ่านค่าตรวจสุขภาพได้ไม่ชัดเจน กรุณาตรวจทานไฟล์หรือกรอกข้อมูลจากรายงานที่เลือกข้อความได้",
  foodGuidance: {
    prefer: ["อาหารหลากหลาย", "ผักและใยอาหาร", "โปรตีนไม่ทอด"],
    limit: ["อาหารทอดจัด", "เครื่องดื่มหวาน"],
    notes: ["ข้อมูลนี้ใช้เพื่อช่วยปรับคำแนะนำอาหาร ไม่ใช่การวินิจฉัยโรค"],
  },
  disclaimer: "ข้อมูลนี้ใช้เพื่อช่วยปรับคำแนะนำอาหารและไลฟ์สไตล์ ไม่ใช่การวินิจฉัยโรค หากมีค่าผิดปกติควรปรึกษาแพทย์",
  confidence: "low",
  unclearFields: ["pdf_text"],
};

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, errorCode: "MISSING_FILE", message: "ไม่พบไฟล์ PDF" }, { status: 400 });
    }
    if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, errorCode: "UNSUPPORTED_FILE", message: "กรุณาอัปโหลดไฟล์ PDF ผลตรวจสุขภาพ" }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ ok: false, errorCode: "PDF_TOO_LARGE", message: "ไฟล์ PDF ใหญ่เกินไป ลองใช้ไฟล์ที่เล็กกว่า 8 MB" }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractPdfText(buffer, MAX_TEXT_CHARS);
    if (!extraction.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[health-check-pdf-extraction]", {
          fileSize: file.size,
          method: extraction.method,
          errorCode: extraction.errorCode,
          errorName: extraction.debugMessage?.split(":")[0] ?? null,
          errorMessage: extraction.debugMessage ?? null,
        });
      }
      return NextResponse.json({
        ok: false,
        errorCode: extraction.errorCode,
        message: extraction.message,
        debugMessage: process.env.NODE_ENV === "development" ? extraction.debugMessage : undefined,
      }, { status: 422 });
    }
    const text = extraction.text;

    if (process.env.NODE_ENV === "development") {
      console.info("[health-check-analysis]", {
        fileSize: file.size,
        extractionMethod: extraction.method,
        extractedTextChars: text.length,
      });
    }

    const result = await jsonFromAI<HealthCheckAnalysis>({
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(text),
      fallback: FALLBACK,
    });
    const data = normalizeHealthCheck(result.data);
    return NextResponse.json({
      ok: !result.usedFallback,
      usedFallback: Boolean(result.usedFallback),
      errorCode: result.errorCode,
      message: result.usedFallback ? "AI อ่านผลตรวจได้ไม่สมบูรณ์ กรุณาตรวจทานค่าก่อนบันทึก" : undefined,
      data,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[health-check-analysis-error]", {
        errorCode: "PDF_TEXT_EXTRACTION_FAILED",
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
    return NextResponse.json({
      ok: false,
      errorCode: "PDF_TEXT_EXTRACTION_FAILED",
      message: "อ่านไฟล์ PDF ไม่สำเร็จ ลองใช้ PDF ที่เลือกข้อความได้ หรือรอรองรับภาพผลตรวจในเวอร์ชันถัดไป",
      debugMessage: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.message : String(error)) : undefined,
    }, { status: 500 });
  }
}

function buildUserPrompt(text: string) {
  return `Extract annual health check lab values from this PDF text.

Rules:
- Return JSON only.
- Extract only values visible in the text. Do not invent missing values.
- If checkup date is visible, return it as YYYY-MM-DD. If uncertain, use null.
- Keep uncertain fields nullable and list them in unclearFields.
- Use Thai for coachSummary, foodGuidance, and disclaimer.
- Do not diagnose disease.
- Use cautious wording: "จากค่าที่บันทึกไว้ ควรระวัง..."
- If LDL/total cholesterol/triglyceride are high or borderline, suggest less fried food, saturated fat, processed meat, and more fiber/fish/beans/vegetables.
- If liver enzymes are high, gently suggest limiting alcohol and heavy fried/fatty meals and follow-up if persistent.
- If blood sugar/HbA1c high, limit sugary drinks/desserts/refined carbs.
- If uric acid high, limit organ meats/alcohol/high-purine-heavy choices.
- If kidney values abnormal, avoid aggressive high-protein advice and suggest medical guidance.

Output shape:
{
  "checkupDate": string | null,
  "sourceLabel": string | null,
  "labs": {
    "fbs": {"value": number|string|null, "unit": string|null, "ref": string|null, "label": "FBS", "status": "low"|"normal"|"borderline"|"high"|"unknown"},
    "hba1c": {...},
    "totalCholesterol": {...},
    "triglyceride": {...},
    "ldl": {...},
    "hdl": {...},
    "uricAcid": {...},
    "bun": {...},
    "creatinine": {...},
    "egfr": {...},
    "sgotAst": {...},
    "sgptAlt": {...},
    "alp": {...},
    "hemoglobin": {...},
    "hematocrit": {...},
    "wbc": {...},
    "platelet": {...},
    "urineProtein": {...},
    "urineSugar": {...},
    "urineBlood": {...},
    "hbsAg": {...},
    "antiHbs": {...}
  },
  "nutritionFlags": {
    "watchLDL": boolean,
    "watchTotalCholesterol": boolean,
    "watchTriglyceride": boolean,
    "watchBloodSugar": boolean,
    "watchUricAcid": boolean,
    "watchLiverEnzymes": boolean,
    "watchKidney": boolean
  },
  "coachSummary": string,
  "foodGuidance": { "prefer": string[], "limit": string[], "notes": string[] },
  "disclaimer": string,
  "confidence": "low" | "medium" | "high",
  "unclearFields": string[]
}

PDF text:
${text.slice(0, MAX_TEXT_CHARS)}`;
}

function normalizeHealthCheck(value: HealthCheckAnalysis): HealthCheckAnalysis {
  const labs = Object.fromEntries(
    Object.entries(value?.labs ?? {})
      .map(([key, lab]) => [key, normalizeLab(lab as LabValue | undefined)])
      .filter(([, lab]) => Boolean(lab)),
  ) as HealthCheckAnalysis["labs"];
  return {
    checkupDate: typeof value?.checkupDate === "string" && value.checkupDate.trim() ? value.checkupDate.trim() : null,
    sourceLabel: typeof value?.sourceLabel === "string" && value.sourceLabel.trim() ? value.sourceLabel.trim() : "Health check",
    labs,
    nutritionFlags: { ...EMPTY_FLAGS, ...(value?.nutritionFlags ?? {}) },
    coachSummary: typeof value?.coachSummary === "string" && value.coachSummary.trim() ? value.coachSummary.trim() : FALLBACK.coachSummary,
    foodGuidance: {
      prefer: safeStringArray(value?.foodGuidance?.prefer),
      limit: safeStringArray(value?.foodGuidance?.limit),
      notes: safeStringArray(value?.foodGuidance?.notes),
    },
    disclaimer: typeof value?.disclaimer === "string" && value.disclaimer.trim() ? value.disclaimer.trim() : FALLBACK.disclaimer,
    confidence: value?.confidence === "high" || value?.confidence === "medium" || value?.confidence === "low" ? value.confidence : "low",
    unclearFields: safeStringArray(value?.unclearFields),
  };
}

function normalizeLab(lab: LabValue | undefined): LabValue | null {
  if (!lab || typeof lab !== "object") return null;
  const label = typeof lab.label === "string" && lab.label.trim() ? lab.label.trim() : "";
  if (!label && lab.value == null) return null;
  return {
    value: normalizeLabValue(lab.value),
    unit: typeof lab.unit === "string" && lab.unit.trim() ? lab.unit.trim() : null,
    ref: typeof lab.ref === "string" && lab.ref.trim() ? lab.ref.trim() : null,
    label: label || "Lab",
    status: lab.status === "low" || lab.status === "normal" || lab.status === "borderline" || lab.status === "high" ? lab.status : "unknown",
  };
}

function normalizeLabValue(value: unknown): number | string | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed.replace(/,/g, ""));
    return Number.isFinite(numeric) && /^-?\d+(?:\.\d+)?$/.test(trimmed.replace(/,/g, "")) ? numeric : trimmed;
  }
  return null;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, 8) : [];
}

const SYSTEM_PROMPT = `You are RunMate AI health-check nutrition assistant.
You extract structured annual health check values for running nutrition personalization.
You never diagnose disease and never prescribe medical treatment.
Return valid JSON only.`;
