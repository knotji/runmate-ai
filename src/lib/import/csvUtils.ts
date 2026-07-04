import { getBangkokDateKey } from "@/lib/date";

export type CsvRow = Record<string, string>;

export function parseCsvText(text: string): CsvRow[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => {
      const record: CsvRow = {};
      headers.forEach((header, index) => {
        if (header) record[header] = row[index]?.trim() ?? "";
      });
      return record;
    });
}

export function parseCsvHeaders(text: string): string[] {
  return parseCsvRows(text)[0]?.map((header) => header.trim()).filter(Boolean) ?? [];
}

export function normalizeDash(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text || text === "--" || text === "—" || text.toLowerCase() === "null") return undefined;
  return text;
}

export function cleanWeirdNegative(value: unknown): string | undefined {
  const text = normalizeDash(value);
  if (!text) return undefined;
  return text.replace(/^['’]\s*/, "").replace(/[−–—]/g, "-").trim();
}

export function cleanNumber(value: unknown): number | undefined {
  const text = cleanWeirdNegative(value);
  if (!text) return undefined;
  const match = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function cleanInteger(value: unknown): number | undefined {
  const number = cleanNumber(value);
  return number == null ? undefined : Math.round(number);
}

export function parseDurationToMinutes(value: unknown): number | undefined {
  const seconds = parseDurationToSeconds(value);
  if (seconds != null) return Math.round(seconds / 60);

  const text = normalizeDash(value);
  if (!text) return undefined;
  const hMatch = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  const mMatch = text.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (hMatch || mMatch) {
    const h = hMatch ? Number(hMatch[1]) : 0;
    const m = mMatch ? Number(mMatch[1]) : 0;
    return Math.round(h * 60 + m);
  }
  return undefined;
}

export function parseDurationToSeconds(value: unknown): number | undefined {
  const text = normalizeDash(value);
  if (!text) return undefined;

  const hMatch = text.match(/(\d+(?:\.\d+)?)\s*h/i);
  const mMatch = text.match(/(\d+(?:\.\d+)?)\s*m/i);
  if (hMatch || mMatch) {
    const h = hMatch ? Number(hMatch[1]) : 0;
    const m = mMatch ? Number(mMatch[1]) : 0;
    return Math.round((h * 60 + m) * 60);
  }

  const colon = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/);
  if (colon) {
    const first = Number(colon[1]);
    const second = Number(colon[2]);
    const third = colon[3] != null ? Number(colon[3]) : undefined;
    if (third == null) return Math.round(first * 60 + second);
    return Math.round(first * 3600 + second * 60 + third);
  }

  const number = cleanNumber(text);
  return number == null ? undefined : Math.round(number * 60);
}

export function parsePaceToSecPerKm(value: unknown): number | undefined {
  const text = normalizeDash(value);
  if (!text) return undefined;
  const cleaned = text.replace(/\/\s*km/i, "").trim();
  const parts = cleaned.split(":").map(Number);
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.round(parts[0] * 60 + parts[1]);
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  return undefined;
}

export function parseDateTime(value: unknown): Date | undefined {
  const text = normalizeDash(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const monthDay = text.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (monthDay) {
    const year = Number(monthDay[3] ?? new Date().getFullYear());
    const withYear = `${monthDay[1]} ${monthDay[2]}, ${year} 12:00`;
    const fallback = new Date(withYear);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  const timeOnly = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (timeOnly) {
    const today = getBangkokDateKey();
    const fallback = new Date(`${today} ${text}`);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }

  return undefined;
}

export function dateToBangkokDateKey(value: Date | string | number): string {
  return getBangkokDateKey(value);
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
