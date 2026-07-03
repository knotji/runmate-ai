import type { SupabaseClient } from "@supabase/supabase-js";

export type CoachMessageRole = "user" | "assistant";

export type CoachMessage = {
  id: string;
  userId: string;
  role: CoachMessageRole;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type SaveCoachMessageInput = {
  userId: string;
  role: CoachMessageRole;
  content: string;
  metadata?: Record<string, unknown>;
};

/**
 * Saves a single message to the coach_messages table.
 * Content is trimmed to a maximum length of 5000 characters to prevent overflow.
 * If saving fails, it logs safely without breaking user execution.
 */
export async function saveCoachMessage(
  supabase: SupabaseClient,
  input: SaveCoachMessageInput
): Promise<CoachMessage | null> {
  try {
    const trimmedContent = input.content.slice(0, 5000);
    const { data, error } = await supabase
      .from("coach_messages")
      .insert({
        user_id: input.userId,
        role: input.role,
        content: trimmedContent,
        metadata: input.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error("[coach-messages] Save message query failed:", error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      userId: data.user_id,
      role: data.role as CoachMessageRole,
      content: data.content,
      createdAt: data.created_at,
      metadata: data.metadata,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[coach-messages] Save message exception:", errMsg);
    return null;
  }
}

/**
 * Fetches recent coach messages for the user.
 * Limit defaults to 20.
 * Reverses the messages so they return in chronological order.
 */
export async function fetchRecentCoachMessages(
  supabase: SupabaseClient,
  { userId, limit = 20 }: { userId: string; limit?: number }
): Promise<CoachMessage[]> {
  try {
    const { data, error } = await supabase
      .from("coach_messages")
      .select("id, user_id, role, content, created_at, metadata")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[coach-messages] Fetch recent messages query failed:", error.message);
      return [];
    }

    if (!data) return [];

    const mapped: CoachMessage[] = data.map((row) => ({
      id: row.id,
      userId: row.user_id,
      role: row.role as CoachMessageRole,
      content: row.content,
      createdAt: row.created_at,
      metadata: row.metadata,
    }));

    // Reverse to return in chronological order
    return mapped.reverse();
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[coach-messages] Fetch recent messages exception:", errMsg);
    return [];
  }
}

/**
 * Fetches a smaller set of recent messages to be used in the AI prompt context.
 * Limit defaults to 8 or 10.
 * Reverses to chronological order before returning.
 */
export async function fetchPromptCoachMessages(
  supabase: SupabaseClient,
  { userId, limit = 10 }: { userId: string; limit?: number }
): Promise<CoachMessage[]> {
  return fetchRecentCoachMessages(supabase, { userId, limit });
}

/**
 * Deletes all coach messages for the user.
 */
export async function clearCoachMessages(
  supabase: SupabaseClient,
  { userId }: { userId: string }
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("coach_messages")
      .delete()
      .eq("user_id", userId);

    if (error) {
      console.error("[coach-messages] Clear messages query failed:", error.message);
      return false;
    }

    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[coach-messages] Clear messages exception:", errMsg);
    return false;
  }
}
