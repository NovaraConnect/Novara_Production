/**
 * Picks up a new web deploy in a page that has been open since before it.
 *
 * WHY. The iOS app is one web view that is never reloaded while the app is
 * alive (see NovaraRootViewController.swift). After a Render deploy, a phone
 * that only suspended Novara kept running the old bundle, and the old screen
 * was what iOS showed when the app came back — until WebKit happened to
 * reload the page and the new version replaced it. That is the "older version
 * flashes on open" report. Browsers and the installed PWA had the same
 * problem for the life of a long-open tab.
 *
 * WHAT. Each time the app comes back to the front, and every so often while it
 * stays there, fetch index.html straight from the server and compare its entry
 * script (Vite gives it a content hash, so it changes on every deploy that
 * changes code) with the one this page is running. If they differ, reload:
 *   - as soon as the app goes to the background, so the next open is already
 *     the new version and the screen iOS keeps for the app switcher is too;
 *   - or straight away when the check ran on return to the front (the user
 *     has only just opened the app), unless they are typing.
 * The periodic check while the app stays open never reloads in front of the
 * user; it waits for the next trip to the background.
 * Reloading is skipped on pages where a reload would throw away a half-typed
 * form. Any failure (offline, an odd response) leaves the page alone.
 */

const CHECK_INTERVAL_MS = 15 * 60_000;
/** Ignore a second check this soon after the last one (focus flapping). */
const MIN_GAP_MS = 30_000;

/** Pages with a form a reload would throw away. */
const FORM_PATHS = [/^\/add\/?$/, /^\/contacts\/[^/]+\/edit\/?$/, /^\/feedback\/?$/, /^\/settings\/?$/];

/** The hashed entry script in a built index.html, e.g. "/assets/index-C_EDvJSQ.js". */
export function entryScriptFrom(html: string): string | null {
  const match = html.match(/<script[^>]*type="module"[^>]*src="([^"]*\/assets\/index-[^"]+\.js)"/);
  return match ? new URL(match[1], "https://x").pathname : null;
}

/** The entry script this page was started from. */
function currentEntryScript(doc: Document): string | null {
  const el = doc.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return el ? new URL(el.src, "https://x").pathname : null;
}

/** Whether reloading now could lose something the user is in the middle of. */
export function reloadWouldInterrupt(pathname: string, active: Element | null): boolean {
  if (FORM_PATHS.some((re) => re.test(pathname))) return true;
  if (!active) return false;
  const tag = active.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (active as HTMLElement).isContentEditable === true;
}

export function startAppUpdateWatcher(): void {
  const running = currentEntryScript(document);
  // Dev server or an unexpected page shape: nothing reliable to compare.
  if (!running) return;

  let updateReady = false;
  let lastCheck = 0;

  const reloadIfSafe = () => {
    if (!updateReady || reloadWouldInterrupt(window.location.pathname, document.activeElement)) return;
    window.location.reload();
  };

  const check = async (onResume: boolean) => {
    if (updateReady || Date.now() - lastCheck < MIN_GAP_MS) return;
    lastCheck = Date.now();
    try {
      // A query string keeps the service worker's precache from answering,
      // and no-store keeps the HTTP cache (WKWebView's included) out of it.
      const res = await fetch(`/index.html?update-check=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const latest = entryScriptFrom(await res.text());
      if (latest && latest !== running) {
        updateReady = true;
        if (onResume && document.visibilityState === "visible") reloadIfSafe();
      }
    } catch {
      // Offline or blocked: try again on the next resume.
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") reloadIfSafe();
    else void check(true);
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) void check(true);
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") void check(false);
  }, CHECK_INTERVAL_MS);
}
