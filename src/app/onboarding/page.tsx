import { AppShell } from "@/components/AppShell";
import { ProfileSetupForm } from "@/components/ProfileSetupForm";

export default function OnboardingPage() {
  return (
    <AppShell title="ตั้งค่าโปรไฟล์" subtitle="ข้อมูลนี้คือฐานให้โค้ชปรับ pace, HR, recovery และคำตอบให้เข้ากับคุณ">
      <ProfileSetupForm redirectOnSave mode="onboarding" />
    </AppShell>
  );
}
