import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { CoachChat } from "@/components/CoachChat";

export default function CoachPage() {
  return (
    <AppShell title="Coach Chat" subtitle="คุยกับโค้ชเรื่องซ้อม กิน นอน และ recovery">
      <AIContextCard />
      <CoachChat />
    </AppShell>
  );
}
