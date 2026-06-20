"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import type { UserProfile } from "@/types/profile";

export function ProfileSummaryCard() {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    loadProfileFromSupabase().then((result) => {
      if (result.ok) setProfile(result.profile ?? null);
    });
  }, []);

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Runner Profile</p>
          <h2 className="mt-1 text-lg font-bold text-[#17201d]">
            {profile?.displayName || "ยังไม่มีโปรไฟล์นักวิ่ง"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {profile
              ? profile.mainGoal || profile.currentLevel || "โปรไฟล์พร้อมใช้กับ AI แล้ว"
              : "ตั้งโปรไฟล์เพื่อให้โค้ชใช้ pace, HR cap, injury notes และสไตล์คำตอบได้แม่นขึ้น"}
          </p>
        </div>
        <Link href="/settings" className="shrink-0 rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-[#42677f]">
          แก้ไข
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ProfileMetric label="Easy pace" value={profile?.easyPace || "-"} />
        <ProfileMetric label="Easy HR" value={profile?.easyHrCap || "-"} />
        <ProfileMetric label="Max HR" value={profile?.maxHr ? String(profile.maxHr) : "-"} />
        <ProfileMetric label="Train days" value={profile?.weeklyTrainingDays ? `${profile.weeklyTrainingDays}/wk` : "-"} />
      </div>

      <details className="rounded-2xl bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-slate-500">รายละเอียดโปรไฟล์</summary>
        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          <InfoLine label="Level" value={profile?.currentLevel} />
          <InfoLine label="Longest run" value={profile?.currentLongestRunKm ? `${profile.currentLongestRunKm} km` : undefined} />
          <InfoLine label="Long run day" value={profile?.preferredLongRunDay} />
          <InfoLine label="Available days" value={profile?.availableTrainingDays} />
          <InfoLine label="Device" value={profile?.watchDevice} />
          <InfoLine label="Shoes" value={profile?.shoeRotation} />
          <InfoLine label="Injury" value={profile?.injuryNotes} />
          <InfoLine label="Constraints" value={profile?.trainingConstraints} />
          <InfoLine label="Coach tone" value={profile?.coachTone} />
        </div>
      </details>
    </section>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#17201d]">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p>
      <span className="font-bold text-[#17201d]">{label}:</span> {value}
    </p>
  );
}
