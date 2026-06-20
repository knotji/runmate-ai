import { AppShell } from "@/components/AppShell";
import { AIContextCard } from "@/components/AIContextCard";
import { CoachChat } from "@/components/CoachChat";
import { ProfileSummaryCard } from "@/components/ProfileSummaryCard";

export default function CoachPage() {
  return (
    <AppShell title="Coach Chat" subtitle="ถามโค้ชเรื่องวิ่ง กิน นอน และ recovery">
      <ProfileSummaryCard />
      <AIContextCard />
      <CoachChat />
    </AppShell>
  );
}
