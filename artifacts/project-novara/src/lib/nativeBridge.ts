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
  /** The contact's address-book photo, as a small square JPEG data URL. */
  photo?: string;
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

/** The two Novara Pro plans. Product IDs are never hard-coded here: the native
 *  side reports which StoreKit products it resolved. */
export type ProPeriod = "monthly" | "annual";

export interface NativeProProduct {
  productId: string;
  period: ProPeriod;
  /** Apple's localized price, e.g. "$4.99". Display this, never a constant. */
  priceString: string;
  /** The same price as a number in the local currency, e.g. 4.99. Used only to
   *  compare the two plans (the yearly saving); never displayed. */
  price?: number;
  /** Days of free trial this Apple Account would get on this plan, or 0 when it
   *  has had the trial already (Apple allows one) or eligibility is unknown. */
  trialDays?: number;
}

export type NativePurchaseOutcome = "purchased" | "pending" | "cancelled";

/** The simulator's current StoreKit subscription, reported only by DEBUG builds
 *  run with the "StoreKit Test" scheme. productId is null when StoreKit has
 *  never seen a purchase. */
export interface LocalStoreKitEntitlement {
  active: boolean;
  productId: string | null;
  expiresAt: string | null;
  isTrial: boolean;
  /** Auto-renew on (true) or cancelled (false); null when StoreKit can't say. */
  willRenew?: boolean | null;
}

export interface NativeRestoreResult {
  /** "restored" when Apple reported an active Novara Pro subscription. */
  outcome: "restored" | "nothing";
}

interface NovaraNativeBridge {
  version: number;
  platform: string;
  navigate(path: string): void;
  replace(path: string): void;
  back(): void;
  haptic(style: HapticStyle): void;
  pickContact?(): Promise<NativeContactPayload>;
  shareFile?(name: string, text: string): Promise<boolean>;
  scanCard?(): Promise<NativeCardScan>;
  openSettings?(): void;
  setTheme?(choice: NativeThemeChoice): void;
  // Bridge version 3: Apple In-App Purchase through RevenueCat.
  getProducts?(): Promise<{ products: NativeProProduct[] }>;
  identifyPurchases?(userId: string): Promise<{ ok: boolean }>;
  purchase?(productId: string): Promise<{ outcome: NativePurchaseOutcome }>;
  restorePurchases?(): Promise<NativeRestoreResult>;
  manageSubscriptions?(): Promise<void>;
  // Bridge version 4: Apple's App Store rating prompt.
  requestReview?(): Promise<{ requested: boolean }>;
  // Local testing only (DEBUG build, "StoreKit Test" scheme). Absent otherwise.
  localStoreKitEntitlement?(): Promise<LocalStoreKitEntitlement>;
}

/** First bridge version with purchase methods. Bridge versions 1 and 2 have no
 *  purchase methods, so the paywall cannot appear on an older binary. */
export const NATIVE_PURCHASE_BRIDGE_VERSION = 3;

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

/**
 * True when this build can sell Novara Pro through Apple. Requires the native
 * shell AND a bridge new enough to have the purchase methods. A browser never
 * qualifies, so Apple payment controls cannot appear there.
 */
export function canUseNativePurchases(): boolean {
  const b = bridge();
  return (
    hasNativeBridge() &&
    !!b &&
    b.version >= NATIVE_PURCHASE_BRIDGE_VERSION &&
    typeof b.getProducts === "function" &&
    typeof b.purchase === "function" &&
    typeof b.restorePurchases === "function" &&
    typeof b.identifyPurchases === "function" &&
    typeof b.manageSubscriptions === "function"
  );
}

/** True when this build of the app can open the native document scanner. */
export function canScanNativeCard(): boolean {
  return hasNativeBridge() && typeof bridge()?.scanCard === "function";
}

/** True when this build of the app can hand a file to the iOS share sheet.
 *  A web view cannot download files itself, so Export Data depends on it. */
export function canShareNativeFile(): boolean {
  return hasNativeBridge() && typeof bridge()?.shareFile === "function";
}

/** True when this build of the app can ask iOS for its App Store rating
 *  prompt (bridge version 4 and later). */
export function canRequestNativeReview(): boolean {
  return hasNativeBridge() && typeof bridge()?.requestReview === "function";
}

/** Asks iOS for its rating prompt. iOS decides whether it actually appears. */
export async function requestNativeReview(): Promise<void> {
  const request = bridge()?.requestReview;
  if (!request) return;
  await request();
}

/** Opens the share sheet for a text file. Resolves false if dismissed. */
export async function shareNativeFile(name: string, text: string): Promise<boolean> {
  const share = bridge()?.shareFile;
  if (!share) throw new Error("Sharing files isn't available in this version of the app.");
  return share(name, text);
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

// ---- Apple In-App Purchase (bridge version 3) -------------------------------
// Each call rejects with a readable message when the native side cannot
// complete it. Callers must treat a resolved purchase as "Apple reports the
// purchase", never as "Pro is active": the server decides that (see
// lib/purchases.ts and GET /api/entitlements/me).

function purchaseBridge(): NovaraNativeBridge {
  const b = bridge();
  if (!b || !canUseNativePurchases()) {
    throw new Error("Subscriptions aren't available in this version of the app.");
  }
  return b;
}

/** Links the native purchase identity to the signed-in Clerk user ID. */
export async function identifyNativePurchases(userId: string): Promise<void> {
  const b = purchaseBridge();
  await b.identifyPurchases!(userId);
}

/** The Novara Pro products Apple has resolved for this device. */
export async function getNativeProProducts(): Promise<NativeProProduct[]> {
  const b = purchaseBridge();
  const result = await b.getProducts!();
  return Array.isArray(result?.products) ? result.products : [];
}

export async function purchaseNativePro(productId: string): Promise<NativePurchaseOutcome> {
  const b = purchaseBridge();
  const result = await b.purchase!(productId);
  return result.outcome;
}

export async function restoreNativePurchases(): Promise<NativeRestoreResult> {
  const b = purchaseBridge();
  return b.restorePurchases!();
}

export async function manageNativeSubscriptions(): Promise<void> {
  const b = purchaseBridge();
  await b.manageSubscriptions!();
}

/**
 * Local testing only: the simulator's StoreKit subscription, or null when this
 * build is not a StoreKit Test build (always null in a browser and in any
 * build from TestFlight or the App Store).
 */
export async function getLocalStoreKitEntitlement(): Promise<LocalStoreKitEntitlement | null> {
  const b = bridge();
  if (!b || !hasNativeBridge() || typeof b.localStoreKitEntitlement !== "function") return null;
  return b.localStoreKitEntitlement();
}
