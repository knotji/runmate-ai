import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { ReadinessCard } from "@/components/ReadinessCard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="คุยกับโค้ช" subtitle="ถามเรื่องซ้อม กิน นอน recovery หรือแค่อยากระบายก็ได้">
      <section className="soft-panel flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-xs leading-5 text-[var(--muted-text)]">
          ใช้ข้อมูลจาก Report เป็นพื้นหลัง · แชทนี้ไม่บันทึกเข้า Report อัตโนมัติ
        </p>
        <Link href="/pain" className="btn-danger-soft shrink-0 px-3 py-2 text-xs">
          แจ้งเจ็บ
        </Link>
      </section>
      <AIContextCard />
      <ReadinessCard />
      <CoachChat />
    </AppShell>
  );
}
