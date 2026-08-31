import { useState, useRef } from "react";
import { Image as ImageIcon, Loader2, X, ScanText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MAX_FILE_BYTES, recognizeImageText } from "@/lib/imageOcr";
import { parseLinkedInProfile, hasUsableFields, type LinkedInDraft } from "@/lib/linkedinParse";
import { mergeLinkedInResult } from "@/lib/linkedinMerge";
import { useFeatures } from "@/hooks/useFeatures";
import { useAuth } from "@clerk/react";
import { apiFetch } from "@/lib/api";

interface LinkedInScreenshotImportProps {
  onExtracted: (data: LinkedInDraft) => void;
}

type Status = "idle" | "processing" | "done" | "error";

// Deliberately no LinkedIn logo/brandmark and no brand colour — a neutral
// "scan text" glyph. This is user-controlled screenshot import, not a LinkedIn
// integration. OCR runs on-device; the image is never uploaded, stored, or
// logged; nothing is saved until the user reviews and taps Save.
export function LinkedInScreenshotImport({ onExtracted }: LinkedInScreenshotImportProps) {
  const [status, setStatus] = useState<Status>("idle");
  const libraryRef = useRef<HTMLInputElement>(null);
  const { linkedinAiParse } = useFeatures();
  const { getToken } = useAuth();

  // Optional: refine the deterministic parse with the AI text parser. Sends the
  // OCR TEXT ONLY (never the screenshot), and falls back to `deterministic` on
  // any disable/miss/slow/error. Best-effort — never throws.
  const refineWithAi = async (text: string, deterministic: LinkedInDraft): Promise<LinkedInDraft> => {
    if (!linkedinAiParse) return deterministic;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await apiFetch(getToken, "/api/parse-linkedin-text", {
        method: "POST",
        json: { text },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return deterministic;
      const data = await res.json();
      if (data?.ok && data.fields) {
        return mergeLinkedInResult(deterministic, { fields: data.fields, confidence: data.confidence });
      }
      return deterministic;
    } catch {
      return deterministic;
    }
  };

  const processFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image (PNG or JPG).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Please use a smaller image (under 15 MB).");
      return;
    }

    setStatus("processing");
    try {
      const text = await recognizeImageText(file);

      if (!text || text.trim().length < 5) {
        setStatus("error");
        toast.error("Couldn't read the screenshot clearly — try a sharper image or fill in manually.");
        return;
      }

      const draft = parseLinkedInProfile(text);
      if (!hasUsableFields(draft)) {
        setStatus("error");
        toast.error("No profile details found — please fill in manually.");
        return;
      }

      const finalDraft = await refineWithAi(text, draft);

      setStatus("done");
      onExtracted(finalDraft);
      toast.success("Draft prefilled — review and edit the fields below.");
    } catch (err) {
      // Logs the OCR/runtime error only — never the image or the extracted text.
      console.error("[LinkedInScreenshotImport OCR error]", err);
      setStatus("error");
      toast.error("Couldn't read the screenshot right now — please fill in manually.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (file) processFile(file);
  };

  const reset = () => setStatus("idle");

  return (
    <div className="mb-6 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <ScanText className="w-4 h-4 text-primary shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-widest text-primary">
          Import from LinkedIn screenshot
        </span>
      </div>

      {/* ── Processing ── */}
      {status === "processing" && (
        <div className="flex items-center gap-3 py-1">
          <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Reading the profile…</p>
            <p className="text-xs text-muted-foreground mt-0.5">This takes 5–15 seconds</p>
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {status === "done" && (
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <span className="text-sm font-medium text-foreground">
                Draft prefilled below
              </span>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Screenshot reading isn't always perfect — please check every field for accuracy before saving.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={reset}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md shrink-0"
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
              Couldn't read the screenshot — fill in manually
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

      {/* ── Idle ── */}
      {status === "idle" && (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Upload a screenshot of a LinkedIn profile you already have. Novara reads the visible
            text to prefill a draft you can review and edit before saving. Novara doesn't connect
            to LinkedIn or access private data.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 gap-2 border-primary/30 text-primary hover:bg-primary/10 rounded-xl text-sm font-semibold"
            onClick={() => libraryRef.current?.click()}
          >
            <ImageIcon className="w-4 h-4" />
            Choose screenshot
          </Button>
        </>
      )}

      {/* Hidden file input — photo library / file picker (no camera capture). */}
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
