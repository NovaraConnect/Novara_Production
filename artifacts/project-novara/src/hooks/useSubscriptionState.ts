import { useProStatus } from "@/hooks/useProStatus";
import {
  cancelledUntil,
  daysLeft,
  formatAccessDate,
  subscriptionLabel,
  subscriptionPlanFor,
  type SubscriptionPlan,
} from "@/lib/purchases";

/**
 * The signed-in user's Novara Pro plan, ready to display (for example the
 * Settings "Manage Subscription" row).
 *
 *  - plan: "trial" | "monthly" | "annual" | "expired" | "none"
 *  - daysLeft: calendar days left in the free trial, else null
 *  - cancelled: true when auto-renew is off but access continues until
 *    accessUntil (ISO date); false when it renews or that is not known
 *  - label: "Free Trial · 5 days left", "Pro · Monthly", "Pro · Yearly",
 *    "Cancelled · access until Nov 3", "Subscription ended", or
 *    "Not subscribed"
 *  - isKnown: false only while the first answer is loading
 *
 * Display only. The server decides access.
 */
export function useSubscriptionState(): {
  plan: SubscriptionPlan;
  daysLeft: number | null;
  cancelled: boolean;
  accessUntil: string | null;
  label: string;
  isKnown: boolean;
} {
  const { status, isKnown } = useProStatus();
  const plan = subscriptionPlanFor(status);
  const days = plan === "trial" ? daysLeft(status?.expiresAt ?? null) : null;
  const until = cancelledUntil(status);
  return {
    plan,
    daysLeft: days,
    cancelled: until !== null,
    accessUntil: until,
    label: subscriptionLabel(plan, days, until ? formatAccessDate(until, "short") : null),
    isKnown,
  };
}
