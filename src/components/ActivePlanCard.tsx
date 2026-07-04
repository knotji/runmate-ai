"use client";

import Link from "next/link";
import { daysUntil, formatDate } from "@/lib/date";
import type { RaceGoal, RacePlan } from "@/types/race";

export function ActivePlanCard({ goal, plan }: { goal: RaceGoal | null; plan: RacePlan | null }) {
  const days = daysUntil(goal?.raceDate);
  const status = getStatus(days);
  const week = plan?.weeks?.[0];

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">Active Plan</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--foreground)]">
            {goal ? goal.raceName : "ยังไม่มี Race Goal active"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {goal
              ? `${goal.raceDistance} · ${formatDate(goal.raceDate)} · ${status}`
              : "ตอนนี้โค้ชจะประเมินจากข้อมูล 7 วันล่าสุด ยังไม่อิงตารางแข่งหรือแผน race"}
          </p>
        </div>
        <Link href="/race-goal" className="shrink-0 rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-[#42677f]">
          {goal ? "แก้แผน" : "ตั้งเป้า"}
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <MiniStat label="Status" value={goal ? status : "No race"} />
        <MiniStat label="Phase" value={plan?.currentPhase ?? "Data-led"} />
        <MiniStat label="Long run" value={week?.longRunDistanceKm != null ? `${week.longRunDistanceKm} กม.` : "-"} />
      </div>

      <p className="rounded-2xl bg-[#e7efea] p-3 text-sm leading-6 text-slate-700">
        {plan?.planSummary ?? "ยังไม่มี active weekly plan: ถามโค้ชได้ แต่คำตอบจะเป็นการ infer จาก sleep/workout/body ล่าสุด ไม่ใช่ตารางซ้อมที่ล็อกไว้"}
      </p>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function getStatus(days: number | null) {
  if (days == null || isNaN(days)) return "No date";
  if (days < 0) return "Race passed";
  if (days === 0) return "Race today";
  if (days === 1) return "Tomorrow";
  return `${days} days left`;
}
