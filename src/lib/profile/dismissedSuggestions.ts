const LS_KEY = "runmate:dismissedProfileSuggestions";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export type DismissedSuggestion = {
  field: string;
  suggestedValue: string; // stored as string for reliable comparison
  dismissedAt: string;
};

function loadAll(): DismissedSuggestion[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DismissedSuggestion[];
  } catch {
    return [];
  }
}

function saveAll(items: DismissedSuggestion[]): void {
  try {
    const cutoff = Date.now() - MAX_AGE_MS;
    const recent = items.filter((d) => new Date(d.dismissedAt).getTime() > cutoff);
    localStorage.setItem(LS_KEY, JSON.stringify(recent));
  } catch {
    // Silently ignore storage quota errors
  }
}

/**
 * Persist a dismissal so the same suggestion is not shown again on the next sync.
 * A suggestion is identified by its field name + serialised suggested value.
 * If the value changes meaningfully in the future the new suggestion will still appear.
 */
export function addDismissedSuggestion(field: string, suggestedValue: unknown): void {
  const key = String(suggestedValue);
  const existing = loadAll().filter((d) => !(d.field === field && d.suggestedValue === key));
  existing.push({ field, suggestedValue: key, dismissedAt: new Date().toISOString() });
  saveAll(existing);
}

/**
 * Returns true when this exact (field, value) pair has been dismissed by the user.
 * A different suggested value for the same field is NOT considered dismissed.
 */
export function isSuggestionDismissed(field: string, suggestedValue: unknown): boolean {
  const key = String(suggestedValue);
  return loadAll().some((d) => d.field === field && d.suggestedValue === key);
}

/** Remove any dismissal for a specific field (e.g., after the user accepts a suggestion). */
export function clearDismissedSuggestion(field: string): void {
  saveAll(loadAll().filter((d) => d.field !== field));
}
