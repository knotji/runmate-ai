export type CompressImageResult = {
  file: File;
  originalSize: number;
  compressedSize: number;
  width: number;
  height: number;
  mimeType: string;
  wasCompressed: boolean;
};

/**
 * Compress and resize an image file client-side using canvas.
 *
 * - Scales down to maxDim (default 1280px) on the longest side, preserving aspect ratio.
 * - Outputs JPEG at quality 0.75 by default.
 * - If the compressed output is larger than the original, returns the original unchanged.
 * - If the canvas 2D context is unavailable, returns the original unchanged.
 * - Throws if the file is not an image or the image cannot be loaded.
 */
export function compressImage(
  file: File,
  { maxDim = 1280, quality = 0.75 }: { maxDim?: number; quality?: number } = {},
): Promise<CompressImageResult> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("compressImage must run in a browser environment"));
  }
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error(`Unsupported file type: "${file.type}"`));
  }

  return new Promise<CompressImageResult>((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      let w = naturalW;
      let h = naturalH;

      if (w > maxDim || h > maxDim) {
        if (w >= h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        resolve({
          file,
          originalSize: file.size,
          compressedSize: file.size,
          width: naturalW,
          height: naturalH,
          mimeType: file.type,
          wasCompressed: false,
        });
        return;
      }

      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("canvas.toBlob returned null"));
            return;
          }

          // Never increase payload size
          if (blob.size >= file.size) {
            resolve({
              file,
              originalSize: file.size,
              compressedSize: file.size,
              width: naturalW,
              height: naturalH,
              mimeType: file.type,
              wasCompressed: false,
            });
            return;
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            { type: "image/jpeg", lastModified: file.lastModified },
          );

          resolve({
            file: compressedFile,
            originalSize: file.size,
            compressedSize: blob.size,
            width: w,
            height: h,
            mimeType: "image/jpeg",
            wasCompressed: true,
          });
        },
        "image/jpeg",
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to load image: "${file.name}"`));
    };
  });
}
