import { daysUntil, formatDate } from "@/lib/date";
import type { RaceGoal } from "@/types/race";

export function RaceCountdownCard({ goal, phase }: { goal?: RaceGoal | null; phase?: string }) {
  const days = daysUntil(goal?.raceDate);

  const racePassed = days != null && days < 0;
  const raceToday = days === 0;

  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--label-color)]">Race Goal</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{goal?.raceName || "ยังไม่มี Race Goal"}</h2>
          <p className="mt-1 text-sm text-[var(--muted-text)]">
            {goal ? `${goal.raceDistance} · ${formatDate(goal.raceDate)}` : "สร้างเป้าหมายเพื่อให้โค้ชวางแผนยาวได้"}
          </p>
        </div>
        <div className={`rounded-2xl px-4 py-3 text-center ${racePassed ? "bg-[var(--surface-muted)]" : raceToday ? "bg-amber-100" : "bg-[var(--primary-soft)]"}`}>
          {racePassed ? (
            <p className="text-sm font-bold text-[var(--color-text-soft)]">แข่งแล้ว</p>
          ) : raceToday ? (
            <>
              <p className="text-lg font-bold text-amber-600">วันนี้!</p>
              <p className="text-xs text-amber-600">แข่งเลย</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold">{days != null && !isNaN(days) ? String(days) : "-"}</p>
              <p className="text-xs text-[var(--muted-text)]">วัน</p>
            </>
          )}
        </div>
      </div>
      <p className="mt-4 rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm text-[var(--foreground)]">
        {racePassed ? "🏅 แข่งเสร็จแล้ว — สร้างเป้าหมายใหม่ได้เลย" : `เฟส: ${phase || "Base Phase"}`}
      </p>
    </section>
  );
}
