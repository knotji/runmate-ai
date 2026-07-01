import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { ReadinessCard } from "@/components/ReadinessCard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="คุยกับโค้ช" subtitle="ถามเรื่องซ้อม กิน นอน recovery หรือแค่อยากระบายก็ได้">
      <section className="card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--label-color)]">COACH</p>
            <h2 className="mt-1 text-xl font-extrabold text-[var(--foreground)]">โค้ชพร้อมช่วยวันนี้</h2>
            <p className="mt-1 text-sm text-[var(--muted-text)]">ตอบได้ทุกเรื่องซ้อม กิน นอน recovery</p>
          </div>
          <Link href="/pain" className="btn-danger-soft shrink-0 px-3 py-2 text-xs font-bold">
            แจ้งเจ็บ
          </Link>
        </div>
        <p className="mt-3 text-xs text-[var(--color-text-soft)]">
          ใช้ข้อมูลจาก Report เป็นพื้นหลัง · แชทนี้ไม่บันทึกเข้า Report อัตโนมัติ
        </p>
        <a href="#coach-chat" className="mt-3 btn-primary block py-2.5 text-center text-sm font-bold">
          ลองถามโค้ช
        </a>
      </section>
      <AIContextCard />
      <ReadinessCard />
      <CoachChat />
    </AppShell>
  );
}
