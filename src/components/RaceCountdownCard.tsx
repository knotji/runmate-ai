import { daysUntil, formatDate, formatRaceDisplayName } from "@/lib/date";
import type { RaceGoal } from "@/types/race";

export function RaceCountdownCard({
  goal,
  phase,
  weeksRemaining,
  planStartLabel,
  updatedLabel,
}: {
  goal?: RaceGoal | null;
  phase?: string;
  weeksRemaining?: number | null;
  planStartLabel?: string | null;
  updatedLabel?: string | null;
}) {
  const days = daysUntil(goal?.raceDate);

  const racePassed = days != null && days < 0;
  const raceToday = days === 0;

  const facts = [
    weeksRemaining != null ? `เหลือ ${weeksRemaining} สัปดาห์` : null,
    planStartLabel ? `เริ่มแผน ${planStartLabel}` : null,
    updatedLabel ? `อัปเดต ${updatedLabel}` : null,
  ].filter((f): f is string => Boolean(f));

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
        <div className={`shrink-0 rounded-2xl px-4 py-3 text-center min-w-[72px] ${racePassed ? "bg-[var(--surface-muted)]" : raceToday ? "bg-[var(--color-warning-soft)]" : "bg-[var(--primary-soft)]"}`}>
          {racePassed ? (
            <>
              <p className="text-2xl">🏅</p>
              <p className="mt-0.5 text-[10px] font-bold text-[var(--color-text-soft)]">แข่งแล้ว</p>
            </>
          ) : raceToday ? (
            <>
              <p className="text-2xl font-bold text-[var(--color-warning)]">🏁</p>
              <p className="mt-0.5 text-xs font-bold text-[var(--color-warning)]">วันนี้!</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-extrabold text-[var(--foreground)]">{days != null && !isNaN(days) ? String(days) : "-"}</p>
              <p className="text-xs text-[var(--muted-text)]">วัน</p>
            </>
          )}
        </div>
      </div>
      {facts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-[var(--border-warm)] pt-3" data-testid="race-countdown-facts">
          {facts.map((fact) => (
            <span key={fact} className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--muted-text)]">
              {fact}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
