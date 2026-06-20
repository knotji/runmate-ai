type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

type SyncMeta = {
  table: string;
  operation: string;
  userId?: string;
  count?: number;
};

export function isRlsError(error: SupabaseErrorLike | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "42501" || /row-level security|permission denied/i.test(message);
}

export function logSupabaseSyncStart(meta: SyncMeta) {
  console.info("[supabase-sync-start]", meta);
}

export function logSupabaseSyncSuccess(meta: SyncMeta) {
  console.info("[supabase-sync-success]", meta);
}

export function logSupabaseSyncError(meta: SyncMeta & { error: SupabaseErrorLike }) {
  // Use warn instead of error so Next.js dev overlay does not hide the app.
  console.warn("[supabase-sync-error]", {
    ...meta,
    error: {
      code: meta.error.code,
      message: meta.error.message,
      details: meta.error.details,
      hint: meta.error.hint,
    },
    rlsLikely: isRlsError(meta.error),
  });
}

export function friendlySupabaseError(error: SupabaseErrorLike | null | undefined) {
  if (isRlsError(error)) {
    return "Supabase ไม่อนุญาตให้บันทึกข้อมูลชุดนี้ กรุณาเช็ค RLS policy / grants ของตาราง";
  }
  return error?.message ?? "ไม่สามารถบันทึกหรือโหลดข้อมูลจาก Supabase ได้";
}
