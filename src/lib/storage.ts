import { createClient } from "@/lib/supabase/client";

const buckets = {
  sleep: "sleep-images",
  meal: "meal-images",
  run: "run-images",
  workout: "workout-images",
  body: "body-images",
} as const;

export type UploadKind = keyof typeof buckets;

export async function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadImage(kind: UploadKind, file: File) {
  const supabase = createClient();
  if (!supabase) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `dev/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(buckets[kind]).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(buckets[kind]).getPublicUrl(path);
  return data.publicUrl;
}
