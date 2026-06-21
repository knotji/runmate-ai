"use client";

import { FormEvent, useState } from "react";
import { fileToDataUrl, uploadImage, type UploadKind } from "@/lib/storage";
import { LoadingState } from "@/components/LoadingState";
import { ErrorState } from "@/components/ErrorState";

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

    if (!files.length) {
      setError("กรุณาเลือกรูปก่อน");
      return;
    }

    if (files.some((file) => !file.type.startsWith("image/"))) {
      setError("รองรับเฉพาะไฟล์รูปภาพ");
      return;
    }

    if (files.length > maxFiles) {
      setError(`เลือกได้ไม่เกิน ${maxFiles} รูปต่อครั้ง`);
      return;
    }

    if (files.some((file) => file.size > 6 * 1024 * 1024)) {
      setError("รูปใหญ่เกินไป กรุณาใช้ไฟล์ละไม่เกิน 6MB");
      return;
    }

    setLoading(true);
    try {
      if (process.env.NODE_ENV === "development") {
        console.info("[upload-debug]", { uploadType: kind, selectedFileCount: files.length, analysisRoute: endpoint });
      }
      const [imageDataUrls, imageUrls] = await Promise.all([
        Promise.all(files.map(fileToDataUrl)),
        Promise.all(files.map((file) => uploadImage(kind, file).catch(() => null))),
      ]);
      if (kind === "meal" && imageDataUrls.length !== 1) {
        throw new Error("วิเคราะห์รูปอาหารไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง");
      }
      if (!imageDataUrls[0]) {
        throw new Error("วิเคราะห์รูปไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง");
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl: imageDataUrls[0],
          imageDataUrls,
          imageUrl: imageUrls[0],
          imageUrls,
          ...extraFields,
        }),
      });
      if (!response.ok) {
        throw new Error(kind === "meal" ? "วิเคราะห์รูปอาหารไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง" : "วิเคราะห์รูปไม่สำเร็จ");
      }
      const result = await response.json();
      await onResult(result);
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
      <input
        key={inputKey}
        className="control"
        type="file"
        accept="image/*"
        multiple={maxFiles > 1}
        onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, maxFiles))}
      />
      <p className="text-xs text-slate-500">เลือกได้สูงสุด {maxFiles} รูปต่อครั้ง</p>
      <button className="btn-primary w-full" type="submit" disabled={loading}>
        วิเคราะห์ด้วยโค้ช AI
      </button>
      {loading ? <LoadingState label="กำลังบันทึก..." /> : null}
      {error ? <ErrorState message={error} /> : null}
    </form>
  );
}
