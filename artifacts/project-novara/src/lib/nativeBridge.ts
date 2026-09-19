// ============================================================================
// The web side of the native iOS shell's bridge.
//
// The iOS app (ios/App/App/Native/NovaraBridgeScript.swift) injects a small
// script into every page load that installs `window.NovaraNative`. This module
// is the typed, defensive wrapper around it.
//
// TWO RULES, both of which exist because the native binary and this web app
// ship on different schedules:
//
//  1. Everything here is FEATURE-DETECTED. A phone running an older build of
//     the app will not have `pickContact`, and the UI must simply not offer it
//     rather than throw.
//
//  2. Nothing here is required for the web app to work. In a browser every
//     function below is inert, and every caller has a non-native path.
//
// See also lib/installPrompt.ts (isNativeShell) — the predicate for "are we
// inside the app at all", which is deliberately independent of this bridge so
// it keeps working before the injected script has run.
// ============================================================================
import { isNativeShell } from "./installPrompt";

/** Fields the native layer can prefill. Intentionally the same shape as
 *  `ScannedContact` so the Add Contact form has ONE prefill path, not three. */
export interface NativeContactPayload {
  firstName?: string;
  lastName?: string;
  company?: string;
  role?: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  /** True when the user backed out of the system picker. Not an error. */
  cancelled?: boolean;
}

export interface NativeCardScan {
  /** Text recognised on-device by the Vision framework. Fed into the SAME
   *  extractContactFields() parser the browser's tesseract.js path uses. */
  text?: string;
  pages?: number;
  cancelled?: boolean;
}

export type HapticStyle = "selection" | "success" | "warning" | "error" | "light";

/** What the user picked. Mirrors ThemeChoice in lib/theme.ts, restated here so
 *  the bridge's surface does not depend on the theme module. */
export type NativeThemeChoice = "system" | "light" | "dark";

interface NovaraNativeBridge {
  version: number;
  platform: string;
  navigate(path: string): void;
  replace(path: string): void;
  back(): void;
  haptic(style: HapticStyle): void;
  pickContact?(): Promise<NativeContactPayload>;
  scanCard?(): Promise<NativeCardScan>;
  openSettings?(): void;
  setTheme?(choice: NativeThemeChoice): void;
}

function bridge(): NovaraNativeBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { NovaraNative?: NovaraNativeBridge }).NovaraNative;
  return candidate && typeof candidate.version === "number" ? candidate : null;
}

/** True when the injected native bridge is present and usable. */
export function hasNativeBridge(): boolean {
  return isNativeShell() && bridge() !== null;
}

/** True when this build of the app can open the system contact picker. */
export function canPickNativeContact(): boolean {
  return hasNativeBridge() && typeof bridge()?.pickContact === "function";
}

/** True when this build of the app can open the native document scanner. */
export function canScanNativeCard(): boolean {
  return hasNativeBridge() && typeof bridge()?.scanCard === "function";
}

/**
 * Tells the injected script that this web build knows it is running inside the
 * shell — so it stops hiding the bottom nav it would otherwise have to remove
 * itself. Safe to call anywhere, including in a browser.
 */
export function markNativeAware(): void {
  if (typeof window === "undefined") return;
  (window as Window & { __NOVARA_NATIVE_AWARE__?: boolean }).__NOVARA_NATIVE_AWARE__ = true;
}

/** Opens the system contact picker. Rejects with a readable message. */
export async function pickNativeContact(): Promise<NativeContactPayload> {
  const pick = bridge()?.pickContact;
  if (!pick) throw new Error("Contact import isn't available in this version of the app.");
  return pick();
}

/** Opens the native document scanner and returns the recognised text. */
export async function scanNativeCard(): Promise<NativeCardScan> {
  const scan = bridge()?.scanCard;
  if (!scan) throw new Error("Card scanning isn't available in this version of the app.");
  return scan();
}

/** Fire-and-forget haptic feedback. No-op outside the app. */
export function haptic(style: HapticStyle = "selection"): void {
  try {
    bridge()?.haptic(style);
  } catch {
    // Feedback is never worth an exception.
  }
}

/** Opens Novara's page in iOS Settings, for the permission-denied paths. */
export function openNativeSettings(): void {
  try {
    bridge()?.openSettings?.();
  } catch {
    // Same reasoning as above.
  }
}

/**
 * Tells the native shell which theme the user chose, so the status bar, the
 * tab bar and the scroll bounce area match the page.
 *
 * Sends the CHOICE, not the resolved theme: "system" maps to iOS's own
 * .unspecified, so the shell follows the device directly rather than being
 * pinned to whatever it resolved to when the page last loaded.
 *
 * Fire-and-forget and feature-detected: build 7 and earlier are hard-locked to
 * dark by UIUserInterfaceStyle in Info.plist and have no setTheme, so on those
 * builds this is a no-op — which is why the Settings control is hidden there
 * rather than offered and ignored (see canSetNativeTheme).
 */
export function setNativeTheme(choice: NativeThemeChoice): void {
  try {
    bridge()?.setTheme?.(choice);
  } catch {
    // Chrome matching is never worth an exception.
  }
}

/** True when this build of the app can follow the web app's theme. */
export function canSetNativeTheme(): boolean {
  return hasNativeBridge() && typeof bridge()?.setTheme === "function";
}

/**
 * Whether to offer the theme control at all.
 *
 * In a browser there is no native chrome to mismatch, so the choice is always
 * safe. Inside the app it is only safe when the binary can follow along: on
 * build 7 the shell is pinned dark, so a user choosing light would get a
 * light page under a light-on-light status bar. Better to not offer the
 * control than to offer one that half works.
 */
export function canOfferThemeChoice(): boolean {
  return !isNativeShell() || canSetNativeTheme();
}
