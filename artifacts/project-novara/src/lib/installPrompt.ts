// Shared source of truth for the full-page "install landing" gate shown to
// true first-time browser visitors at "/". Distinct from the separate
// dismissible floating install banner (see components/InstallPrompt.tsx),
// which uses its own "novara_install_dismissed" localStorage key and is
// unaffected by this flag.
export const INSTALL_PROMPT_SEEN_KEY = "novara_install_prompt_seen";

export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function hasSeenInstallPrompt(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(INSTALL_PROMPT_SEEN_KEY) === "true";
}
