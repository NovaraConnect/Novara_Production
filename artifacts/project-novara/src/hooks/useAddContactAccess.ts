import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { usePaywallAvailable } from "@/hooks/usePaywallAvailable";
import { hasNativeBridge } from "@/lib/nativeBridge";
import {
  addContactBlock,
  addContactWall,
  subscriptionPlanFor,
  type SubscribeRoute,
} from "@/lib/purchases";

/**
 * Whether Add Contact may save, and what to show when it may not. Mirrors the
 * server (Free ceiling, or Pro / trial once a subscription is required); the
 * server still refuses any save it would not allow.
 */
export function useAddContactAccess(contactCount: number): {
  block: "subscription" | "limit" | null;
  wall: { title: string; message: string; action: string } | null;
  showPaywallLink: boolean;
} {
  const proStatus = useProStatus();
  const { applePaywall, subscriptionRequired } = useFeatures();
  const paywallAvailable = usePaywallAvailable();

  const block = addContactBlock({
    isKnown: proStatus.isKnown,
    isPro: proStatus.isPro,
    subscriptionRequired,
    contactCount,
  });
  const route: SubscribeRoute = paywallAvailable
    ? "paywall"
    : !applePaywall
      ? null
      : hasNativeBridge()
        ? "update-app"
        : "iphone-app";

  return {
    block,
    wall: block ? addContactWall(block, subscriptionPlanFor(proStatus.status), route) : null,
    showPaywallLink: route === "paywall",
  };
}
