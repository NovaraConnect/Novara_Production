// Shared source of truth for the full-page "install landing" gate shown to
// true first-time browser visitors at "/". Distinct from the separate
// dismissible floating install banner (see components/InstallPrompt.tsx),
// which uses its own "novara_install_dismissed" localStorage key and is
// unaffected by this flag.
export const INSTALL_PROMPT_SEEN_KEY = "novara_install_prompt_seen";

/**
 * True when the page is running inside the Capacitor iOS shell.
 *
 * The shell loads this same site from app.novaraconnect.group, so none of the
 * PWA signals fire: a WKWebView is not in standalone display mode and is not
 * Safari-standalone. Without this check the native app shows the "add to your
 * home screen" gate to people who have already installed it from TestFlight or
 * the App Store — which is exactly what it did before this was added.
 *
 * Two signals, because neither is sufficient on its own:
 *  - window.Capacitor is injected by the native bridge, but it arrives via a
 *    user script and is not guaranteed to be present before the first React
 *    render when the shell loads a remote URL.
 *  - the User-Agent suffix comes from `ios.appendUserAgent` in
 *    capacitor.config.ts and is there from the very first byte, but only in
 *    builds produced after that config shipped.
 */
export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;

  const bridge = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  try {
    if (bridge?.isNativePlatform?.() === true) return true;
  } catch {
    // A malformed bridge object must never take the whole app down.
  }

  return typeof navigator !== "undefined" && navigator.userAgent.includes("NovaraApp");
}

/** True only for a real PWA install: standalone display mode, or iOS Safari's
 *  non-standard navigator.standalone. Deliberately narrow — see
 *  isInstalledExperience() for the "don't nag about installing" predicate. */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * True when the app is running as an installed app rather than a browser tab —
 * either an installed PWA or the native shell.
 *
 * This is the predicate every "should we prompt to install?" decision should
 * use. isStandaloneDisplayMode() stays narrow so it keeps meaning what its
 * name says.
 */
export function isInstalledExperience(): boolean {
  return isStandaloneDisplayMode() || isNativeShell();
}

export function hasSeenInstallPrompt(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(INSTALL_PROMPT_SEEN_KEY) === "true";
}
