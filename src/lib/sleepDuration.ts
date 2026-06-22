export function parseSleepDurationToMinutes(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value > 24 ? value : value * 60);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const colonMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (colonMatch) return Number(colonMatch[1]) * 60 + Number(colonMatch[2]);

  const normalized = raw
    .replace(/ชั่วโมง/g, "ชม")
    .replace(/นาที/g, "น")
    .replace(/hours?/gi, "h")
    .replace(/hrs?/gi, "h")
    .replace(/minutes?/gi, "m")
    .replace(/mins?/gi, "m");

  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:h|ชม)/i);
  const minMatch = normalized.match(/(\d+)\s*(?:m|น)/i);
  if (hourMatch || minMatch) {
    return Math.round(Number(hourMatch?.[1] ?? 0) * 60 + Number(minMatch?.[1] ?? 0));
  }

  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric > 24 ? numeric : numeric * 60);

  return null;
}

export function formatSleepMinutesThai(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "-";
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h > 0 && m > 0) return `${h} ชม. ${m} นาที`;
  if (h > 0) return `${h} ชม.`;
  return `${m} นาที`;
}

export function formatSleepMinutesShortThai(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return "-";
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toFixed(1).replace(/\.0$/, "")} ชม.`;
}

export function sleepDurationTextFromMinutes(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const rounded = Math.round(minutes);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h > 0 && m > 0) return `${h} h ${m} m`;
  if (h > 0) return `${h} h`;
  return `${m} m`;
}
