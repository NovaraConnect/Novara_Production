import type { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus } from "@/hooks/useProStatus";
import { subscriptionGate, SUBSCRIPTION_ROUTE } from "@/lib/purchases";

/**
 * Subscribe to start. While the API says a subscription is required, a
 * signed-in user without a trial or Pro sees the subscription screen in place
 * of the app (Settings excepted, so they can always sign out or delete their
 * account). With the switch off this renders its children untouched.
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const { subscriptionRequired } = useFeatures();
  const { isKnown, isPro } = useProStatus();

  const gate = subscriptionGate({ subscriptionRequired, isKnown, isPro, path });
  if (gate === "subscribe") return <Redirect to={SUBSCRIPTION_ROUTE} />;
  if (gate === "wait") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }
  return <>{children}</>;
}
