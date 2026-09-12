// ============================================================================
// Apple Push Notification service.
//
// Web Push does not work inside a WKWebView, so the native iOS app cannot use
// the VAPID path in lib/push.ts. This is the native equivalent, and it
// deliberately mirrors sendPush()'s shape — (target, payload) => "ok" | "gone"
// — so the scheduler treats both transports identically.
//
// INERT BY DEFAULT: with the APNS_* environment variables unset, every send
// returns "gone" and no provider is ever constructed. Deploying this code
// without keys changes nothing about existing behaviour.
// ============================================================================
import apn from "@parse/node-apn";
import { logger } from "./logger";
import type { PushPayload } from "./push";

/**
 * Which APNs host a token belongs to.
 *
 * This distinction is the single most common cause of "push silently does
 * nothing": TestFlight and App Store builds talk to *production*, while a
 * build run from Xcode onto a device talks to *sandbox*. A token minted
 * against one host is rejected by the other with BadDeviceToken, so the
 * environment is stored per token rather than assumed globally.
 */
export type ApnsEnvironment = "production" | "sandbox";

export const APNS_ENVIRONMENTS: readonly ApnsEnvironment[] = ["production", "sandbox"];

export function isApnsEnvironment(value: unknown): value is ApnsEnvironment {
  return value === "production" || value === "sandbox";
}

const KEY_ID = process.env["APNS_KEY_ID"] ?? "";
const TEAM_ID = process.env["APNS_TEAM_ID"] ?? "";
const BUNDLE_ID = process.env["APNS_BUNDLE_ID"] ?? "";
// The .p8 is multi-line PEM. Multi-line values in dashboard env vars get
// mangled in ways that are painful to debug, so it is supplied base64-encoded.
const PRIVATE_KEY_B64 = process.env["APNS_PRIVATE_KEY_B64"] ?? "";

export function isApnsConfigured(): boolean {
  return Boolean(KEY_ID && TEAM_ID && BUNDLE_ID && PRIVATE_KEY_B64);
}

export { BUNDLE_ID as APNS_BUNDLE_ID };

/**
 * Decides what a failed APNs delivery means for the stored token.
 *
 * "gone" means: stop trying, delete the token. Anything else is treated as a
 * transient error and the token is kept, because deleting a good token on a
 * blip would silently unsubscribe a real user.
 *
 * Pure, so the mapping is unit-testable without touching Apple.
 */
export function classifyApnsFailure(
  status: number | undefined,
  reason: string | undefined,
): "gone" | "retryable" {
  // 410 Unregistered: the app was uninstalled.
  if (status === 410) return "gone";
  // 400 BadDeviceToken: malformed, or minted for the other APNs environment.
  // 403 covers auth problems, which are ours to fix, not the token's fault.
  if (reason === "Unregistered" || reason === "BadDeviceToken" || reason === "DeviceTokenNotForTopic") {
    return "gone";
  }
  return "retryable";
}

const providers = new Map<ApnsEnvironment, apn.Provider>();

function providerFor(environment: ApnsEnvironment): apn.Provider {
  let provider = providers.get(environment);
  if (!provider) {
    provider = new apn.Provider({
      token: {
        key: Buffer.from(PRIVATE_KEY_B64, "base64"),
        keyId: KEY_ID,
        teamId: TEAM_ID,
      },
      production: environment === "production",
    });
    providers.set(environment, provider);
  }
  return provider;
}

export interface ApnsTarget {
  deviceToken: string;
  environment: ApnsEnvironment;
}

export async function sendApns(
  target: ApnsTarget,
  payload: PushPayload,
): Promise<"ok" | "gone"> {
  if (!isApnsConfigured()) return "gone";

  const note = new apn.Notification();
  note.topic = BUNDLE_ID;
  note.alert = { title: payload.title, body: payload.body };
  note.sound = "default";
  // tag is optional on the shared payload type; threadId is not nullable.
  if (payload.tag) note.threadId = payload.tag;
  // The web payload carries an in-app path; keep the same key so the client
  // handles deep links identically on both transports.
  note.payload = { url: payload.url };

  try {
    const result = await providerFor(target.environment).send(note, target.deviceToken);

    if (result.sent.length > 0) return "ok";

    const failure = result.failed[0];
    const status = failure?.status ? Number(failure.status) : undefined;
    const reason = failure?.response?.reason;

    if (classifyApnsFailure(status, reason) === "gone") {
      logger.info({ status, reason }, "APNs token is dead — removing");
      return "gone";
    }

    logger.error({ status, reason }, "APNs delivery failed (retryable)");
    return "ok"; // keep the token; this send is simply lost
  } catch (err) {
    logger.error({ err }, "APNs provider threw");
    return "ok"; // never delete a token because of our own outage
  }
}

/** Closes provider connections. Used so tests and shutdown do not hang. */
export function shutdownApns(): void {
  for (const provider of providers.values()) provider.shutdown();
  providers.clear();
}
