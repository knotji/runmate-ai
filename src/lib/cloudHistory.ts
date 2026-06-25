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

  const uniqueItems = dedupeHistoryItems(items);
  const rows = uniqueItems.map((item) => {
    const dataObj = typeof item.data === "object" && item.data !== null ? { ...item.data } as Record<string, unknown> : {};
    if (item.recordedAt) dataObj.recordedAt = item.recordedAt;
    if (item.dateKey) dataObj.dateKey = item.dateKey;

    return {
      id: item.id,
      user_id: session.userId,
      type: item.type,
      created_at: item.createdAt,
      data: dataObj,
    };
  });

  logSupabaseSyncStart({ table: "history_items", operation: "upsert", userId: session.userId, count: rows.length });
  const { error } = await session.supabase.from("history_items").upsert(rows, { onConflict: "user_id,id" });
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

  const items = ((data ?? []) as HistoryRow[]).map((row) => {
    const dataObj = row.data as Record<string, unknown> | null;
    const recordedAt = dataObj?.recordedAt as string | undefined;
    const dateKey = dataObj?.dateKey as string | undefined;
    return {
      id: row.id,
      type: row.type,
      createdAt: row.created_at,
      recordedAt,
      dateKey,
      data: row.data,
    };
  });
  logSupabaseSyncSuccess({ table: "history_items", operation: "select", userId: session.userId, count: items.length });
  return { ok: true, items };
}

export async function deleteHistoryItem(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: sessionMessage(session) };

  const { error } = await session.supabase
    .from("history_items")
    .delete()
    .eq("user_id", session.userId)
    .eq("id", id);

  if (error) {
    return { ok: false, error: friendlySupabaseError(error) };
  }
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
  return { ok: true };
}

export async function loadHistoryItemById(id: string): Promise<{ ok: true; item: LocalHistoryItem } | { ok: false; error: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: sessionMessage(session) };

  const { data, error } = await session.supabase
    .from("history_items")
    .select("id, type, created_at, data")
    .eq("user_id", session.userId)
    .eq("id", id)
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "ไม่พบข้อมูล" };
  const row = data as HistoryRow;
  const dataObj = row.data as Record<string, unknown> | null;
  const recordedAt = dataObj?.recordedAt as string | undefined;
  const dateKey = dataObj?.dateKey as string | undefined;
  return {
    ok: true,
    item: {
      id: row.id,
      type: row.type,
      createdAt: row.created_at,
      recordedAt,
      dateKey,
      data: row.data,
    },
  };
}

function sessionMessage(session: { reason: string; message?: string }) {
  return session.message ?? session.reason;
}

function dedupeHistoryItems(items: LocalHistoryItem[]) {
  const byId = new Map<string, LocalHistoryItem>();
  for (const item of items) {
    byId.set(item.id, item);
  }
  return Array.from(byId.values());
}

/**
 * Find an existing meal slot for a given Bangkok-local date and meal type.
 * Returns the first matching history item, or null if none found.
 * Uses +07:00 range filter so timezone conversion happens in Postgres.
 */
export async function findMealSlotByDateAndType(
  localDate: string, // YYYY-MM-DD in Bangkok time (UTC+7)
  mealType: string
): Promise<LocalHistoryItem | null> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return null;

  // Query the last 50 meals for this user, ordered by created_at desc
  const { data, error } = await session.supabase
    .from("history_items")
    .select("id, type, created_at, data")
    .eq("user_id", session.userId)
    .eq("type", "meal")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data?.length) return null;

  for (const row of (data as HistoryRow[])) {
    const rowData = row.data as Record<string, unknown>;
    const inner = (rowData?.data ?? rowData) as Record<string, unknown>;
    if (typeof inner?.mealType === "string" && inner.mealType === mealType) {
      if (inner?.isSeparateMeal === true) continue;
      
      // Determine this record's dateKey
      const dateKey = (rowData?.dateKey ?? inner?.dateKey ?? rowData?.recordedAt?.toString().slice(0, 10) ?? inner?.recordedAt?.toString().slice(0, 10));
      if (dateKey) {
        if (dateKey === localDate) {
          return {
            id: row.id,
            type: row.type,
            createdAt: row.created_at,
            recordedAt: rowData?.recordedAt as string | undefined,
            dateKey: rowData?.dateKey as string | undefined,
            data: row.data
          };
        }
      } else {
        // Fallback: localDate from created_at (adjusted to Bangkok +07:00)
        const d = new Date(row.created_at);
        if (!Number.isNaN(d.getTime())) {
          const bangkokDate = new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
          if (bangkokDate === localDate) {
            return { id: row.id, type: row.type, createdAt: row.created_at, data: row.data };
          }
        }
      }
    }
  }
  return null;
}
