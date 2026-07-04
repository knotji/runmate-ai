"use client";

import { FormEvent, useState, useEffect } from "react";
import { fileToDataUrl, type UploadKind } from "@/lib/storage";
import { ErrorState } from "@/components/ErrorState";
import { LoadingButton } from "@/components/LoadingButton";

const MEAL_MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImageUploader({
  kind,
  endpoint,
  extraFields,
  maxFiles = 1,
  ctaLabel = "วิเคราะห์",
  noFileCtaLabel = "เลือกรูปก่อนวิเคราะห์",
  onResult,
}: {
  kind: UploadKind;
  endpoint: string;
  extraFields?: Record<string, unknown>;
  maxFiles?: number;
  ctaLabel?: string;
  noFileCtaLabel?: string;
  onResult: (result: unknown) => void | Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  function removeFile(indexToRemove: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setPreviews((prev) => {
      if (prev[indexToRemove]) {
        URL.revokeObjectURL(prev[indexToRemove]);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
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

    if (isMealUpload && files.some((file) => file.size > MEAL_MAX_FILE_BYTES)) {
      setError("รูปภาพใหญ่เกินไป ลองเลือกรูปที่เล็กลง");
      return;
    }

    if (files.some((file) => file.size > 6 * 1024 * 1024)) {
      setError("รูปใหญ่เกินไป กรุณาใช้ไฟล์ละไม่เกิน 6MB");
      return;
    }

    setLoading(true);
    try {
      const imageDataUrls = await Promise.all(files.map(fileToDataUrl));
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
        const firstFile = files[0];
        console.info(isMealUpload ? "[meal-upload-debug]" : "[upload-debug]", {
          uploadType: kind,
          selectedFilesLength: files.length,
          firstFileName: firstFile?.name,
          firstFileType: firstFile?.type,
          firstFileSize: firstFile?.size,
          mealType: isMealUpload ? mealType : undefined,
          hasImageDataUrl: Boolean(imageDataUrls[0]),
          imageDataUrlPrefix: imageDataUrls[0]?.slice(0, 30),
          requestRoute: endpoint,
        });
      }
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
      if (!response.ok) {
        const message = await getApiErrorMessage(response, isMealUpload ? "วิเคราะห์รูปอาหารไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง" : "วิเคราะห์รูปไม่สำเร็จ");
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
          className="sr-only"
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

      <LoadingButton
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-45"
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
