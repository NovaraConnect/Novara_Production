import { useState, useRef } from "react";
import { Camera, Image as ImageIcon, Loader2, X, ScanLine, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface ScannedContact {
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
}

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

// ────────────────────────────────────────────────────────────
// Text extraction heuristics
// ────────────────────────────────────────────────────────────
const ROLE_KEYWORDS =
  /\b(CEO|CFO|CTO|COO|CMO|CRO|VP|SVP|EVP|MD|GM|Director|Manager|Engineer|Developer|Designer|President|Founder|Co-Founder|Partner|Associate|Consultant|Analyst|Officer|Coordinator|Lead|Head|Principal|Senior|Junior|Account|Executive|Specialist|Strategist|Producer|Architect|Scientist|Researcher|Advisor|Representative|Recruiter|Talent)\b/i;

const COMPANY_SUFFIXES =
  /\b(Inc\.?|LLC|Ltd\.?|Corp\.?|Co\.?|Company|Group|Solutions|Technologies?|Tech|Services?|Systems?|Associates?|Partners?|Global|International|Studios?|Agency|Ventures?|Capital|Bank|Financial|Holdings?|Foundation|Labs?|Laboratories?|Institute|Consulting|Advisors?|Investments?|Management)\b/i;

function extractContactFields(rawText: string): ScannedContact {
  const result: ScannedContact = {};

  // Normalise: collapse multiple spaces, fix common OCR artefacts
  const text = rawText.replace(/\r/g, "\n").replace(/[ \t]+/g, " ");
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);

  // ── Email ─────────────────────────────────────────────────
  const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) result.email = emailMatch[0].toLowerCase();

  // ── Phone ─────────────────────────────────────────────────
  const phoneRe =
    /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|(\+\d{1,3}[-.\s]?)(\(?\d{1,4}\)?[-.\s]?){2,6}\d{2,}/;
  const phoneMatch = text.match(phoneRe);
  if (phoneMatch) {
    const candidate = phoneMatch[0].trim();
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) result.phone = candidate;
  }

  // Track which lines are already consumed
  const usedLines = new Set<string>();
  if (result.email) {
    lines.forEach(l => { if (l.toLowerCase().includes(result.email!.toLowerCase())) usedLines.add(l); });
  }
  if (result.phone) {
    lines.forEach(l => { if (l.replace(/\D/g, "").includes(result.phone!.replace(/\D/g, "").slice(0, 7))) usedLines.add(l); });
  }
  // Always skip URLs and web addresses
  lines.forEach(l => {
    if (/^(www\.|https?:\/\/|http:\/\/)/i.test(l)) usedLines.add(l);
    if (/\.(com|org|net|io|co\.)/i.test(l) && !/@/.test(l)) usedLines.add(l);
  });

  // ── Company — pass 1: explicit suffix (Tesla Inc, Google LLC, etc.) ────
  const companyBySuffix = lines.find(l => {
    if (usedLines.has(l)) return false;
    if (/^\+?\(?\d/.test(l)) return false;
    return COMPANY_SUFFIXES.test(l);
  });
  if (companyBySuffix) { result.company = companyBySuffix.trim(); usedLines.add(companyBySuffix); }

  // ── Role ──────────────────────────────────────────────────
  const roleLine = lines.find(l => {
    if (usedLines.has(l)) return false;
    if (/^\+?\(?\d/.test(l)) return false;
    return ROLE_KEYWORDS.test(l);
  });
  if (roleLine) { result.role = roleLine.trim(); usedLines.add(roleLine); }

  // ── Name ──────────────────────────────────────────────────
  // Look for 2–4 word line where every word starts with a capital letter,
  // no digits, no punctuation except hyphens (for hyphenated names).
  const nameLine = lines.find(l => {
    if (usedLines.has(l)) return false;
    if (/\d/.test(l)) return false;
    if (/@/.test(l)) return false;
    const words = l.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;
    return words.every(w =>
      /^[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜ][a-záéíóúàèìòùäëïöü]+$/.test(w) || // "Smith"
      /^[A-ZÁÉÍÓÚ\-]+$/.test(w) ||                                // "SMITH" or "MARY-JANE"
      /^[A-ZÁ][a-z]+\-[A-ZÁ][a-z]+$/.test(w)                    // "Mary-Jane"
    );
  });
  if (nameLine) {
    const parts = nameLine.trim().split(/\s+/);
    const tc = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    result.firstName = tc(parts[0]);
    result.lastName = parts.slice(1).map(tc).join(" ");
    usedLines.add(nameLine);
  }

  // ── Company — pass 2: standalone brand name (no suffix) ───────────────
  // Runs after name + role so those lines are already consumed.
  // Catches "Tesla", "Apple", "NVIDIA", "McKinsey & Company" etc.
  if (!result.company) {
    const companyByShape = lines.find(l => {
      if (usedLines.has(l)) return false;
      if (/^\+?\(?\d/.test(l)) return false;   // starts with digit → phone/address
      if (/@/.test(l)) return false;             // email
      if (ROLE_KEYWORDS.test(l)) return false;   // job title
      const words = l.split(/\s+/);
      if (words.length < 1 || words.length > 5) return false;
      // Every word must start with a capital letter and consist only of
      // letters, &, -, ., or , — filters out sentences and addresses.
      return words.every(w => /^[A-Z]/.test(w) && /^[A-Za-z&.,\-]+$/.test(w));
    });
    if (companyByShape) { result.company = companyByShape.trim(); usedLines.add(companyByShape); }
  }

  return result;
}

// ────────────────────────────────────────────────────────────

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
