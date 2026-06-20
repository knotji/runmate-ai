import { safetyDisclaimer } from "@/lib/constants";

export function Disclaimer() {
  return (
    <details className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-900">
      <summary className="cursor-pointer list-none font-semibold">
        คำแนะนำเป็นแนวทางทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ <span className="font-bold underline">อ่านเพิ่มเติม</span>
      </summary>
      <p className="mt-2 text-amber-800">{safetyDisclaimer}</p>
    </details>
  );
}
