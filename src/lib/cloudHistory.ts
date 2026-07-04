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
const NON_PERSISTED_DATA_KEYS = new Set([
  "imageurl",
  "imageurls",
  "imagepath",
  "imagepaths",
  "storagepath",
  "storagepaths",
  "thumbnailurl",
  "thumbnailurls",
  "base64",
  "imagedataurl",
  "imagedataurls",
  "rawtext",
  "rawpdftext",
  "pdftext",
  "ocrtext",
  "rawocrtext",
  "rawresponse",
  "rawhealthtext",
  "filedata",
  "filebuffer",
]);

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
    const sanitizedData = sanitizePersistedHistoryData(item.data);
    const dataObj = typeof sanitizedData === "object" && sanitizedData !== null
      ? { ...sanitizedData } as Record<string, unknown>
      : {};
    if (item.recordedAt) dataObj.recordedAt = item.recordedAt;
    if (item.dateKey) dataObj.dateKey = item.dateKey;
    if (item.source) dataObj.source = item.source;

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

  // Check if we should trigger background profile auto sync
  const importantTypes = new Set(["sleep", "workout", "body", "pain"]);
  const hasImportantType = items.some(item => importantTypes.has(item.type));
  if (hasImportantType) {
    let latestDataUpdatedAt: string | undefined;
    for (const item of items) {
      if (importantTypes.has(item.type)) {
        if (!latestDataUpdatedAt || item.createdAt > latestDataUpdatedAt) {
          latestDataUpdatedAt = item.createdAt;
        }
      }
    }

    // Background sync - fire and forget, dynamic import to break circular dependency
    import("@/lib/runAutoProfileSync").then(({ runAutoProfileSync }) => {
      runAutoProfileSync("after_upload", latestDataUpdatedAt)
        .then((syncResult) => {
          if (syncResult.ok) {
            showAutoSyncToast(syncResult);
          }
        })
        .catch((err) => {
          console.warn("[auto-profile-sync] post-save background sync failed:", err);
        });
    }).catch((err) => {
      console.warn("[auto-profile-sync] dynamic import of runAutoProfileSync failed:", err);
    });
  }

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
    const source = dataObj?.source as LocalHistoryItem["source"] | undefined;
    return {
      id: row.id,
      type: row.type,
      createdAt: row.created_at,
      recordedAt,
      dateKey,
      source,
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
  const source = dataObj?.source as LocalHistoryItem["source"] | undefined;
  return {
    ok: true,
    item: {
      id: row.id,
      type: row.type,
      createdAt: row.created_at,
      recordedAt,
      dateKey,
      source,
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

function sanitizePersistedHistoryData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePersistedHistoryData);
  if (!value || typeof value !== "object") return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (NON_PERSISTED_DATA_KEYS.has(key.toLowerCase())) continue;
    cleaned[key] = sanitizePersistedHistoryData(nestedValue);
  }
  return cleaned;
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

function showAutoSyncToast(result: { ok: boolean; autoSaved: number; silentSkipped: number }) {
  if (typeof window === "undefined") return;

  let message = "";
  if (result.autoSaved > 0) {
    message = `อัปเดตอัตโนมัติ ${result.autoSaved} ค่า`;
    if (result.silentSkipped > 0) {
      message += ` · ข้าม ${result.silentSkipped} ค่าที่คุณแก้เอง`;
    }
  } else if (result.silentSkipped > 0) {
    message = `ข้าม ${result.silentSkipped} ค่าที่คุณแก้เอง`;
  } else {
    message = "โปรไฟล์อัปเดตจากข้อมูลล่าสุด";
  }

  // Create toast container if not exists
  let container = document.getElementById("auto-sync-toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "auto-sync-toast-container";
    container.style.position = "fixed";
    container.style.bottom = "80px"; // above bottom navigation
    container.style.left = "50%";
    container.style.transform = "translateX(-50%)";
    container.style.zIndex = "9999";
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "8px";
    container.style.width = "90%";
    container.style.maxWidth = "380px";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "auto-sync-toast-message";
  toast.style.pointerEvents = "auto";
  toast.style.background = "var(--primary-strong, #4f8a78)";
  toast.style.color = "#ffffff";
  toast.style.padding = "10px 16px";
  toast.style.borderRadius = "var(--radius-card-sm, 14px)";
  toast.style.fontSize = "12px";
  toast.style.fontWeight = "600";
  toast.style.boxShadow = "var(--shadow-floating, 0 10px 24px rgba(79, 138, 120, 0.18))";
  toast.style.textAlign = "center";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(12px)";
  toast.style.transition = "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)";

  toast.textContent = message;
  container.appendChild(toast);

  // Animate in
  setTimeout(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  }, 10);

  // Animate out and remove
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-8px)";
    setTimeout(() => {
      toast.remove();
      if (container && container.childNodes.length === 0) {
        container.remove();
      }
    }, 400);
  }, 4000);
}
