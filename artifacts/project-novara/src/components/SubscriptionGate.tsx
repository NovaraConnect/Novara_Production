import type { ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useProStatus } from "@/hooks/useProStatus";
import { subscriptionGate, SUBSCRIPTION_ROUTE } from "@/lib/purchases";

/**
 * Subscribe to start. There is no free plan: a signed-in user without a trial
 * or Pro sees the subscription screen in place of the app (Settings excepted,
 * so they can always sign out or delete their account).
 */
export function SubscriptionGate({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const { isKnown, isPro } = useProStatus();

  const gate = subscriptionGate({ isKnown, isPro, path });
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
