import { useEffect } from "react";
import { useAuth } from "@clerk/react";
import { canUseNativePurchases, identifyNativePurchases } from "@/lib/nativeBridge";

/**
 * Links the native purchase identity to the signed-in Clerk user ID, so the
 * RevenueCat webhook can credit a purchase to the right account. Runs once per
 * sign-in. It does nothing in a browser, or on a build without purchase support.
 */
export function useNativePurchaseIdentity(): void {
  const { userId, isLoaded, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    if (!canUseNativePurchases()) return;
    identifyNativePurchases(userId).catch(() => {
      // The paywall identifies again before every purchase, so a failure here
      // is retried at the point it matters.
    });
  }, [isLoaded, isSignedIn, userId]);
}
