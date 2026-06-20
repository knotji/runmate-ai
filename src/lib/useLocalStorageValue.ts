"use client";

import { useSyncExternalStore } from "react";

const cache = new Map<string, { raw: string | null; value: unknown }>();

export function useLocalStorageValue<T>(key: string): T | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("runmate:data-updated", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("runmate:data-updated", onStoreChange);
      };
    },
    () => readLocal<T>(key),
    () => null,
  );
}

function readLocal<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    const cached = cache.get(key);
    if (cached && cached.raw === raw) return cached.value as T | null;
    const value = raw ? (JSON.parse(raw) as T) : null;
    cache.set(key, { raw, value });
    return value;
  } catch {
    return null;
  }
}
