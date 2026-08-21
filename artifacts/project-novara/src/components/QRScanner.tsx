import { useState, useRef, useEffect, useCallback } from "react";
import { QrCode, X, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface ScannedQRContact {
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
}

interface QRScannerProps {
  onExtracted: (data: ScannedQRContact) => void;
}

// ── vCard parser ─────────────────────────────────────────────
function parseVCard(raw: string): ScannedQRContact | null {
  if (!raw.trim().toUpperCase().startsWith("BEGIN:VCARD")) return null;

  const result: ScannedQRContact = {};

  const getField = (label: string): string => {
    // Match label (with optional param like ;TYPE=work) followed by : and value
    const re = new RegExp(`^${label}(?=[:;])[^:]*:(.*)$`, "im");
    return (raw.match(re)?.[1] ?? "").trim();
  };

  // FN (formatted name) — prefer over N field
  const fn = getField("FN");
  if (fn) {
    const parts = fn.split(/\s+/);
    result.firstName = parts[0] ?? "";
    result.lastName = parts.slice(1).join(" ") ?? "";
  }

  // N field — Last;First;Middle;Prefix;Suffix
  if (!result.firstName) {
    const n = getField("N");
    if (n) {
      const parts = n.split(";");
      result.firstName = (parts[1] ?? "").trim();
      result.lastName = (parts[0] ?? "").trim();
    }
  }

  const org = getField("ORG");
  if (org) result.company = org.split(";")[0].trim(); // ORG can have dept after ;

  const title = getField("TITLE");
  if (title) result.role = title;

  // EMAIL — grab first match anywhere
  const emailMatch = raw.match(/^EMAIL(?:[^:]*)?:(.+)$/im);
  if (emailMatch) result.email = emailMatch[1].trim();

  // TEL — grab first match anywhere
  const telMatch = raw.match(/^TEL(?:[^:]*)?:(.+)$/im);
  if (telMatch) result.phone = telMatch[1].trim();

  const hasData = result.firstName || result.email || result.phone || result.company;
  return hasData ? result : null;
}

// ── MECARD parser ─────────────────────────────────────────────
function parseMECARD(raw: string): ScannedQRContact | null {
  if (!raw.toUpperCase().startsWith("MECARD:")) return null;

  const result: ScannedQRContact = {};

  const get = (key: string): string => {
    const re = new RegExp(`${key}:([^;]+)`, "i");
    return (raw.match(re)?.[1] ?? "").trim();
  };

  const n = get("N");
  if (n) {
    // MECARD name is "LastName,FirstName" or just "FullName"
    const comma = n.indexOf(",");
    if (comma !== -1) {
      result.lastName = n.slice(0, comma).trim();
      result.firstName = n.slice(comma + 1).trim();
    } else {
      const parts = n.trim().split(/\s+/);
      result.firstName = parts[0] ?? "";
      result.lastName = parts.slice(1).join(" ") ?? "";
    }
  }

  const org = get("ORG");
  if (org) result.company = org;

  const email = get("EMAIL");
  if (email) result.email = email;

  const tel = get("TEL");
  if (tel) result.phone = tel;

  const hasData = result.firstName || result.email || result.phone || result.company;
  return hasData ? result : null;
}

// ── Classify QR content ──────────────────────────────────────
type QRParseResult =
  | { type: "vcard" | "mecard"; data: ScannedQRContact }
  | { type: "other"; raw: string };

function parseQRContent(raw: string): QRParseResult {
  const trimmed = raw.trim();

  const vcard = parseVCard(trimmed);
  if (vcard) return { type: "vcard", data: vcard };

  const mecard = parseMECARD(trimmed);
  if (mecard) return { type: "mecard", data: mecard };

  return { type: "other", raw: trimmed };
}

// ────────────────────────────────────────────────────────────
type ScanStatus = "idle" | "scanning" | "done" | "error";

// Cache the jsQR module after first load instead of dynamically
// re-importing it on every animation frame during scanning.
let jsQRModulePromise: Promise<typeof import("jsqr")["default"]> | null = null;
function loadJsQR() {
  if (!jsQRModulePromise) {
    jsQRModulePromise = import("jsqr").then((m) => m.default);
  }
  return jsQRModulePromise;
}

export function QRScanner({ onExtracted }: QRScannerProps) {
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);

  const stopCamera = useCallback(() => {
    activeRef.current = false;
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const closeModal = useCallback(() => {
    stopCamera();
    setModalOpen(false);
    setStatus("idle");
    setErrorMsg("");
  }, [stopCamera]);

  // Scan loop — runs every animation frame
  const scan = useCallback(() => {
    if (!activeRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(scan);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { rafRef.current = requestAnimationFrame(scan); return; }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // jsQR is loaded lazily once, then cached (not re-imported every frame)
    loadJsQR().then((jsQR) => {
      if (!activeRef.current) return;
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
      });

      if (code) {
        stopCamera();
        const result = parseQRContent(code.data);

        if (result.type === "vcard" || result.type === "mecard") {
          setStatus("done");
          setModalOpen(false);
          onExtracted(result.data);
          toast.success("Contact details added from QR code — review below.");
        } else {
          setStatus("error");
          setErrorMsg("This QR code doesn't contain contact details. Try scanning a digital contact card, or add the contact manually.");
          setModalOpen(false);
        }
        return;
      }

      rafRef.current = requestAnimationFrame(scan);
    }).catch(() => {
      rafRef.current = requestAnimationFrame(scan);
    });
  }, [stopCamera, onExtracted]);

  const openScanner = async () => {
    setStatus("scanning");
    setErrorMsg("");
    setModalOpen(true);
  };

  // Start camera when modal opens
  useEffect(() => {
    if (!modalOpen) return;

    let cancelled = false;
    activeRef.current = true;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        rafRef.current = requestAnimationFrame(scan);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        const isDenied = msg.toLowerCase().includes("denied") || msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed");
        stopCamera();
        setStatus("error");
        setModalOpen(false);
        setErrorMsg(
          isDenied
            ? "Please allow camera access to scan QR codes."
            : "Couldn't open camera. Try again or add the contact manually."
        );
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [modalOpen, scan, stopCamera]);

  const reset = () => {
    setStatus("idle");
    setErrorMsg("");
  };

  return (
    <>
      {/* ── Trigger button ── */}
      <div className="mt-3">
        {status === "idle" && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 gap-2 border-primary/30 text-primary hover:bg-primary/10 rounded-xl text-sm font-semibold"
            onClick={openScanner}
          >
            <QrCode className="w-4 h-4" />
            Scan QR Code
          </Button>
        )}

        {status === "scanning" && !modalOpen && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <QrCode className="w-4 h-4 text-primary animate-pulse" />
            Opening camera…
          </div>
        )}

        {status === "done" && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-sm font-medium text-foreground">QR contact added — review below</span>
            </div>
            <button type="button" onClick={reset} className="text-muted-foreground hover:text-foreground p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start justify-between rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2.5 gap-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span className="text-sm text-foreground">{errorMsg}</span>
            </div>
            <button type="button" onClick={reset} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Camera modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
          <div className="relative w-full max-w-[430px] px-4">
            {/* Close */}
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-0 right-4 z-10 bg-black/50 text-white rounded-full p-2"
              aria-label="Close scanner"
            >
              <X className="w-5 h-5" />
            </button>

            <p className="text-white text-center text-sm font-medium mb-4 mt-2">
              Point camera at a QR contact card
            </p>

            {/* Viewfinder */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-square w-full">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />
              {/* Targeting overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-56 border-2 border-white/70 rounded-2xl" style={{
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)"
                }} />
              </div>
            </div>

            <p className="text-white/60 text-center text-xs mt-4">
              Scanning automatically — no button needed
            </p>
          </div>

          {/* Hidden canvas for frame processing */}
          <canvas ref={canvasRef} className="hidden" aria-hidden />
        </div>
      )}
    </>
  );
}
