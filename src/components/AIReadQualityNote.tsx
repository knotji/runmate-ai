import type { AIConfidence } from "@/types/logs";

const confidenceLabels: Record<AIConfidence, string> = {
  high: "ความมั่นใจสูง",
  medium: "ความมั่นใจปานกลาง",
  low: "ความมั่นใจต่ำ",
};

const confidenceStyles: Record<AIConfidence, string> = {
  high: "bg-green-50 text-green-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-600",
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
    <div className={`rounded-2xl ${compact ? "bg-white p-3" : "bg-slate-50 p-3"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${confidenceStyles[level]}`}>
          {confidenceLabels[level]}
        </span>
        <span className="text-xs text-slate-400">AI อ่านจากรูป อาจต้องตรวจทานก่อนใช้ตัดสินใจ</span>
      </div>
      {fields.length > 0 ? (
        <p className="mt-2 text-xs font-semibold leading-5 text-amber-700">
          บางข้อมูลอ่านไม่ชัด: {fields.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
