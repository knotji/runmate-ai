import { daysUntil, formatDate } from "@/lib/date";
import type { RaceGoal } from "@/types/race";

export function RaceCountdownCard({ goal, phase }: { goal?: RaceGoal | null; phase?: string }) {
  const days = daysUntil(goal?.raceDate);

  const racePassed = days != null && days < 0;
  const raceToday = days === 0;

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Race Goal</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{goal?.raceName || "ยังไม่มี Race Goal"}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {goal ? `${goal.raceDistance} · ${formatDate(goal.raceDate)}` : "สร้างเป้าหมายเพื่อให้โค้ชวางแผนยาวได้"}
          </p>
        </div>
        <div className={`rounded-2xl px-4 py-3 text-center ${racePassed ? "bg-slate-100" : raceToday ? "bg-amber-100" : "bg-[#e7efea]"}`}>
          {racePassed ? (
            <p className="text-sm font-bold text-slate-400">แข่งแล้ว</p>
          ) : raceToday ? (
            <>
              <p className="text-lg font-bold text-amber-600">วันนี้!</p>
              <p className="text-xs text-amber-600">แข่งเลย</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold">{days != null && !isNaN(days) ? String(days) : "-"}</p>
              <p className="text-xs text-slate-600">วัน</p>
            </>
          )}
        </div>
      </div>
      <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {racePassed ? "🏅 แข่งเสร็จแล้ว — สร้างเป้าหมายใหม่ได้เลย" : `เฟส: ${phase || "Base Phase"}`}
      </p>
    </section>
  );
}
