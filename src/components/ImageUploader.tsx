"use client";

import { FormEvent, useState } from "react";
import { fileToDataUrl, uploadImage, type UploadKind } from "@/lib/storage";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

const MEAL_MAX_FILE_BYTES = 5 * 1024 * 1024;

export function ImageUploader({
  kind,
  endpoint,
  extraFields,
  maxFiles = 1,
  onResult,
}: {
  kind: UploadKind;
  endpoint: string;
  extraFields?: Record<string, unknown>;
  maxFiles?: number;
  onResult: (result: unknown) => void | Promise<void>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [inputKey, setInputKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const isMealUpload = kind === "meal";
    const mealType = typeof extraFields?.mealType === "string" ? extraFields.mealType.trim() : "";

    if (!files.length) {
      setError(isMealUpload ? "กรุณาเลือกรูปอาหารก่อน" : "กรุณาเลือกรูปก่อน");
      return;
    }

    if (isMealUpload && files.length !== 1) {
      setError("กรุณาเลือกรูปอาหารก่อน");
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
      const [imageDataUrls, imageUrls] = await Promise.all([
        Promise.all(files.map(fileToDataUrl)),
        Promise.all(files.map((file) => uploadImage(kind, file).catch(() => null))),
      ]);
      if (isMealUpload && imageDataUrls.length !== 1) {
        throw new Error("กรุณาเลือกรูปอาหารก่อน");
      }
      if (!imageDataUrls[0]) {
        throw new Error("วิเคราะห์รูปไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง");
      }
      if (isMealUpload && !imageDataUrls[0].startsWith("data:image/")) {
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
      const payload = isMealUpload
        ? {
            imageDataUrl: imageDataUrls[0],
            mealType,
            context: extraFields?.context,
          }
        : {
            imageDataUrl: imageDataUrls[0],
            imageDataUrls,
            imageUrl: imageUrls[0],
            imageUrls,
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
      await onResult(isMealUpload ? { ...result, imageUrl: imageUrls[0] } : result);
      setFiles([]);
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
    <form onSubmit={submit} className="space-y-3">
      <label
        className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors ${
          files.length > 0
            ? "border-[#42677f] bg-[#f5faf7]"
            : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
        }`}
      >
        <input
          key={inputKey}
          type="file"
          className="sr-only"
          accept="image/*"
          multiple={maxFiles > 1}
          onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, maxFiles))}
        />
        {files.length === 0 ? (
          <>
            <span className="text-3xl">📷</span>
            <p className="text-sm font-semibold text-slate-600">กดเพื่อเลือกรูปภาพ</p>
            <p className="text-xs text-slate-400">เลือกได้สูงสุด {maxFiles} รูป</p>
          </>
        ) : (
          <>
            <span className="text-2xl text-[#42677f]">✓</span>
            <p className="text-sm font-semibold text-[#17201d]">
              {files.length === 1 ? files[0].name : `${files.length} รูปที่เลือกไว้`}
            </p>
            <p className="text-xs text-[#42677f] underline underline-offset-2">เปลี่ยนรูป</p>
          </>
        )}
      </label>
      <button className="btn-primary w-full" type="submit" disabled={loading}>
        วิเคราะห์ด้วยโค้ช AI
      </button>
      {loading ? <LoadingState label="กำลังวิเคราะห์..." /> : null}
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
