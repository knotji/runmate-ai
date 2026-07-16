import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CoachContextDashboard } from "@/components/CoachContextDashboard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="คุยกับโค้ช" subtitle="โค้ชอ่าน Report ล่าสุดก่อนตอบ · ถามอะไรก็ได้เลย">
      <section className="card px-5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--foreground)]">พร้อมช่วยวันนี้</h2>
            <p className="mt-0.5 text-sm text-[var(--muted-text)]">อัปเดตทุกครั้งที่บันทึกข้อมูลใหม่</p>
          </div>
          <Link href="/pain" className="btn-danger-soft shrink-0 px-3 py-2 text-xs font-bold">
            แจ้งเจ็บ
          </Link>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-text-soft)]">แชตนี้ไม่บันทึกเข้า Report อัตโนมัติ · บันทึกข้อมูลใหม่ได้ที่ Upload</p>
          <a href="#coach-chat" className="shrink-0 rounded-full border border-[var(--primary)]/40 bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary-strong)]">
            ลองถามโค้ช
          </a>
        </div>
      </section>
      <CoachContextDashboard />
      <CoachChat />
    </AppShell>
  );
}
