import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { ReadinessCard } from "@/components/ReadinessCard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="Coach Chat" subtitle="ถามอะไรก็ได้ โค้ชจะใช้ข้อมูลจาก Report เป็นบริบท">
      <section className="rounded-3xl border border-[var(--border-warm)] bg-[var(--surface)]/75 px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-[var(--foreground)]">
          คุยกับโค้ชได้อิสระ เรื่องซ้อม กิน นอน recovery หรือแค่อยากระบายก็ได้
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--muted-text)]">
          แชทนี้ใช้ถามชั่วคราว ไม่บันทึกเข้า Report อัตโนมัติ
        </p>
        <div className="mt-3 flex gap-2">
          <a
            href="#coach-chat"
            className="flex-1 rounded-full bg-[var(--primary)] px-4 py-2.5 text-center text-xs font-bold text-white shadow-sm"
          >
            ถามโค้ช
          </a>
          <Link
            href="/pain"
            className="flex-1 rounded-full bg-[#fff0ee] px-4 py-2.5 text-center text-xs font-semibold text-[var(--status-rest)] transition-colors hover:bg-[#ffe5e1]"
          >
            แจ้งอาการเจ็บ
          </Link>
        </div>
      </section>
      <AIContextCard />
      <ReadinessCard />
      <CoachChat />
    </AppShell>
  );
}
