import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { daysLeft, subscriptionLabel, subscriptionPlanFor, type SubscriptionPlan } from "@/lib/purchases";

/**
 * The signed-in user's Novara Pro plan, ready to display (for example the
 * Settings "Manage Subscription" row).
 *
 *  - plan: "trial" | "monthly" | "annual" | "expired" | "none"
 *  - daysLeft: whole days left in the free trial (rounded up), else null
 *  - label: "Free trial · 5 days left", "Novara Pro · Monthly",
 *    "Novara Pro · Annual", "Subscription ended", or "Not subscribed"
 *    ("Free Plan" while a subscription is not yet required)
 *  - isKnown: false only while the first answer is loading
 *
 * Display only. The server decides access on every save.
 */
export function useSubscriptionState(): {
  plan: SubscriptionPlan;
  daysLeft: number | null;
  label: string;
  isKnown: boolean;
} {
  const { status, isKnown } = useProStatus();
  const { subscriptionRequired } = useFeatures();
  const plan = subscriptionPlanFor(status);
  const days = plan === "trial" ? daysLeft(status?.expiresAt ?? null) : null;
  return { plan, daysLeft: days, label: subscriptionLabel(plan, days, subscriptionRequired), isKnown };
}
