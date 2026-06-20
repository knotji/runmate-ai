"use client";

import { ensureSupabaseProfileSession } from "@/lib/profileStorage";
import {
  friendlySupabaseError,
  logSupabaseSyncError,
  logSupabaseSyncStart,
  logSupabaseSyncSuccess,
} from "@/lib/supabase/debug";
import type { HistoryType, LocalHistoryItem } from "@/lib/localHistory";

const MAX_HISTORY_ROWS = 2000;

type HistoryRow = {
  id: string;
  type: HistoryType;
  created_at: string;
  data: unknown;
};

export function createHistoryItem(type: HistoryType, data: unknown, createdAt?: string): LocalHistoryItem {
  const resolvedDate = createdAt && !Number.isNaN(new Date(createdAt).getTime())
    ? new Date(createdAt).toISOString()
    : new Date().toISOString();
  return {
    id: `${type}-${resolvedDate.slice(0, 10)}-${Date.now()}`,
    type,
    createdAt: resolvedDate,
    data,
  };
}

export async function saveHistoryItems(items: LocalHistoryItem[]): Promise<{ ok: boolean; error?: string }> {
  if (!items.length) return { ok: true };
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) {
    return { ok: false, error: sessionMessage(session) };
  }

  const rows = items.map((item) => ({
    id: item.id,
    user_id: session.userId,
    type: item.type,
    created_at: item.createdAt,
    data: item.data as Record<string, unknown>,
  }));

  logSupabaseSyncStart({ table: "history_items", operation: "upsert", userId: session.userId, count: rows.length });
  const { error } = await session.supabase.from("history_items").upsert(rows);
  if (error) {
    logSupabaseSyncError({ table: "history_items", operation: "upsert", userId: session.userId, error, count: rows.length });
    return { ok: false, error: friendlySupabaseError(error) };
  }
  logSupabaseSyncSuccess({ table: "history_items", operation: "upsert", userId: session.userId, count: rows.length });
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
  return { ok: true };
}

export async function loadHistoryItems(types?: HistoryType[]): Promise<{ ok: true; items: LocalHistoryItem[] } | { ok: false; error: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) {
    return { ok: false, error: sessionMessage(session) };
  }

  logSupabaseSyncStart({ table: "history_items", operation: "select", userId: session.userId });
  let query = session.supabase
    .from("history_items")
    .select("id, type, created_at, data")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_ROWS);

  if (types?.length) query = query.in("type", types);

  const { data, error } = await query;
  if (error) {
    logSupabaseSyncError({ table: "history_items", operation: "select", userId: session.userId, error });
    return { ok: false, error: friendlySupabaseError(error) };
  }

  const items = ((data ?? []) as HistoryRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    data: row.data,
  }));
  logSupabaseSyncSuccess({ table: "history_items", operation: "select", userId: session.userId, count: items.length });
  return { ok: true, items };
}

function sessionMessage(session: { reason: string; message?: string }) {
  return session.message ?? session.reason;
}
