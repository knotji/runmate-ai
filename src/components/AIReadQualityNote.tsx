import type { AIConfidence } from "@/types/logs";

const confidenceLabels: Record<AIConfidence, string> = {
  high: "ความมั่นใจสูง",
  medium: "ความมั่นใจปานกลาง",
  low: "ความมั่นใจต่ำ",
};

const confidenceStyles: Record<AIConfidence, string> = {
  high: "bg-[#eef7f0] text-[var(--status-ready)]",
  medium: "bg-[#fff6df] text-[#9b742c]",
  low: "bg-[#fff0ee] text-[var(--status-rest)]",
};

export function AIReadQualityNote({
  confidence,
  unclearFields,
  compact = false,
}: {
  confidence?: AIConfidence;
  unclearFields?: string[];
  compact?: boolean;
}) {
  const level = confidence ?? "low";
  const fields = (unclearFields ?? []).filter(Boolean);

  return (
    <div className={`rounded-2xl border border-[var(--border-warm)]/60 ${compact ? "bg-[var(--surface)] p-3" : "bg-[var(--surface-muted)] p-3"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${confidenceStyles[level]}`}>
          {confidenceLabels[level]}
        </span>
        <span className="text-xs text-[var(--muted-text)]">AI อ่านจากรูป อาจต้องตรวจทานก่อนใช้ตัดสินใจ</span>
      </div>
      {fields.length > 0 ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-[#9b742c]">
          บางข้อมูลอ่านไม่ชัด: {fields.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
