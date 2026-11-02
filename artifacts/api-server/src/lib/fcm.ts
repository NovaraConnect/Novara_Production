// ============================================================================
// Firebase Cloud Messaging: push for the native Android app.
//
// The Android twin of lib/apns.ts, with the same shape — (target, payload) =>
// "ok" | "gone" — so the scheduler treats every transport identically.
//
// INERT BY DEFAULT: with FCM_SERVICE_ACCOUNT_B64 unset, every send returns
// "gone" and nothing contacts Google. Deploying this code without the key
// changes nothing about existing behaviour.
// ============================================================================
import { createSign } from "node:crypto";
import { logger } from "./logger";
import type { PushPayload } from "./push";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const REQUEST_TIMEOUT_MS = 10_000;
// Google's access tokens last an hour. Renew early so one never expires mid-send.
const TOKEN_LIFETIME_SECONDS = 3600;
const TOKEN_RENEW_MARGIN_MS = 5 * 60 * 1000;

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * Reads the service account key. Like the APNs .p8, the JSON is multi-line, so
 * it is supplied base64-encoded. Returns null when absent or unusable.
 */
function serviceAccount(): ServiceAccount | null {
  const encoded = process.env["FCM_SERVICE_ACCOUNT_B64"];
  if (!encoded) return null;
  // The scheduler asks once per user, so parse (and report a bad key) only once.
  if (parsedKey?.encoded === encoded) return parsedKey.account;
  parsedKey = { encoded, account: parseServiceAccount(encoded) };
  return parsedKey.account;
}

let parsedKey: { encoded: string; account: ServiceAccount | null } | null = null;

function parseServiceAccount(encoded: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as Partial<ServiceAccount>;
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      return parsed as ServiceAccount;
    }
  } catch {
    // Reported below: the message must not include any of the key.
  }
  logger.error("FCM_SERVICE_ACCOUNT_B64 is not a valid service account key");
  return null;
}

export function isFcmConfigured(): boolean {
  return serviceAccount() !== null;
}

/**
 * Decides what a failed FCM delivery means for the stored token.
 *
 * "gone" means: stop trying, delete the token. Anything else is transient or
 * ours to fix, and the token is kept, because deleting a good token would
 * silently unsubscribe a real user.
 *
 * Pure, so the mapping is unit-testable without touching Google.
 */
export function classifyFcmFailure(
  status: number | undefined,
  errorCode: string | undefined,
): "gone" | "retryable" {
  // The app was uninstalled, or the token was replaced.
  if (status === 404 || errorCode === "UNREGISTERED") return "gone";
  // The token belongs to a different Firebase project.
  if (errorCode === "SENDER_ID_MISMATCH") return "gone";
  return "retryable";
}

/** The message body FCM expects. Pure, so its shape can be tested directly. */
export function buildFcmMessage(deviceToken: string, payload: PushPayload) {
  return {
    message: {
      token: deviceToken,
      notification: { title: payload.title, body: payload.body },
      // Same key as APNs and Web Push, so a tapped notification deep-links the
      // same way on every transport. FCM data values must be strings.
      ...(payload.url ? { data: { url: payload.url } } : {}),
      android: {
        priority: "HIGH",
        notification: {
          sound: "default",
          ...(payload.tag ? { tag: payload.tag } : {}),
        },
      },
    },
  };
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

let cachedToken: { value: string; expiresAt: number; clientEmail: string } | null = null;

/** Exchanges a signed JWT for a short-lived access token, as Google's OAuth requires. */
async function accessToken(account: ServiceAccount): Promise<string> {
  if (
    cachedToken &&
    cachedToken.clientEmail === account.client_email &&
    cachedToken.expiresAt - TOKEN_RENEW_MARGIN_MS > Date.now()
  ) {
    return cachedToken.value;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = [
    base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64Url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: issuedAt,
        exp: issuedAt + TOKEN_LIFETIME_SECONDS,
      }),
    ),
  ].join(".");
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${base64Url(signature)}`,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google refused the FCM credentials: ${res.status}`);

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000,
    clientEmail: account.client_email,
  };
  return data.access_token;
}

/** Pulls FCM's own error code out of a failed response. */
function fcmErrorCode(body: unknown): string | undefined {
  const details = (body as { error?: { details?: { errorCode?: string }[] } })?.error?.details;
  return details?.find((detail) => detail.errorCode)?.errorCode;
}

export async function sendFcm(
  deviceToken: string,
  payload: PushPayload,
): Promise<"ok" | "gone"> {
  const account = serviceAccount();
  if (!account) return "gone";

  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken(account)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildFcmMessage(deviceToken, payload)),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) return "ok";

    const errorCode = fcmErrorCode(await res.json().catch(() => null));
    if (classifyFcmFailure(res.status, errorCode) === "gone") {
      logger.info({ status: res.status, errorCode }, "FCM token is dead — removing");
      return "gone";
    }

    logger.error({ status: res.status, errorCode }, "FCM delivery failed (retryable)");
    return "ok"; // keep the token; this send is simply lost
  } catch (err) {
    logger.error({ err }, "FCM request threw");
    return "ok"; // never delete a token because of our own outage
  }
}
