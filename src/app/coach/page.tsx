import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { ReadinessCard } from "@/components/ReadinessCard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="Coach Chat" subtitle="คุยกับโค้ชเรื่องซ้อม กิน นอน และ recovery">
      <div className="flex justify-end">
        <Link
          href="/pain"
          className="flex items-center gap-1.5 rounded-full bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-100 transition-colors"
        >
          🩹 แจ้งอาการเจ็บ
        </Link>
      </div>
      <AIContextCard />
      <ReadinessCard />
      <CoachChat />
    </AppShell>
  );
}
