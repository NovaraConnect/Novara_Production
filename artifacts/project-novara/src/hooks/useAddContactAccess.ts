import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { usePaywallAvailable } from "@/hooks/usePaywallAvailable";
import { hasNativeBridge } from "@/lib/nativeBridge";
import {
  addContactWall,
  needsSubscriptionToAdd,
  subscriptionPlanFor,
  type SubscribeRoute,
} from "@/lib/purchases";

/**
 * Whether Add Contact may save, and what to show when it may not. Mirrors the
 * server (Pro or a trial is required); the server still refuses any save it
 * would not allow.
 */
export function useAddContactAccess(): {
  blocked: boolean;
  wall: { title: string; message: string; action: string } | null;
  showPaywallLink: boolean;
} {
  const proStatus = useProStatus();
  const { applePaywall } = useFeatures();
  const paywallAvailable = usePaywallAvailable();

  const blocked = needsSubscriptionToAdd(proStatus);
  const route: SubscribeRoute = paywallAvailable
    ? "paywall"
    : !applePaywall
      ? null
      : hasNativeBridge()
        ? "update-app"
        : "iphone-app";

  return {
    blocked,
    wall: blocked ? addContactWall(subscriptionPlanFor(proStatus.status), route) : null,
    showPaywallLink: route === "paywall",
  };
}
