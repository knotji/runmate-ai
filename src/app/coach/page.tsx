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
            <h2 className="text-lg font-extrabold text-[var(--foreground)]">โค้ชพร้อมช่วยวันนี้</h2>
            <p className="mt-0.5 text-xs text-[var(--muted-text)]">ใช้ข้อมูล Report เป็นพื้นหลัง · อัปเดตทุกครั้งที่บันทึกข้อมูล</p>
          </div>
          <Link href="/pain" className="btn-danger-soft shrink-0 px-3 py-2 text-xs font-bold">
            แจ้งเจ็บ
          </Link>
        </div>
        <p className="mt-1.5 text-[11px] text-[var(--color-text-soft)]">แชตนี้ไม่บันทึกเข้า Report อัตโนมัติ · ถ้าต้องการบันทึกข้อมูลใหม่ ไปที่ Upload</p>
        <a href="#coach-chat" className="mt-2.5 btn-primary block py-2 text-center text-sm font-bold">
          ลองถามโค้ช
        </a>
      </section>
      <CoachContextDashboard />
      <CoachChat />
    </AppShell>
  );
}
