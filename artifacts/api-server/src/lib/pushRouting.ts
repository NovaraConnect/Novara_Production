// ============================================================================
// Which transport(s) a given user's notifications go out over.
//
// Novara can reach a user three ways:
//   - Web Push (VAPID) — browsers and installed PWAs
//   - APNs            — the native iOS app
//   - FCM             — the native Android app
//
// Someone who has both the PWA and the TestFlight app installed would
// otherwise receive every notification twice. The rule is therefore
// "prefer native": if the user has at least one native token we send only to
// native, and the Web Push subscriptions stay registered but idle. An iPhone
// and an Android phone are different devices, so they both get it.
//
// Pure and dependency-free so it can be unit-tested without a database.
// ============================================================================

export type PushTransport = "apns" | "fcm" | "web";

export interface TransportAvailability {
  apnsTokenCount: number;
  /** Optional: only callers that have read fcm_tokens pass it. */
  fcmTokenCount?: number;
  webSubscriptionCount: number;
}

/**
 * The transports to actually deliver on, in the order they should be tried.
 *
 * Web Push is never combined with a native transport — see the dedupe rule
 * above.
 */
export function chooseTransports({
  apnsTokenCount,
  fcmTokenCount = 0,
  webSubscriptionCount,
}: TransportAvailability): PushTransport[] {
  const native: PushTransport[] = [];
  if (apnsTokenCount > 0) native.push("apns");
  if (fcmTokenCount > 0) native.push("fcm");
  if (native.length > 0) return native;
  if (webSubscriptionCount > 0) return ["web"];
  return [];
}

/** Convenience predicate for "this user cannot be reached at all". */
export function hasNoReachableDevice(availability: TransportAvailability): boolean {
  return chooseTransports(availability).length === 0;
}
