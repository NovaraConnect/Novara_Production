// ============================================================================
// Shared client-side OCR helper. Runs ENTIRELY in the browser via tesseract.js
// (lazy-loaded from CDN) — the image is never uploaded, stored, or logged.
//
// Stage 1: used by LinkedInScreenshotImport. The existing BusinessCardScanner
// keeps its own inline copy for now (intentionally left untouched); it can be
// migrated onto this helper later behind characterization tests.
// ============================================================================

export const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

/** Resize (max 1400px) and re-encode to JPEG in-memory for better/faster OCR. */
export async function preprocessImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX_DIM = 1400;
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > MAX_DIM || h > MAX_DIM) {
        if (w > h) { h = Math.round((h * MAX_DIM) / w); w = MAX_DIM; }
        else { w = Math.round((w * MAX_DIM) / h); h = MAX_DIM; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image failed to load"));
    };
    img.src = url;
  });
}

/**
 * Recognize visible text from a user-selected image, fully on-device.
 * Returns the raw OCR text (caller parses it). Never uploads or logs the image.
 */
export async function recognizeImageText(file: File): Promise<string> {
  // Lazy-load tesseract only when first needed — keeps the initial bundle small.
  const { createWorker } = await import("tesseract.js");
  const preprocessed = await preprocessImage(file);

  // CDN worker/core/lang so there are no path issues in any hosting environment.
  const worker = await createWorker("eng", 1, {
    workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
    langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
    corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js",
    cacheMethod: "none",
  } as Parameters<typeof createWorker>[2]);

  try {
    const { data: { text } } = await worker.recognize(preprocessed);
    return text ?? "";
  } finally {
    await worker.terminate();
  }
}
