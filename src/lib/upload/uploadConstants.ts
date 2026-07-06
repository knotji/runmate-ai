import type { UploadType, WorkoutSubtype } from "./uploadTypes";

export const THAI_MONTHS: Record<string, number> = {
  "ม.ค.": 1, "มกราคม": 1,
  "ก.พ.": 2, "กุมภาพันธ์": 2,
  "มี.ค.": 3, "มีนาคม": 3,
  "เม.ย.": 4, "เมษายน": 4,
  "พ.ค.": 5, "พฤษภาคม": 5,
  "มิ.ย.": 6, "มิถุนายน": 6,
  "ก.ค.": 7, "กรกฎาคม": 7,
  "ส.ค.": 8, "สิงหาคม": 8,
  "ก.ย.": 9, "กันยายน": 9,
  "ต.ค.": 10, "ตุลาคม": 10,
  "พ.ย.": 11, "พฤศจิกายน": 11,
  "ธ.ค.": 12, "ธันวาคม": 12,
};

export const IMAGE_REPORT_KEYS = new Set([
  "imageUrl",
  "imageUrls",
  "imagePath",
  "imagePaths",
  "storagePath",
  "storagePaths",
  "thumbnailUrl",
  "thumbnailUrls",
  "base64",
  "imageDataUrl",
  "imageDataUrls",
  "rawText",
  "rawPdfText",
  "pdfText",
  "ocrText",
  "rawOcrText",
  "rawResponse",
  "rawHealthText",
  "fileData",
  "fileBuffer",
]);

export const UPLOAD_LABELS: Record<UploadType, string> = {
  sleep: "นอน",
  meal: "อาหาร",
  workout: "ซ้อม",
  body: "ร่างกาย",
  health_check: "สุขภาพ",
};

export const UPLOAD_ORDER: UploadType[] = ["sleep", "meal", "workout", "body", "health_check"];

export const UPLOAD_DASHBOARD_META: Record<UploadType, {
  icon: string;
  title: string;
  copy: string;
  ctaLabel: string;
  noFileCtaLabel: string;
  caution?: string;
}> = {
  sleep: {
    icon: "🌙",
    title: "บันทึกการนอน",
    copy: "ใช้ประเมินความพร้อม การนอน และคำแนะนำคืนนี้",
    ctaLabel: "วิเคราะห์การนอน",
    noFileCtaLabel: "เลือกรูปก่อนวิเคราะห์",
  },
  meal: {
    icon: "🍽️",
    title: "บันทึกอาหาร",
    copy: "ช่วยให้โค้ชประเมินพลังงาน โปรตีน และมื้อต่อไป",
    ctaLabel: "วิเคราะห์อาหาร",
    noFileCtaLabel: "เลือกรูปมื้อก่อนวิเคราะห์",
  },
  workout: {
    icon: "🏃",
    title: "บันทึกการซ้อม",
    copy: "ใช้คำนวณโหลดวันนี้และปรับคำแนะนำตามแผน",
    ctaLabel: "วิเคราะห์การซ้อม",
    noFileCtaLabel: "เลือกรูปกิจกรรมก่อนวิเคราะห์",
  },
  body: {
    icon: "⚖️",
    title: "บันทึกร่างกาย",
    copy: "น้ำหนัก ไขมัน และองค์ประกอบร่างกาย ใช้ดูแนวโน้มระยะยาว",
    ctaLabel: "วิเคราะห์ร่างกาย",
    noFileCtaLabel: "เลือกรูปข้อมูลร่างกายก่อนวิเคราะห์",
  },
  health_check: {
    icon: "🩺",
    title: "ผลตรวจสุขภาพ (PDF)",
    copy: "อ่านผลตรวจสุขภาพเพื่อประกอบคำแนะนำโภชนาการและการฟื้นตัว",
    ctaLabel: "วิเคราะห์ผลตรวจสุขภาพ",
    noFileCtaLabel: "เลือก PDF ก่อนวิเคราะห์",
    caution: "ไม่ใช่การวินิจฉัยทางการแพทย์",
  },
};

export const WORKOUT_SUBTYPE_HELPER: Record<WorkoutSubtype, string> = {
  run: "รูปวิ่งจะช่วยอ่านระยะ pace HR และโหลดซ้อม",
  strength: "รูปเวทหรือบันทึกเองจะช่วยให้ Today/Report รู้โหลด strength",
  walk: "บันทึกเดินหรือ active recovery แบบไม่ต้องมีรูป",
  other: "เหมาะกับกิจกรรมเสริม เช่น ปั่นจักรยาน โยคะ หรือกีฬาอื่น",
};

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "เช้า",
  lunch: "กลางวัน",
  dinner: "เย็น",
  snack: "ของว่าง",
  "pre-run": "ก่อนวิ่ง",
  "post-run": "หลังวิ่ง",
};

export const CONFIDENCE_LABELS = {
  high: "ความมั่นใจสูง",
  medium: "ความมั่นใจปานกลาง",
  low: "ความมั่นใจต่ำ",
} as const;

// ─── Date utilities ───────────────────────────────────────────────────────────

export function formatThaiShortDate(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = Number(parts[0]) + 543;
  const month = parts[1];
  const day = parts[2];
  return `${day}/${month}/${year}`;
}

export function formatDateKeyToThaiBE(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  const year = Number(parts[0]);
  const month = parts[1];
  const day = parts[2];
  const thaiYear = year + 543;
  return `${day}/${month}/${thaiYear}`;
}

export function parseExtractedDate(extractedDate: string | null | undefined): string | null {
  if (!extractedDate) return null;
  const cleaned = extractedDate.trim();

  // Pattern 1: YYYY-MM-DD
  const yyyymmdd = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]) - 1;
    const day = Number(yyyymmdd[3]);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return yyyymmdd[0];
    }
  }

  // Pattern 2: DD/MM/YYYY or DD/MM/BBBB
  const slashPattern = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashPattern) {
    const day = Number(slashPattern[1]);
    const month = Number(slashPattern[2]);
    let year = Number(slashPattern[3]);
    if (year > 2400) {
      year = year - 543;
    }
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  // Pattern 3: Thai month names (e.g. 17 มิ.ย. 2569 or 17 มิถุนายน 2569)
  const parts = cleaned.split(/[\s,.-]+/);
  if (parts.length === 3) {
    const day = Number(parts[0]);
    const monthName = parts[1];
    let year = Number(parts[2]);
    const month = THAI_MONTHS[monthName];
    if (day && month && year) {
      if (year > 2400) {
        year = year - 543;
      }
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  // Fallback: standard Date parsing
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  return null;
}

export function extractDateFromResult(next: Record<string, unknown> | null | undefined): string | null {
  if (!next) return null;
  const data = (next.data as Record<string, unknown> | undefined) ?? next;
  const extracted = data.extracted as Record<string, unknown> | undefined;
  if (extracted?.date) return String(extracted.date);
  if (data.checkupDate) return String(data.checkupDate);
  if (data.date) return String(data.date);
  return null;
}
