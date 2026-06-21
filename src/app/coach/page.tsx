import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { ReadinessCard } from "@/components/ReadinessCard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="Coach Chat" subtitle="ถามโค้ชโดยใช้ข้อมูลล่าสุดจาก Report เป็นบริบท">
      <div className="flex justify-end">
        <Link
          href="/pain"
          className="flex items-center gap-1.5 rounded-full bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
        >
          🩹 แจ้งอาการเจ็บ
        </Link>
      </div>
      <section className="rounded-3xl border border-slate-100 bg-white/70 px-4 py-3 text-xs leading-5 text-slate-500 shadow-sm">
        Coach ใช้ข้อมูลจาก Report, โปรไฟล์ และ Race Goal เพื่อช่วยตอบ แต่ข้อความแชทจะไม่ถูกบันทึกเข้า Report อัตโนมัติ
      </section>
      <AIContextCard />
      <ReadinessCard />
      <CoachChat />
    </AppShell>
  );
}
