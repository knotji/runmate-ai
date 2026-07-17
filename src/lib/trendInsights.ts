/**
 * Pure helper — no React/Supabase. Detects multi-day rising trends from
 * sleep7d (newest-first, same ordering dedupeSleepItems produces) that a
 * single-day-vs-7d-average comparison (see coachCautionFactors.ts's
 * "restingHrElevated") can miss — e.g. a slow climb of 1-2 bpm/day pulls the
 * average up with it, keeping the latest-vs-average delta small even after
 * several consecutive rising days.
 */

const MIN_STREAK_DAYS = 3;
const MIN_RISE_BPM = 3;

export type RestingHRTrend = {
  streakDays: number;
  latestRestingHR: number;
  riseBpm: number;
};

function dateKeyDiffDays(a: string, b: string): number {
  const da = new Date(`${a}T12:00:00+07:00`).getTime();
  const db = new Date(`${b}T12:00:00+07:00`).getTime();
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}

/** `rows` must be newest-first (sleep7d's own ordering). Returns the streak
 *  ending at the most recent day, or null if there's no rising run of at
 *  least MIN_STREAK_DAYS consecutive calendar days totalling >= MIN_RISE_BPM. */
export function detectRestingHRTrend(
  rows: { date: string; restingHR: number | null }[],
): RestingHRTrend | null {
  const withHR = rows.filter((r): r is { date: string; restingHR: number } => r.restingHR != null);
  if (withHR.length < MIN_STREAK_DAYS) return null;

  let streak = 1;
  for (let i = 1; i < withHR.length; i++) {
    const newer = withHR[i - 1];
    const older = withHR[i];
    const isConsecutiveDay = dateKeyDiffDays(newer.date, older.date) === 1;
    const isRising = newer.restingHR >= older.restingHR;
    if (!isConsecutiveDay || !isRising) break;
    streak += 1;
  }

  if (streak < MIN_STREAK_DAYS) return null;

  const latestRestingHR = withHR[0].restingHR;
  const riseBpm = latestRestingHR - withHR[streak - 1].restingHR;
  if (riseBpm < MIN_RISE_BPM) return null;

  return { streakDays: streak, latestRestingHR, riseBpm };
}
