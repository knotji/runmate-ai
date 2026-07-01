/**
 * Calendar period helpers for Report.
 * Report calendar weeks/months are for history display only.
 * Recovery/coach logic still uses rolling 7 days.
 */

import { getBangkokDateKey } from "@/lib/date";

export type CalendarPeriod = {
  startDateKey: string;
  endDateKey: string;
  label: string;       // "29 มิ.ย. – 5 ก.ค. 2569"
  shortLabel: string;  // "29 มิ.ย. – 5 ก.ค."
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ─── Pure date arithmetic on dateKeys ────────────────────────────────────────

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** Returns 0=Sun, 1=Mon, 2=Tue, ..., 6=Sat for a YYYY-MM-DD dateKey. */
export function getDayOfWeekForDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function getMondayOfWeek(dateKey: string): string {
  const dow = getDayOfWeekForDateKey(dateKey);
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  return addDaysToDateKey(dateKey, offsetToMonday);
}

function formatThaiShortDate(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${d} ${THAI_MONTHS_SHORT[m - 1]}`;
}

// ─── Date range utility ───────────────────────────────────────────────────────

/** All dateKeys from start to end (inclusive). */
export function getDateKeysInRange(startDateKey: string, endDateKey: string): string[] {
  const keys: string[] = [];
  let current = startDateKey;
  while (current <= endDateKey) {
    keys.push(current);
    current = addDaysToDateKey(current, 1);
  }
  return keys;
}

// ─── Calendar Week (Mon–Sun) ──────────────────────────────────────────────────

export function getCalendarWeekRange(dateKey: string): CalendarPeriod {
  const monday = getMondayOfWeek(dateKey);
  const sunday = addDaysToDateKey(monday, 6);
  const [y2, m2, d2] = sunday.split("-").map(Number);
  const [, m1, d1] = monday.split("-").map(Number);
  const label = `${formatThaiShortDate(monday)} – ${d2} ${THAI_MONTHS_SHORT[m2 - 1]} ${y2 + 543}`;
  const shortLabel = `${d1} ${THAI_MONTHS_SHORT[m1 - 1]} – ${d2} ${THAI_MONTHS_SHORT[m2 - 1]}`;
  return { startDateKey: monday, endDateKey: sunday, label, shortLabel };
}

export function getPreviousCalendarWeek(range: CalendarPeriod): CalendarPeriod {
  return getCalendarWeekRange(addDaysToDateKey(range.startDateKey, -1));
}

export function getNextCalendarWeek(range: CalendarPeriod): CalendarPeriod {
  return getCalendarWeekRange(addDaysToDateKey(range.endDateKey, 1));
}

export function getCurrentCalendarWeek(todayDateKey?: string): CalendarPeriod {
  return getCalendarWeekRange(todayDateKey ?? getBangkokDateKey());
}

// ─── Calendar Month ───────────────────────────────────────────────────────────

export function getCalendarMonthRange(dateKey: string): CalendarPeriod {
  const [y, m] = dateKey.split("-").map(Number);
  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  // Last day: use day 0 of next month
  const lastDate = new Date(Date.UTC(y, m, 0));
  const lastDay = [
    lastDate.getUTCFullYear(),
    String(lastDate.getUTCMonth() + 1).padStart(2, "0"),
    String(lastDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const thaiYear = y + 543;
  const label = `${THAI_MONTHS[m - 1]} ${thaiYear}`;
  const shortLabel = `${THAI_MONTHS_SHORT[m - 1]} ${thaiYear}`;
  return { startDateKey: firstDay, endDateKey: lastDay, label, shortLabel };
}

export function getPreviousCalendarMonth(range: CalendarPeriod): CalendarPeriod {
  return getCalendarMonthRange(addDaysToDateKey(range.startDateKey, -1));
}

export function getNextCalendarMonth(range: CalendarPeriod): CalendarPeriod {
  return getCalendarMonthRange(addDaysToDateKey(range.endDateKey, 1));
}

export function getCurrentCalendarMonth(todayDateKey?: string): CalendarPeriod {
  return getCalendarMonthRange(todayDateKey ?? getBangkokDateKey());
}

/** Returns all calendar weeks (Mon–Sun) that overlap the given month. */
export function getWeeksInMonth(monthRange: CalendarPeriod): CalendarPeriod[] {
  const weeks: CalendarPeriod[] = [];
  let weekStartKey = getMondayOfWeek(monthRange.startDateKey);
  while (weekStartKey <= monthRange.endDateKey) {
    weeks.push(getCalendarWeekRange(weekStartKey));
    weekStartKey = addDaysToDateKey(weekStartKey, 7);
  }
  return weeks;
}

/** Short Thai weekday labels — index 0=Mon, 1=Tue, ..., 6=Sun */
export const THAI_WEEKDAY_SHORT = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

/** Full Thai weekday name for a dateKey. */
export function getThaiWeekdayLabel(dateKey: string): string {
  const dow = getDayOfWeekForDateKey(dateKey); // 0=Sun
  const idx = dow === 0 ? 6 : dow - 1; // convert to Mon=0
  return ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"][idx];
}

/** Format dateKey as "จ 29 มิ.ย." for collapsed DayCard header. */
export function formatCalendarDayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split("-").map(Number);
  return `${getThaiWeekdayLabel(dateKey)} ${d} ${THAI_MONTHS_SHORT[m - 1]}`;
}
