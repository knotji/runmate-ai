/**
 * Compress and resize an image file client-side.
 * Maximum dimension: 1280px.
 * Quality: 0.8.
 * Returns a JPEG Blob.
 */
export function compressImage(file: File, maxDim = 1280, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let width = img.width;
      let height = img.height;

      // Scale keeping aspect ratio
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            resolve(file);
          }
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(err);
    };
  });
}
