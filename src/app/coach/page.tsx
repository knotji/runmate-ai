import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { ReadinessCard } from "@/components/ReadinessCard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="Coach Chat" subtitle="ถามโค้ชโดยใช้ข้อมูลล่าสุดจาก Report เป็นบริบท">
      <section className="rounded-3xl border border-slate-100 bg-white/75 px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold text-[#17201d]">
          ดูคำแนะนำวันนี้ → ถามโค้ชต่อ → แนบรูปได้ถ้าต้องการ
        </p>
        <div className="mt-3 flex gap-2">
          <a
            href="#coach-chat"
            className="flex-1 rounded-full bg-[#17201d] px-4 py-2.5 text-center text-xs font-bold text-white"
          >
            ถามโค้ช
          </a>
          <Link
            href="/pain"
            className="flex-1 rounded-full bg-red-50 px-4 py-2.5 text-center text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
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
