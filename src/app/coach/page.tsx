import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CoachContextDashboard } from "@/components/CoachContextDashboard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="คุยกับโค้ช" subtitle="ถามเรื่องซ้อม กิน นอน recovery หรือแค่อยากระบายก็ได้">
      <section className="card px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-[var(--foreground)]">โค้ชพร้อมช่วยวันนี้</h2>
            <p className="mt-0.5 text-xs text-[var(--muted-text)]">ถามเรื่องซ้อม กิน นอน recovery หรืออาการเจ็บได้</p>
          </div>
          <Link href="/pain" className="btn-danger-soft shrink-0 px-3 py-2 text-xs font-bold">
            แจ้งเจ็บ
          </Link>
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-soft)]">แชตนี้ไม่บันทึกเข้า Report อัตโนมัติ</p>
        <a href="#coach-chat" className="mt-3 btn-primary block py-2.5 text-center text-sm font-bold">
          ลองถามโค้ช
        </a>
      </section>
      <CoachContextDashboard />
      <CoachChat />
    </AppShell>
  );
}
