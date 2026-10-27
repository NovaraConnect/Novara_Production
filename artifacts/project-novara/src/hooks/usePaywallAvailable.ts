import { useFeatures } from "@/hooks/useFeatures";
import { canUseNativePurchases } from "@/lib/nativeBridge";
import { isPaywallVisible } from "@/lib/purchases";

/**
 * Whether the Novara Pro subscription screen (SUBSCRIPTION_ROUTE, the Paywall
 * page) can be opened on this device right now: the iOS app with a
 * purchase-capable build, and the server's applePaywall flag on. Always false
 * in a browser. Anything that links to the subscription screen (Add Contact's
 * limit wall, a Settings row) should check this first, because the screen
 * redirects to Settings when it is false.
 */
export function usePaywallAvailable(): boolean {
  const { applePaywall } = useFeatures();
  return isPaywallVisible({
    nativePurchases: canUseNativePurchases(),
    applePaywallFlag: applePaywall,
    // University-entitled users never see payment offers. Entitlement
    // detection for university access arrives with that branch; until then
    // no user is university-entitled.
    universityEntitled: false,
  });
}
