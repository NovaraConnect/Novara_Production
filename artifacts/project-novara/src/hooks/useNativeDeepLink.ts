import { useEffect } from "react";
import { useLocation } from "wouter";
import { isNativeShell } from "@/lib/installPrompt";
import { markNativeAware } from "@/lib/nativeBridge";
import { resolveDeepLink } from "@/lib/nativeDeepLink";

/**
 * Makes a tapped push notification open the thing it is about.
 *
 * Mounted once, at the app root — NOT in Settings and NOT behind the
 * notifications toggle. Two reasons:
 *
 *  • Cold launch. When Novara is not running, iOS starts it and Capacitor
 *    holds the `pushNotificationActionPerformed` event (it is emitted with
 *    `retainUntilConsumed: true`) until something listens. A listener that
 *    only existed on the Notifications screen would never see it.
 *
 *  • Background and foreground. Both deliver the same event to the same
 *    listener, so all three cases are handled by this one subscription.
 *
 * The destination comes from the payload the backend already sends; anything
 * missing or untrusted falls back to the Dashboard (see lib/nativeDeepLink.ts).
 */
export function useNativeDeepLink(): void {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Tell the injected native script that this build manages its own bottom
    // navigation, so it stops removing the web one on the app's behalf.
    if (isNativeShell()) markNativeAware();

    if (!isNativeShell()) return;

    let cancelled = false;
    let remove: (() => void) | null = null;

    void (async () => {
      try {
        // Same dynamic-import rule as lib/nativePush.ts: this package must
        // never enter the bundle every browser user downloads.
        const { PushNotifications } = await import("@capacitor/push-notifications");

        const handle = await PushNotifications.addListener(
          "pushNotificationActionPerformed",
          (action: { notification?: { data?: Record<string, unknown> } }) => {
            setLocation(resolveDeepLink(action?.notification?.data));
          },
        );

        if (cancelled) {
          void handle.remove();
          return;
        }
        remove = () => void handle.remove();
      } catch {
        // An older shell without the plugin, or a browser. Notifications still
        // deliver; they just open the app where it was.
      }
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, [setLocation]);
}
