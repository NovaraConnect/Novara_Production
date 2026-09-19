// ============================================================================
// Light / dark / follow-the-device.
//
// Novara shipped dark-only in build 7, with the navy palette in :root and
// index.html hardcoding class="dark". That made the choice for everyone. This
// module is the state behind giving it back.
//
// THREE choices, not two. "system" is the default and is NOT a synonym for
// dark: it tracks the device and keeps tracking it, so someone whose phone
// flips to dark at sunset sees Novara follow without touching a setting.
//
// SPLIT DELIBERATELY: everything here is pure or storage-only, so the matching
// rules are unit-testable. The React wiring lives in hooks/useTheme.tsx and the
// pre-paint application lives inline in index.html (see applyTheme's note).
// ============================================================================

/** What the user picked. Persisted. */
export type ThemeChoice = "system" | "light" | "dark";

/** What that resolves to right now. Never persisted — it is derived. */
export type ResolvedTheme = "light" | "dark";

/** localStorage key. Namespaced because the web app and the iOS shell share an
 *  origin, so this sits alongside whatever else Novara stores. */
export const THEME_STORAGE_KEY = "novara.theme";

/** Follow the device unless told otherwise. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

/** The media query that answers "is the device in dark mode". */
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/** Narrows unknown storage contents. localStorage can hold anything — a value
 *  from an older build, or something a user typed into devtools. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (CHOICES as readonly string[]).includes(value);
}

/**
 * Reads the stored choice, falling back to the default.
 *
 * Wrapped because localStorage throws rather than returning null in Safari
 * private browsing, and a theme preference is never worth a blank screen.
 */
export function readStoredChoice(): ThemeChoice {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? raw : DEFAULT_THEME_CHOICE;
  } catch {
    return DEFAULT_THEME_CHOICE;
  }
}

/** Persists the choice. Silent on failure, for the same reason as above. */
export function storeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // A preference that cannot be saved still applies for this session.
  }
}

/** Turns a choice plus the current device setting into a concrete theme. */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "light") return "light";
  if (choice === "dark") return "dark";
  return systemPrefersDark ? "dark" : "light";
}

/** Asks the device, defensively — matchMedia is missing in some test envs. */
export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/** Browser/PWA chrome colour per theme. Must match index.html's inline copy. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: "#08111F",
  light: "#FAF8F5",
};

/**
 * Applies a resolved theme by toggling `.dark` on <html>, and points the
 * `theme-color` meta at the matching background so browser and PWA chrome
 * follows.
 *
 * `.dark` is the selector the palette, Clerk's shadcn theme and the handful of
 * shadcn `dark:` variants all key off, so that one class switch is the whole
 * mechanism.
 *
 * NOTE: index.html runs an inline copy of this logic before first paint. If
 * the class were only applied once React mounted, every light-mode user would
 * see a navy flash on every cold start. Keep the two in step — the storage
 * key, the default, the resolution rule and these colours.
 */
export function applyTheme(resolved: ResolvedTheme, root?: HTMLElement): void {
  const el = root ?? document.documentElement;
  el.classList.toggle("dark", resolved === "dark");

  try {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", THEME_COLOR[resolved]);
  } catch {
    // Chrome colour is cosmetic; never let it break a theme switch.
  }
}
