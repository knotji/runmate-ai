"use client";

import { ensureSupabaseProfileSession } from "@/lib/profileStorage";
import {
  friendlySupabaseError,
  logSupabaseSyncError,
  logSupabaseSyncStart,
  logSupabaseSyncSuccess,
} from "@/lib/supabase/debug";
import type { LocalHistoryItem } from "@/lib/localHistory";

const BATCH = 100;
const MAX_PULL = 2000;

/** Upsert items to Supabase. Callers may ignore the result, but errors are logged. */
export async function pushHistoryItems(items: LocalHistoryItem[]): Promise<{ ok: boolean; error?: string }> {
  if (!items.length) return { ok: true };
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) {
    const message = "message" in session ? session.message : session.reason;
    console.warn("[supabase-sync-error]", {
      table: "history_items",
      operation: "upsert",
      reason: session.reason,
      message,
    });
    return { ok: false, error: message };
  }

  const rows = items.map((item) => ({
    id: item.id,
    user_id: session.userId,
    type: item.type,
    created_at: item.createdAt,
    data: item.data as Record<string, unknown>,
  }));

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    logSupabaseSyncStart({
      table: "history_items",
      operation: "upsert",
      userId: session.userId,
      count: batch.length,
    });
    const { error } = await session.supabase
      .from("history_items")
      .upsert(batch);
    if (error) {
      logSupabaseSyncError({
        table: "history_items",
        operation: "upsert",
        userId: session.userId,
        error,
        count: batch.length,
      });
      return { ok: false, error: friendlySupabaseError(error) };
    }
    logSupabaseSyncSuccess({
      table: "history_items",
      operation: "upsert",
      userId: session.userId,
      count: batch.length,
    });
  }

  return { ok: true };
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
    const message = "message" in session ? session.message : session.reason;
    console.warn("[supabase-sync-error]", {
      table: "history_items",
      operation: "select",
      reason: session.reason,
      message,
    });
    return { ok: false, error: message };
  }

  logSupabaseSyncStart({ table: "history_items", operation: "select", userId: session.userId });
  const { data, error } = await session.supabase
    .from("history_items")
    .select("id, type, created_at, data")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(MAX_PULL);

  if (error) {
    logSupabaseSyncError({ table: "history_items", operation: "select", userId: session.userId, error });
    return { ok: false, error: friendlySupabaseError(error) };
  }

  if (!data || data.length === 0) {
    logSupabaseSyncSuccess({ table: "history_items", operation: "select", userId: session.userId, count: 0 });
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

  logSupabaseSyncSuccess({
    table: "history_items",
    operation: "select",
    userId: session.userId,
    count: data.length,
  });
  return { ok: true, count: data.length };
}
