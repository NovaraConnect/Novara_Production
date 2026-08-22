import { useState, useRef } from "react";
import { Camera, Image as ImageIcon, Loader2, X, ScanLine, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { extractContactFields, type ScannedContact } from "@/lib/businessCardParse";

// Re-exported so existing importers (e.g. AddContact) keep working unchanged.
export type { ScannedContact };

interface BusinessCardScannerProps {
  onExtracted: (data: ScannedContact) => void;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

// Resize and slightly sharpen image for better OCR
async function preprocessImage(file: File): Promise<Blob> {
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
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      }, "image/jpeg", 0.92);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// Text extraction now lives in the pure, unit-tested parser
// `@/lib/businessCardParse` (imported above).

type ScanStatus = "idle" | "processing" | "done" | "error";

export function BusinessCardScanner({ onExtracted }: BusinessCardScannerProps) {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Please use a clearer, smaller image.");
      return;
    }

    setStatus("processing");

    try {
      // Lazy-load Tesseract only when first needed — keeps initial bundle small
      const { createWorker } = await import("tesseract.js");

      const preprocessed = await preprocessImage(file);

      // Use CDN worker/core so there are no path issues in any hosting environment
      const worker = await createWorker("eng", 1, {
        workerPath:
          "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js",
        langPath: "https://tessdata.projectnaptha.com/4.0.0_fast",
        corePath:
          "https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd.wasm.js",
        cacheMethod: "none",
      } as Parameters<typeof createWorker>[2]);

      const { data: { text } } = await worker.recognize(preprocessed);
      await worker.terminate();

      if (!text || text.trim().length < 5) {
        setStatus("error");
        toast.error("No text found — try a clearer photo or fill in manually.");
        return;
      }

      const extracted = extractContactFields(text);
      const hasData =
        extracted.firstName ||
        extracted.email ||
        extracted.phone ||
        extracted.company;

      if (!hasData) {
        setStatus("error");
        toast.error("Couldn't read the card clearly — please fill in manually.");
        return;
      }

      setStatus("done");
      onExtracted(extracted);
      toast.success("Card scanned — review and edit the pre-filled fields below");
    } catch (err) {
      console.error("[BusinessCardScanner OCR error]", err);
      setStatus("error");
      toast.error("Couldn't read the card clearly — please fill in manually.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selection of same file
    if (!file) return;
    processFile(file);
  };

  const reset = () => setStatus("idle");

  return (
    <div className="mb-6 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <ScanLine className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">
          Scan Business Card
        </span>
      </div>

      {/* ── Processing ── */}
      {status === "processing" && (
        <div className="flex items-center gap-3 py-1">
          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Reading your card…</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This takes 5–15 seconds
            </p>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {status === "done" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Fields pre-filled — review &amp; edit below
            </span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {status === "error" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-sm text-muted-foreground">
              Couldn't read the card — fill in manually
            </span>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md"
            aria-label="Try again"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Idle: two buttons ── */}
      {status === "idle" && (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Take a photo or upload an image to auto-fill contact fields.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-10 gap-2 border-primary/30 text-primary hover:bg-primary/10 rounded-xl text-sm font-semibold"
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="w-4 h-4" />
              Take Photo
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-10 gap-2 border-primary/30 text-primary hover:bg-primary/10 rounded-xl text-sm font-semibold"
              onClick={() => libraryRef.current?.click()}
            >
              <ImageIcon className="w-4 h-4" />
              Choose Photo
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-2">
            If the camera doesn't open, use <span className="font-medium">Choose Photo</span> to pick from your library instead.
          </p>
        </>
      )}

      {/* Hidden file inputs */}
      {/* capture="environment" → rear camera on mobile */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden
      />
      {/* No capture → photo library picker on mobile */}
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden
      />
    </div>
  );
}
