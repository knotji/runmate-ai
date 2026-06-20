export function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

/** number → "0.00" style with 2 decimal places */
export function fmt2(n: number | null | undefined): string {
  if (n == null) return "-";
  return n.toFixed(2);
}
