import type { AIConfidence } from "@/types/logs";

const FIELD_LABEL_MAP: Record<string, string> = {
  distanceKm: "ระยะทาง",
  avgHR: "HR เฉลี่ย",
  maxHR: "HR สูงสุด",
  pace: "เพซ",
  avgPace: "เพซ",
  sleepDuration: "เวลานอน",
  sleepScore: "Sleep score",
  energyScore: "Energy score",
  calories: "kcal",
  caloriesKcal: "kcal",
  protein: "โปรตีน",
  proteinG: "โปรตีน",
  carbs: "คาร์บ",
  carbsG: "คาร์บ",
  fat: "ไขมัน",
  fatG: "ไขมัน",
  labs: "ค่าผลตรวจ",
};

interface DataQualityNoteProps {
  confidence?: AIConfidence;
  unclearFields?: string[];
  source?: "sleep" | "meal" | "workout" | "body" | "health_check" | "race_result";
  compact?: boolean;
}

export function DataQualityNote({
  confidence,
  unclearFields,
  source,
}: DataQualityNoteProps) {
  const isLow = confidence === "low";
  const hasUnclear = unclearFields && unclearFields.length > 0;

  // Custom meal note
  if (source === "meal") {
    return (
      <div className="bg-[var(--surface-muted)] text-[var(--color-text-muted)] border border-[var(--border-warm)] rounded-2xl p-3 text-xs leading-5">
        ℹ️ แคลอรีและสารอาหารเป็นค่าประมาณ กรุณาตรวจทานก่อนบันทึก
      </div>
    );
  }

  // Custom health check note
  if (source === "health_check") {
    return (
      <div className={isLow || hasUnclear ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded-2xl p-3 text-xs leading-5" : "bg-[var(--surface-muted)] text-[var(--color-text-muted)] border border-[var(--border-warm)] rounded-2xl p-3 text-xs leading-5"}>
        {isLow || hasUnclear
          ? "⚠️ ข้อมูลบางส่วนอาจอ่านไม่ชัด กรุณาตรวจทานก่อนใช้ประกอบคำแนะนำ"
          : "ℹ️ ข้อมูลที่อ่านได้อาจคลาดเคลื่อน กรุณาตรวจทานก่อนบันทึก"}
      </div>
    );
  }

  if (isLow || hasUnclear) {
    const fieldsToShow = (unclearFields ?? [])
      .map((f) => FIELD_LABEL_MAP[f] || f)
      .filter(Boolean);

    return (
      <div className="bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning-border)] rounded-2xl p-3 text-xs leading-5">
        ⚠️ มีบางค่าที่อ่านไม่ชัด กรุณาตรวจทานเป็นพิเศษก่อนบันทึก
        {fieldsToShow.length > 0 && (
          <span className="block mt-0.5 text-[var(--color-warning)]/80 font-medium">
            เช่น: {fieldsToShow.slice(0, 4).join(", ")}
          </span>
        )}
      </div>
    );
  }

  // Default subtle note
  let genericText = "ข้อมูลที่อ่านได้อาจคลาดเคลื่อน กรุณาตรวจทานก่อนบันทึก";
  if (source === "body") {
    genericText = "ค่าจากภาพอาจอ่านคลาดเคลื่อน กรุณาตรวจทานก่อนบันทึก";
  } else if (source === "race_result") {
    genericText = "ตรวจทานระยะ เวลา และเพซก่อนบันทึก";
  }

  return (
    <div className="bg-[var(--surface-muted)] text-[var(--color-text-muted)] border border-[var(--border-warm)] rounded-2xl p-3 text-xs leading-5">
      ℹ️ {genericText}
    </div>
  );
}
