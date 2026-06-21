import { safetyDisclaimer } from "@/lib/constants";

export function Disclaimer({ compact = true }: { compact?: boolean }) {
  if (compact) {
    return (
      <details className="rounded-2xl border border-[var(--border-warm)] bg-[var(--surface)]/55 px-3 py-2 text-[11px] leading-5 text-[var(--muted-text)]">
        <summary className="cursor-pointer list-none font-medium">
          คำแนะนำเป็นแนวทางทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ <span className="font-semibold underline">อ่านเพิ่มเติม</span>
        </summary>
        <p className="mt-2 text-[var(--muted-text)]">{safetyDisclaimer}</p>
      </details>
    );
  }

  return (
    <details className="rounded-2xl border border-[#ead9a9] bg-[#fff6df]/70 px-4 py-3 text-xs leading-6 text-[#7b5d25]">
      <summary className="cursor-pointer list-none font-semibold">
        คำแนะนำเป็นแนวทางทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ <span className="font-bold underline">อ่านเพิ่มเติม</span>
      </summary>
      <p className="mt-2 text-[#8a6729]">{safetyDisclaimer}</p>
    </details>
  );
}
