import { useState, useRef } from "react";
import { Image as ImageIcon, Loader2, X, ScanText, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { MAX_FILE_BYTES, recognizeImageText } from "@/lib/imageOcr";
import { parseLinkedInProfile, hasUsableFields, type LinkedInDraft } from "@/lib/linkedinParse";

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

      setStatus("done");
      onExtracted(draft);
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Draft prefilled — review &amp; edit below
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
