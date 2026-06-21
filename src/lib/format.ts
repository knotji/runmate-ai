function isInvalid(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (typeof value === "number" && isNaN(value)) return true;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "nan") return true;
  }
  return false;
}

export function formatDistanceKm(value: unknown): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  
  const formatted = num.toFixed(2);
  if (formatted.endsWith(".00")) {
    return `${num} km`;
  }
  return `${formatted} km`;
}

export function formatDecimal(value: unknown): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  
  const formatted = num.toFixed(2);
  if (formatted.endsWith(".00")) {
    return `${num}`;
  }
  return formatted;
}

export function formatCalories(value: unknown): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  return `${Math.round(num)} kcal`;
}

export function formatMacro(value: unknown, unit = "g"): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (!Number.isFinite(num)) return "-";
  return `${Math.round(num)} ${unit}`;
}

export function formatNutritionRange(min: unknown, max: unknown, unit = "g"): string {
  if (isInvalid(min) || isInvalid(max)) return "-";
  const minNum = Number(min);
  const maxNum = Number(max);
  if (!Number.isFinite(minNum) || !Number.isFinite(maxNum)) return "-";
  return `${Math.round(minNum)}–${Math.round(maxNum)} ${unit}`;
}

export function formatHeartRate(value: unknown): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  return `${Math.round(num)} bpm`;
}

export function formatElevation(value: unknown): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  return `${Math.round(num)} m`;
}

export function formatScore(value: unknown): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  return `${Math.round(num)}`;
}

export function formatPercent(value: unknown): string {
  if (isInvalid(value)) return "-";
  const num = Number(value);
  if (isNaN(num)) return "-";
  return `${Math.round(num)}%`;
}

export function formatPace(value: unknown): string {
  if (isInvalid(value)) return "-";
  if (typeof value === "string") {
    let trimmed = value.trim();
    trimmed = trimmed.replace(/\/km$/i, "").replace(/\/กม\.?$/i, "").trim();
    if (trimmed.includes(":")) return trimmed;
    const num = Number(trimmed);
    if (!isNaN(num)) {
      return formatNumericPace(num);
    }
    return trimmed;
  }
  if (typeof value === "number") {
    return formatNumericPace(value);
  }
  return "-";
}

function formatNumericPace(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return "-";
  if (num > 30) {
    const min = Math.floor(num / 60);
    const sec = Math.round(num % 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  } else {
    const min = Math.floor(num);
    const sec = Math.round((num - min) * 60);
    return `${min}:${sec.toString().padStart(2, "0")}`;
  }
}

export function formatDuration(value: unknown): string {
  if (isInvalid(value)) return "-";
  const str = String(value).trim();
  if (str.includes(":") || str.includes("h") || str.includes("m") || str.includes("ชั่วโมง") || str.includes("นาที")) {
    return str;
  }
  const num = Number(str);
  if (!isNaN(num) && Number.isFinite(num) && num > 0) {
    if (num >= 3600) {
      const h = Math.floor(num / 3600);
      const m = Math.floor((num % 3600) / 60);
      const s = Math.round(num % 60);
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    } else {
      const m = Math.floor(num / 60);
      const s = Math.round(num % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    }
  }
  return str;
}

export function formatSummaryText(text: string | null | undefined): string {
  if (!text) return "";
  let clean = text.replace(/(\d+(?:\.\d+)?)\s*Cal/gi, (match, val) => {
    const num = parseFloat(val);
    return isNaN(num) ? match : `${Math.round(num)} Cal`;
  });
  clean = clean.replace(/(\d+(?:\.\d+)?)\s*km/gi, (match, val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return match;
    const formatted = num.toFixed(2);
    if (formatted.endsWith(".00")) {
      return `${num} km`;
    }
    return `${formatted} km`;
  });
  clean = clean.replace(/(\d+(?:\.\d+)?)\s*bpm/gi, (match, val) => {
    const num = parseFloat(val);
    return isNaN(num) ? match : `${Math.round(num)} bpm`;
  });
  return clean;
}
