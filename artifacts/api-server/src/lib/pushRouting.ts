// ============================================================================
// Which transport(s) a given user's notifications go out over.
//
// Novara can reach a user two ways:
//   - Web Push (VAPID) — browsers and installed PWAs
//   - APNs            — the native iOS app
//
// Someone who has both the PWA and the TestFlight app installed would
// otherwise receive every notification twice. The rule is therefore
// "prefer native": if the user has at least one APNs token we send only to
// APNs, and the Web Push subscriptions stay registered but idle.
//
// Pure and dependency-free so it can be unit-tested without a database.
// ============================================================================

export type PushTransport = "apns" | "web";

export interface TransportAvailability {
  apnsTokenCount: number;
  webSubscriptionCount: number;
}

/**
 * The transports to actually deliver on, in the order they should be tried.
 *
 * Returns at most one transport by design — see the dedupe rule above. It
 * returns an array rather than a single value so that a future policy (say,
 * "both for critical alerts") is a change of rule rather than a change of
 * shape at every call site.
 */
export function chooseTransports({
  apnsTokenCount,
  webSubscriptionCount,
}: TransportAvailability): PushTransport[] {
  if (apnsTokenCount > 0) return ["apns"];
  if (webSubscriptionCount > 0) return ["web"];
  return [];
}

/** Convenience predicate for "this user cannot be reached at all". */
export function hasNoReachableDevice(availability: TransportAvailability): boolean {
  return chooseTransports(availability).length === 0;
}
