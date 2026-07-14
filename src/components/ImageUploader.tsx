"use client";

import { FormEvent, useState, useEffect, useRef, type ReactNode } from "react";
import { fileToDataUrl, type UploadKind } from "@/lib/storage";
import { compressImage } from "@/lib/images/compressImage";
import { ErrorState } from "@/components/ErrorState";
import { LoadingButton } from "@/components/LoadingButton";

// When compressImages=true, allow up to 20 MB per file (compression will reduce it).
// Without compression the old 5 MB / 6 MB limits stay in effect.
const MEAL_MAX_FILE_BYTES = 5 * 1024 * 1024;
const COMPRESS_MAX_FILE_BYTES = 20 * 1024 * 1024;
// 3.5 MB safety cap on the estimated base64 payload sent to the AI API
const MAX_PAYLOAD_BYTES = 3.5 * 1024 * 1024;

export function ImageUploader({
  kind,
  endpoint,
  extraFields,
  maxFiles = 1,
  ctaLabel = "วิเคราะห์",
  noFileCtaLabel = "เลือกรูปก่อนวิเคราะห์",
  compressImages = false,
  onResult,
  children,
  initialFile,
  autoSubmit = false,
}: {
  kind: UploadKind;
  endpoint: string;
  extraFields?: Record<string, unknown>;
  maxFiles?: number;
  ctaLabel?: string;
  noFileCtaLabel?: string;
  /** Compress images client-side before upload. Enable for meal image analysis. */
  compressImages?: boolean;
  onResult: (result: unknown) => void | Promise<void>;
  children?: ReactNode;
  /** Pre-seed the file picker with a file already captured elsewhere (e.g. the universal intake classifier), so the user never has to re-select it. */
  initialFile?: File;
  /** When true (only meaningful together with initialFile), submit automatically once seeded instead of waiting for a manual button click. */
  autoSubmit?: boolean;
}) {
  const [files, setFiles] = useState<File[]>(initialFile ? [initialFile] : []);
  const [previews, setPreviews] = useState<string[]>(
    initialFile ? [URL.createObjectURL(initialFile)] : [],
  );
  const [inputKey, setInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  useEffect(() => {
    if (!initialFile || !autoSubmit || autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile, autoSubmit]);

  function removeFile(indexToRemove: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setPreviews((prev) => {
      if (prev[indexToRemove]) {
        URL.revokeObjectURL(prev[indexToRemove]);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    const isMealUpload = kind === "meal";
    const mealType = typeof extraFields?.mealType === "string" ? extraFields.mealType.trim() : "";

    if (!files.length) {
      setError(isMealUpload ? "กรุณาเลือกรูปอาหารก่อน" : "กรุณาเลือกรูปก่อน");
      return;
    }

    if (isMealUpload && !mealType) {
      setError("กรุณาเลือกประเภทมื้ออาหาร");
      return;
    }

    if (files.some((file) => !file.type.startsWith("image/"))) {
      setError(isMealUpload ? "รูปภาพไม่ถูกต้อง ลองเลือกรูปใหม่" : "รองรับเฉพาะไฟล์รูปภาพ");
      return;
    }

    if (files.length > maxFiles) {
      setError(`เลือกได้ไม่เกิน ${maxFiles} รูปต่อครั้ง`);
      return;
    }

    // File size guards — relax the per-file limit when compression is enabled,
    // since compression handles large originals. The payload guard below is the
    // real safety net in that case.
    if (compressImages) {
      if (files.some((file) => file.size > COMPRESS_MAX_FILE_BYTES)) {
        setError("รูปภาพใหญ่เกินไป ลองเลือกรูปที่เล็กลง");
        return;
      }
    } else {
      if (isMealUpload && files.some((file) => file.size > MEAL_MAX_FILE_BYTES)) {
        setError("รูปภาพใหญ่เกินไป ลองเลือกรูปที่เล็กลง");
        return;
      }
      if (files.some((file) => file.size > 6 * 1024 * 1024)) {
        setError("รูปใหญ่เกินไป กรุณาใช้ไฟล์ละไม่เกิน 6MB");
        return;
      }
    }

    setLoading(true);
    try {
      // ── 1. Compress images (meal only) ──────────────────────────────────────
      let filesToSend: File[] = files;
      if (compressImages) {
        const results = await Promise.allSettled(files.map((f) => compressImage(f)));
        filesToSend = results.map((result, i) => {
          if (result.status === "fulfilled") return result.value.file;
          // Compression failed (e.g. invalid JPEG data) — use the original
          return files[i];
        });

        if (process.env.NODE_ENV === "development") {
          results.forEach((result, i) => {
            if (result.status === "fulfilled") {
              const { originalSize, compressedSize, wasCompressed } = result.value;
              console.info("[meal-compression]", {
                file: files[i].name,
                originalSize,
                compressedSize,
                wasCompressed,
                savedPct: wasCompressed
                  ? `${Math.round((1 - compressedSize / originalSize) * 100)}%`
                  : "0%",
              });
            } else {
              console.warn("[meal-compression-failed]", {
                file: files[i].name,
                error: result.reason,
              });
            }
          });
        }
      }

      // ── 2. Payload size guard ───────────────────────────────────────────────
      // base64 inflates each byte to ~4/3 chars. Guard before converting so we
      // never build a string that would OOM or hit Vercel's 4.5 MB body limit.
      if (compressImages) {
        const estimatedBytes = filesToSend.reduce(
          (sum, f) => sum + Math.ceil(f.size / 3) * 4,
          0,
        );
        if (estimatedBytes > MAX_PAYLOAD_BYTES) {
          throw new Error(
            "รูปยังใหญ่เกินไปสำหรับการวิเคราะห์ ลองเลือกรูปน้อยลงหรือเลือกรูปที่เล็กลง",
          );
        }
      }

      // ── 3. Convert to data URLs ─────────────────────────────────────────────
      const imageDataUrls = await Promise.all(filesToSend.map(fileToDataUrl));
      if (isMealUpload && imageDataUrls.length === 0) {
        throw new Error("กรุณาเลือกรูปอาหารก่อน");
      }
      if (!imageDataUrls[0]) {
        throw new Error("วิเคราะห์รูปไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง");
      }
      if (isMealUpload && imageDataUrls.some((img) => !img || !img.startsWith("data:image/"))) {
        throw new Error("รูปภาพไม่ถูกต้อง ลองเลือกรูปใหม่");
      }

      if (process.env.NODE_ENV === "development") {
        const firstFile = filesToSend[0];
        console.info(isMealUpload ? "[meal-upload-debug]" : "[upload-debug]", {
          uploadType: kind,
          selectedFilesLength: filesToSend.length,
          firstFileName: firstFile?.name,
          firstFileType: firstFile?.type,
          firstFileSize: firstFile?.size,
          mealType: isMealUpload ? mealType : undefined,
          hasImageDataUrl: Boolean(imageDataUrls[0]),
          imageDataUrlPrefix: imageDataUrls[0]?.slice(0, 30),
          requestRoute: endpoint,
        });
      }

      // ── 4. POST to API ──────────────────────────────────────────────────────
      const payload = {
        imageDataUrl: imageDataUrls[0],
        imageDataUrls,
        ...extraFields,
      };
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // 413 arrives as HTML from Vercel's edge, not JSON — handle before json parse
      if (response.status === 413) {
        throw new Error(
          "รูปใหญ่เกินไปสำหรับการวิเคราะห์ ลองเลือกรูปน้อยลงหรือเลือกรูปที่เล็กลง",
        );
      }

      if (!response.ok) {
        const message = await getApiErrorMessage(
          response,
          isMealUpload
            ? "วิเคราะห์รูปอาหารไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง"
            : "วิเคราะห์รูปไม่สำเร็จ",
        );
        throw new Error(message);
      }

      const result = await response.json();
      await onResult(result);
      previews.forEach((url) => URL.revokeObjectURL(url));
      setFiles([]);
      setPreviews([]);
      setInputKey((value) => value + 1);
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn(kind === "meal" ? "[meal-analysis-error]" : "[upload-debug]", err);
      }
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="upload-image-form">
      <label
        className={`flex min-h-[96px] cursor-pointer flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed px-4 py-4 text-center transition-colors ${
          files.length > 0
            ? "border-[var(--primary)] bg-[var(--primary-soft)]/20"
            : "border-[var(--border-warm)] bg-white/70 hover:border-[var(--primary)]/60 hover:bg-[var(--surface)]"
        }`}
      >
        <input
          key={inputKey}
          type="file"
          className="hidden"
          accept="image/*"
          multiple={maxFiles > 1}
          onChange={(event) => {
            const incoming = Array.from(event.target.files || []).slice(0, maxFiles);
            setFiles(incoming);
            previews.forEach((url) => URL.revokeObjectURL(url));
            setPreviews(incoming.map((file) => URL.createObjectURL(file)));
          }}
        />
        {files.length === 0 ? (
          <>
            <span className="text-2xl">📷</span>
            <p className="text-sm font-bold text-[var(--foreground)]">แตะเพื่อเลือกรูป</p>
            <p className="text-xs text-[var(--muted-text)]">
              {kind === "meal"
                ? "สูงสุด 4 รูป · ใช้เพื่อวิเคราะห์มื้อนี้เท่านั้น"
                : `สูงสุด ${maxFiles} รูป · ใช้เพื่อวิเคราะห์ครั้งนี้เท่านั้น`}
            </p>
            {kind === "meal" && compressImages && (
              <p className="text-xs text-[var(--color-text-muted)]">ระบบจะย่อรูปก่อนวิเคราะห์อัตโนมัติ</p>
            )}
          </>
        ) : (
          <>
            <span className="text-2xl text-[var(--primary-strong)]">✓</span>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              {files.length === 1 ? files[0].name : `${files.length} รูปที่เลือกไว้`}
            </p>
            <p className="text-xs text-[var(--primary-strong)] underline underline-offset-2">เปลี่ยนรูป</p>
          </>
        )}
      </label>

      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-2" data-testid="upload-thumbnails-grid">
          {files.map((file, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-[var(--border-warm)] bg-slate-100">
              <img
                src={previews[idx] || ""}
                alt={`Selected preview ${idx + 1}`}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeFile(idx);
                }}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-black/80 transition"
                aria-label="Remove image"
                data-testid={`remove-image-${idx}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {children}

      <LoadingButton
        className="btn-primary w-full"
        type="submit"
        loading={loading}
        loadingText="กำลังวิเคราะห์..."
        disabled={!files.length || loading}
      >
        {files.length ? ctaLabel : noFileCtaLabel}
      </LoadingButton>
      {error ? <ErrorState message={error} /> : null}
    </form>
  );
}

async function getApiErrorMessage(response: Response, fallback: string) {
  try {
    const data = (await response.json()) as { message?: unknown; error?: unknown };
    return typeof data.message === "string" ? data.message : fallback;
  } catch {
    return fallback;
  }
}
