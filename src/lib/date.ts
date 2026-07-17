export function getBangkokDateKey(dateInput?: Date | string | number): string {
  const d = dateInput ? new Date(dateInput) : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function todayBangkokDateKey(): string {
  return getBangkokDateKey();
}

export function yesterdayBangkokDateKey(): string {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return getBangkokDateKey(yesterday);
}

export function daysAgoBangkokDateKey(days: number): string {
  return getBangkokDateKey(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
}

export function dateKeyToRecordedAt(dateKey: string): string {
  return `${dateKey}T12:00:00+07:00`;
}

export function formatThaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function daysUntil(dateString?: string) {
  if (!dateString) return null;
  const cleanDate = dateString.slice(0, 10);
  const TZ = 7 * 60 * 60 * 1000;
  const todayMs = Math.floor((Date.now() + TZ) / 86_400_000) * 86_400_000;
  const raceMs = new Date(`${cleanDate}T00:00:00+07:00`).getTime();
  const diff = Math.round((raceMs - todayMs) / 86_400_000);
  return isNaN(diff) ? null : diff;
}

/** YYYY-MM-DD → dd/MM/YYYY */
export function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/** ISO string (or YYYY-MM-DD HH:mm) → dd/MM/YYYY HH:mm */
export function formatDatetime(isoStr: string): string {
  if (!isoStr) return "-";
  const [datePart, timePart] = isoStr.includes("T") ? isoStr.split("T") : isoStr.split(" ");
  const date = formatDate(datePart ?? "");
  const time = (timePart ?? "").slice(0, 5);
  return time ? `${date} ${time}` : date;
}

import type { LocalHistoryItem } from "./localHistory";

export function getHistoryItemDateKey(item: LocalHistoryItem): string {
  if (item.dateKey) return item.dateKey;
  
  const data = item.data as Record<string, unknown> | null;
  if (data && typeof data === "object" && typeof data.dateKey === "string") {
    return data.dateKey;
  }
  
  const recordedAt = item.recordedAt || (data && typeof data === "object" ? data.recordedAt as string | null : null);
  if (recordedAt) {
    return getBangkokDateKey(recordedAt);
  }
  
  return getBangkokDateKey(item.createdAt);
}

/** number → "0.00" style with 2 decimal places */
export function fmt2(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toFixed(2);
}

/** Return Thai weekday name (e.g. "วันพฤหัสบดี") for a Bangkok date. */
export function getBangkokThaiDayName(dateKey?: string): string {
  try {
    const d = dateKey ? new Date(`${dateKey}T12:00:00+07:00`) : new Date();
    return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", weekday: "long" }).format(d);
  } catch {
    return "";
  }
}

/**
 * Returns a Thai-style date string using Buddhist Era year.
 * e.g. "วันเสาร์ที่ 4 กรกฎาคม 2569" (Gregorian 2026 → BE 2569)
 */
export function formatThaiBuddhistDate(date = new Date()): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: "Asia/Bangkok",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Clean colon-heavy race names like "ASICS : META : Time : Trials" → "ASICS META Time Trials". */
export function formatRaceDisplayName(name: string | null | undefined): string {
  if (!name) return name ?? "";
  return name.replace(/\s*:\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}
