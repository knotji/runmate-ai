"use client";

import { ensureSupabaseProfileSession } from "@/lib/profileStorage";
import type { LocalHistoryItem } from "@/lib/localHistory";

const BATCH = 100;
const MAX_PULL = 2000;

/** Upsert items to Supabase. Fire-and-forget safe — errors are swallowed. */
export async function pushHistoryItems(items: LocalHistoryItem[]): Promise<void> {
  if (!items.length) return;
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return;

  const rows = items.map((item) => ({
    id: item.id,
    user_id: session.userId,
    type: item.type,
    created_at: item.createdAt,
    data: item.data as Record<string, unknown>,
  }));

  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await session.supabase
      .from("history_items")
      .upsert(rows.slice(i, i + BATCH));
    if (error) console.warn("[historySync] push error:", error.message);
  }
}

/**
 * Pull all history from Supabase and merge into localStorage.
 * Items already in localStorage are NOT overwritten (local wins on conflict).
 * Dispatches `runmate:data-updated` if new items were added.
 */
export async function pullAndMergeHistory(): Promise<{ ok: boolean; error?: string; count?: number }> {
  if (typeof window === "undefined") return { ok: true };

  const session = await ensureSupabaseProfileSession();
  if (!session.ok) {
    return { ok: true };
  }

  const { data, error } = await session.supabase
    .from("history_items")
    .select("id, type, created_at, data")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(MAX_PULL);

  if (error) {
    console.warn("[historySync] pull error:", error.message);
    return { ok: false, error: error.message };
  }

  if (!data || data.length === 0) {
    return { ok: true, count: 0 };
  }

  // Group cloud items by type
  const byType = new Map<string, LocalHistoryItem[]>();
  for (const row of data) {
    const item: LocalHistoryItem = {
      id: row.id as string,
      type: row.type as LocalHistoryItem["type"],
      createdAt: row.created_at as string,
      data: row.data,
    };
    const list = byType.get(row.type as string) ?? [];
    list.push(item);
    byType.set(row.type as string, list);
  }

  let anyNew = false;

  for (const [type, cloudItems] of byType) {
    const key = `runmate.history.${type}`;
    let localItems: LocalHistoryItem[] = [];
    try {
      const raw = localStorage.getItem(key);
      localItems = raw ? (JSON.parse(raw) as LocalHistoryItem[]) : [];
    } catch { /* ignore */ }

    const localIds = new Set(localItems.map((i) => i.id));
    const newItems = cloudItems.filter((i) => !localIds.has(i.id));
    if (newItems.length === 0) continue;

    const merged = [...localItems, ...newItems]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 400);

    localStorage.setItem(key, JSON.stringify(merged));
    anyNew = true;
  }

  if (anyNew) {
    window.dispatchEvent(new Event("runmate:data-updated"));
  }

  return { ok: true, count: data.length };
}
