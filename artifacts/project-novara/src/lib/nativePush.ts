// ============================================================================
// Native push registration: APNs on iOS, Firebase Cloud Messaging on Android.
//
// Web Push does not exist inside a WKWebView — no Notification, no service
// worker, no PushManager — so the native apps cannot use the VAPID path in
// hooks/useNotifications.ts. They register with their platform's service
// instead and hand the device token to the backend, which stores it in
// apns_tokens or fcm_tokens.
//
// @capacitor/push-notifications is imported DYNAMICALLY and only ever behind
// isNativeShell(). The package ships JavaScript that would otherwise be
// bundled into the production web build for every browser user, where it can
// do nothing useful.
// ============================================================================
import { Capacitor } from "@capacitor/core";
import { isAndroidShell, isNativeShell } from "./installPrompt";

/** Which APNs host minted the token. See api-server/src/lib/apns.ts. */
export type ApnsEnvironment = "production" | "sandbox";

export interface NativePushRegistration {
  token: string;
  environment: ApnsEnvironment;
}

/** Shape of the permission result we care about, kept separate so the
 *  interpretation is testable without the plugin. */
export interface PermissionResultLike {
  receive?: string;
}

/**
 * Maps the plugin's permission result onto our own PermissionState words.
 *
 * Pure, because the mapping is easy to get subtly wrong and impossible to
 * exercise in a browser test environment.
 */
export function interpretNativePermission(
  result: PermissionResultLike | null | undefined,
): "granted" | "denied" | "default" {
  const receive = result?.receive;
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  // "prompt" and "prompt-with-rationale" both mean "not decided yet".
  return "default";
}

/**
 * Which APNs environment this build's tokens belong to.
 *
 * JavaScript cannot see whether the surrounding binary was signed for
 * development or distribution, and getting this wrong is the classic cause of
 * silent push failure: a sandbox token rejected by the production host with
 * BadDeviceToken. TestFlight and App Store builds — the only ones real users
 * run — are always production, so that is the default. A debug build run from
 * Xcode needs the override.
 */
export function resolveApnsEnvironment(
  override?: string | undefined,
): ApnsEnvironment {
  return override === "sandbox" ? "sandbox" : "production";
}

const REGISTRATION_TIMEOUT_MS = 15_000;

/** The Android notification channel. Must match default_notification_channel_id
 *  in AndroidManifest.xml. */
const ANDROID_CHANNEL_ID = "follow_up_reminders";

/**
 * True on an Android build that has Firebase configured. The site is loaded
 * remotely, so older builds run this code too, and registering without Firebase
 * crashes the app. See NovaraPushPlugin.java.
 */
export function isAndroidPushAvailable(): boolean {
  return isAndroidShell() && Capacitor.isPluginAvailable("NovaraPush");
}

/** Where this platform's device token is registered with the backend. */
export function pushTokenEndpoint(android: boolean = isAndroidShell()): string {
  return android ? "/api/notifications/fcm-token" : "/api/notifications/apns-token";
}

/** What to tell someone who has turned notifications off for Novara. */
export function deniedPermissionMessage(android: boolean = isAndroidShell()): string {
  return android
    ? "Notifications are turned off for Novara. Enable them in your phone's Settings → Apps → Novara → Notifications."
    : "Notifications are turned off for Novara. Enable them in iOS Settings → Novara → Notifications.";
}

/**
 * Requests permission and returns the device token.
 *
 * Throws with a readable message rather than resolving to null, so the caller
 * can surface the reason instead of a generic failure.
 */
export async function registerForNativePush(): Promise<NativePushRegistration> {
  if (!isNativeShell()) {
    throw new Error("Native push is only available inside the Novara app");
  }
  // Without Firebase configured, registering on Android crashes the app.
  if (isAndroidShell() && !isAndroidPushAvailable()) {
    throw new Error("Update Novara from Google Play to turn on notifications");
  }

  const { PushNotifications } = await import("@capacitor/push-notifications");

  const permission = interpretNativePermission(await PushNotifications.requestPermissions());
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? deniedPermissionMessage()
        : "Notification permission was not granted",
    );
  }

  return {
    token: await obtainDeviceToken(),
    environment: resolveApnsEnvironment(import.meta.env["VITE_APNS_ENVIRONMENT"]),
  };
}

/** Asks the platform for the token, once permission has been granted. */
async function obtainDeviceToken(): Promise<string> {
  const { PushNotifications } = await import("@capacitor/push-notifications");

  if (isAndroidShell()) {
    await PushNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: "Follow-up reminders",
      description: "Reminders about the people you want to stay in touch with",
      importance: 4,
    });
  }

  // The two listeners below are removed once the token has arrived. They used
  // to be left attached, which meant every trip through Settings added another
  // pair, and the only thing that ever cleared them was removeAllListeners() in
  // unregisterNativePush() — which also tore down the unrelated deep-link
  // listener (see hooks/useNativeDeepLink.ts) and left tapped notifications
  // going nowhere until the next cold start.
  const handles: { remove: () => Promise<void> }[] = [];

  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Timed out waiting for a device token")),
        REGISTRATION_TIMEOUT_MS,
      );

      void PushNotifications.addListener("registration", (t: { value: string }) => {
        clearTimeout(timer);
        resolve(t.value);
      }).then((handle) => handles.push(handle));

      void PushNotifications.addListener("registrationError", (err: unknown) => {
        clearTimeout(timer);
        reject(new Error(`Push registration failed: ${JSON.stringify(err)}`));
      }).then((handle) => handles.push(handle));

      void PushNotifications.register();
    });
  } finally {
    await Promise.allSettled(handles.map((handle) => handle.remove()));
  }
}

/**
 * The current token on an Android build, if this phone already allows
 * notifications. Firebase can replace a token at any time, so it is re-sent on
 * launch. Never prompts: returns null when permission hasn't been granted.
 */
export async function currentAndroidPushToken(): Promise<string | null> {
  if (!isAndroidPushAvailable()) return null;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  if (interpretNativePermission(await PushNotifications.checkPermissions()) !== "granted") return null;
  return obtainDeviceToken();
}

/**
 * Stops this device receiving pushes. Best-effort.
 *
 * Deliberately does NOT call removeAllListeners(): the deep-link listener in
 * hooks/useNativeDeepLink.ts is registered once per app launch, independently
 * of whether notifications are switched on, and tearing it down here meant
 * that turning notifications off and on again left every subsequent
 * notification tap opening the app on whatever screen it was last left on.
 * registerForNativePush() now cleans up its own listeners instead.
 */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeShell() || (isAndroidShell() && !isAndroidPushAvailable())) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.unregister();
  } catch {
    // Nothing actionable — the caller still clears the server-side token.
  }
}
