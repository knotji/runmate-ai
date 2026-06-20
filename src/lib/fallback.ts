export function mergeWithFallback<T>(value: unknown, fallback: T): T {
  if (!isRecord(value) || !isRecord(fallback)) return (value ?? fallback) as T;

  const merged: Record<string, unknown> = { ...fallback };
  for (const [key, fallbackValue] of Object.entries(fallback)) {
    const nextValue = value[key];
    if (nextValue === undefined || nextValue === null || nextValue === "") {
      merged[key] = fallbackValue;
    } else if (isRecord(nextValue) && isRecord(fallbackValue)) {
      merged[key] = mergeWithFallback(nextValue, fallbackValue);
    } else {
      merged[key] = nextValue;
    }
  }

  return merged as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
