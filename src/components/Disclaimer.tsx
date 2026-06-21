import { safetyDisclaimer } from "@/lib/constants";

export function Disclaimer({ compact = true }: { compact?: boolean }) {
  if (compact) {
    return (
      <details className="rounded-2xl border border-slate-200 bg-white/55 px-3 py-2 text-[11px] leading-5 text-slate-500">
        <summary className="cursor-pointer list-none font-medium">
          คำแนะนำเป็นแนวทางทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ <span className="font-semibold underline">อ่านเพิ่มเติม</span>
        </summary>
        <p className="mt-2 text-slate-500">{safetyDisclaimer}</p>
      </details>
    );
  }

  return (
    <details className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-900">
      <summary className="cursor-pointer list-none font-semibold">
        คำแนะนำเป็นแนวทางทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ <span className="font-bold underline">อ่านเพิ่มเติม</span>
      </summary>
      <p className="mt-2 text-amber-800">{safetyDisclaimer}</p>
    </details>
  );
}
