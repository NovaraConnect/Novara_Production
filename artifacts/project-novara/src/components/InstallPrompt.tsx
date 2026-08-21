import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { X, Share, MoreVertical, Plus, Download } from "lucide-react";

type Platform = "ios" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

function isStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let deferredPrompt: Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as typeof deferredPrompt;
});

export function useInstallPrompt() {
  const [, setLocation] = useLocation();
  return () => setLocation("/install");
}

export default function InstallPrompt() {
  const [dismissed, setDismissed] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const key = "novara_install_dismissed";
    if (localStorage.getItem(key) === "1") setDismissed(true);
  }, []);

  if (dismissed || isStandaloneMode()) return null;

  const platform = detectPlatform();

  function dismiss() {
    localStorage.setItem("novara_install_dismissed", "1");
    setDismissed(true);
  }

  async function handleInstall() {
    if (platform === "android" && deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDismissed(true);
        return;
      }
    }
    setLocation("/install");
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-safe-bottom pb-4 pointer-events-none">
      <div
        className="pointer-events-auto mx-auto max-w-md bg-white border border-gray-200 rounded-2xl shadow-xl p-4 flex items-center gap-3"
        style={{ borderLeft: "4px solid #2952cc" }}
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-[#2952cc]/10 flex items-center justify-center">
          <img src="/icon-192.png" alt="Novara" className="w-8 h-8 rounded-lg" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Install this app on your phone</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">Get the full experience — works offline</p>
        </div>
        <button
          onClick={handleInstall}
          className="flex-shrink-0 bg-[#2952cc] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1e3fa3] transition-colors"
        >
          Install
        </button>
        <button
          onClick={dismiss}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
