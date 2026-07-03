import { daysUntil, formatDate, formatRaceDisplayName } from "@/lib/date";
import type { RaceGoal } from "@/types/race";

export function RaceCountdownCard({ goal, phase }: { goal?: RaceGoal | null; phase?: string }) {
  const days = daysUntil(goal?.raceDate);

  const racePassed = days != null && days < 0;
  const raceToday = days === 0;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold leading-tight text-[var(--foreground)] line-clamp-2" title={goal?.raceName}>
            {formatRaceDisplayName(goal?.raceName) || "ยังไม่มี Race Goal"}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--muted-text)]">
            {goal ? `${goal.raceDistance} · ${formatDate(goal.raceDate)}` : "สร้างเป้าหมายเพื่อให้โค้ชวางแผนยาวได้"}
          </p>
          <div className="mt-3">
            <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary-strong)]">
              {racePassed ? "แข่งเสร็จแล้ว" : raceToday ? "วันแข่งวันนี้!" : `เฟส ${phase || "Base Phase"}`}
            </span>
          </div>
        </div>
        <div className={`shrink-0 rounded-2xl px-4 py-3 text-center min-w-[72px] ${racePassed ? "bg-[var(--surface-muted)]" : raceToday ? "bg-amber-100" : "bg-[var(--primary-soft)]"}`}>
          {racePassed ? (
            <>
              <p className="text-2xl">🏅</p>
              <p className="mt-0.5 text-[10px] font-bold text-[var(--color-text-soft)]">แข่งแล้ว</p>
            </>
          ) : raceToday ? (
            <>
              <p className="text-2xl font-bold text-amber-600">🏁</p>
              <p className="mt-0.5 text-xs font-bold text-amber-600">วันนี้!</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-extrabold text-[var(--foreground)]">{days != null && !isNaN(days) ? String(days) : "-"}</p>
              <p className="text-xs text-[var(--muted-text)]">วัน</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
