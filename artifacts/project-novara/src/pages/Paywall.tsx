// ============================================================================
// Novara Pro subscription screen (SUBSCRIPTION_ROUTE). Payment controls appear
// in the NATIVE iOS SHELL ONLY.
//
// Two jobs:
//  - Subscribe to start. While the API requires a subscription, SubscriptionGate
//    sends every signed-in user without a trial or Pro here. There is no back
//    button then, only Account settings (sign out, delete account).
//  - Manage. Subscribers see their plan, Manage Subscription and Restore.
//
// Payment controls render only when every gate in isPaywallVisible() passes.
// In a browser or on an older app build: if a subscription is required, the
// page explains where to subscribe; otherwise it redirects to Settings.
//
// The page never decides Pro itself. After Apple reports a purchase, it polls
// the server (GET /api/entitlements/me) until the RevenueCat webhook has
// written the entitlement.
//
// One plan, monthly or yearly, each with a 7-day free trial that Apple runs.
// The trial is offered only when Apple says this Apple Account can still have
// it (NativeProProduct.trialDays > 0); otherwise the page shows plain prices.
// ============================================================================
import { useEffect, useState } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeatures } from "@/hooks/useFeatures";
import { usePaywallAvailable } from "@/hooks/usePaywallAvailable";
import { useProStatus, readProStatus, PRO_STATUS_KEY } from "@/hooks/useProStatus";
import { useSubscriptionState } from "@/hooks/useSubscriptionState";
import {
  getNativeProProducts,
  hasNativeBridge,
  identifyNativePurchases,
  manageNativeSubscriptions,
  purchaseNativePro,
  restoreNativePurchases,
  type NativeProProduct,
  type ProPeriod,
} from "@/lib/nativeBridge";
import {
  ANNUAL_SAVING_LABEL,
  KEEP_YOUR_CONTACTS_NOTE,
  PRO_PERIOD_LABEL,
  subscriptionTerms,
  TERMS_OF_USE_URL,
  trialTimeLeft,
  waitForPro,
} from "@/lib/purchases";

type Busy = null | "purchase" | "restore" | "manage";

function LegalLinks({ showAccount }: { showAccount: boolean }) {
  return (
    <p className="text-xs text-muted-foreground text-center space-x-1">
      <a className="underline" href={TERMS_OF_USE_URL} target="_blank" rel="noopener noreferrer">Terms of Use (EULA)</a>
      <span>·</span>
      <a className="underline" href="/privacy">Privacy Policy</a>
      {showAccount && (
        <>
          <span>·</span>
          <Link className="underline" href="/settings">Account settings</Link>
        </>
      )}
    </p>
  );
}

export default function Paywall() {
  const [, setLocation] = useLocation();
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const { isPro } = useProStatus();
  const { subscriptionRequired, localStoreKitTest } = useFeatures();
  const subscription = useSubscriptionState();
  const visible = usePaywallAvailable();
  // Subscribe to start: this screen stands in for the whole app.
  const required = subscriptionRequired && !isPro;

  const [products, setProducts] = useState<NativeProProduct[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProPeriod>("annual");
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    (async () => {
      try {
        await identifyNativePurchases(userId);
        const list = await getNativeProProducts();
        if (!cancelled) setProducts(list);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Plans aren't available right now.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, userId]);

  if (!visible) {
    if (!required) return <Redirect to="/settings" />;
    // A subscription is required but this device cannot sell one.
    return (
      <div className="mobile-container pb-10 flex flex-col min-h-[100dvh]">
        <header className="pt-safe pb-4 px-6">
          <h1 className="font-serif text-xl font-bold tracking-tight text-foreground pt-4">Novara Pro</h1>
        </header>
        <main className="flex-1 px-4 py-6 space-y-6">
          <p className="text-base font-semibold text-foreground">
            {subscription.plan === "expired" ? "Your subscription has ended." : "Novara starts with a 7-day free trial."}
          </p>
          <p className="text-sm text-muted-foreground">
            {hasNativeBridge()
              ? "Update Novara from the App Store to choose a plan."
              : "Choose a plan in the Novara app on iPhone, then sign in here with the same account."}
          </p>
          <p className="text-xs text-muted-foreground">{KEEP_YOUR_CONTACTS_NOTE}</p>
          <LegalLinks showAccount />
        </main>
      </div>
    );
  }

  const monthly = products?.find((p) => p.period === "monthly");
  const annual = products?.find((p) => p.period === "annual");
  const chosen = selected === "monthly" ? monthly : annual;
  const trialDays = chosen?.trialDays && chosen.trialDays > 0 ? chosen.trialDays : 0;

  const refreshStatus = async (): Promise<boolean> => {
    const confirmed = await waitForPro(() => readProStatus(getToken, localStoreKitTest));
    await queryClient.invalidateQueries({ queryKey: PRO_STATUS_KEY });
    return confirmed;
  };

  const subscribe = async () => {
    if (!chosen || !userId) return;
    setBusy("purchase");
    setMessage(null);
    try {
      await identifyNativePurchases(userId);
      const outcome = await purchaseNativePro(chosen.productId);
      if (outcome === "cancelled") return;
      if (outcome === "pending") {
        setMessage("Your purchase is waiting for approval. Novara Pro starts once it is approved.");
        return;
      }
      setMessage("Confirming your subscription…");
      const confirmed = await refreshStatus();
      if (confirmed && required) {
        // Subscribe to start: the app opens as soon as the server agrees.
        setLocation("/");
        return;
      }
      setMessage(
        confirmed
          ? trialDays > 0
            ? `Your ${trialDays}-day free trial has started. Enjoy Novara Pro.`
            : "Novara Pro is active. Thank you."
          : "Apple has your purchase. It can take a minute to appear here. Use Restore Purchases if it doesn't.",
      );
    } catch (err) {
      setMessage(
        err instanceof Error && err.message
          ? err.message
          : "The purchase didn't complete. Try again, or use Restore Purchases.",
      );
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!userId) return;
    setBusy("restore");
    setMessage(null);
    try {
      // Restore under the signed-in account. Restoring while anonymous would
      // leave the subscription on an identity the server ignores.
      await identifyNativePurchases(userId);
      const result = await restoreNativePurchases();
      if (result.outcome === "restored") {
        const confirmed = await refreshStatus();
        if (confirmed && required) {
          setLocation("/");
          return;
        }
        setMessage(confirmed ? "Novara Pro is restored." : "Your subscription was found. It can take a minute to appear.");
      } else {
        setMessage("No active Novara Pro subscription was found for this Apple Account.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Restore didn't complete. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const manage = async () => {
    setBusy("manage");
    try {
      await manageNativeSubscriptions();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't open subscription settings.");
    } finally {
      setBusy(null);
    }
  };

  const headline = isPro
    ? "Novara Pro"
    : subscription.plan === "expired"
      ? "Your subscription has ended. Choose a plan to keep using Novara."
      : required
        ? trialDays > 0
          ? `Start your ${trialDays}-day free trial`
          : "Choose your plan to start using Novara"
        : "Add everyone you meet, without a limit.";

  return (
    <div className="mobile-container pb-10 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6 flex items-center">
        {!required && (
          <Button variant="ghost" size="icon" className="-ml-2 mr-2" onClick={() => setLocation("/settings")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <h1 className="font-serif text-xl font-bold tracking-tight text-foreground">Novara Pro</h1>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6">
        <section className="space-y-3">
          <p className="text-base font-semibold text-foreground">{headline}</p>
          <ul className="space-y-2 text-sm text-foreground">
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 text-cooling" /> Unlimited contacts</li>
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 text-cooling" /> Import as many as you like from LinkedIn, business cards, QR codes and your iPhone contacts</li>
          </ul>
          <p className="text-xs text-muted-foreground">{KEEP_YOUR_CONTACTS_NOTE}</p>
        </section>

        {isPro ? (
          <section className="space-y-3">
            <p className="text-sm text-foreground">
              {subscription.plan === "trial"
                ? `You're on the Novara Pro free trial${subscription.daysLeft === null ? "" : ` (${trialTimeLeft(subscription.daysLeft)})`}. Your subscription starts when it ends unless you cancel in your Apple Account settings.`
                : `You're on ${subscription.label}.`}
            </p>
            <Button variant="outline" className="w-full rounded-xl" onClick={manage} disabled={busy !== null}>
              Manage Subscription
            </Button>
          </section>
        ) : (
          <section className="space-y-3">
            {loadError && <p className="text-sm text-destructive">{loadError}</p>}
            {!products && !loadError && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading plans…
              </p>
            )}
            {products && (
              <>
                {[
                  { period: "annual" as const, product: annual, title: "Yearly", saving: ANNUAL_SAVING_LABEL },
                  { period: "monthly" as const, product: monthly, title: "Monthly", saving: null },
                ].map(({ period, product, title, saving }) =>
                  product ? (
                    <button
                      key={period}
                      type="button"
                      onClick={() => setSelected(period)}
                      aria-pressed={selected === period}
                      className={`w-full text-left rounded-2xl border p-4 transition ${
                        selected === period ? "border-cooling bg-cooling-soft" : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="font-semibold text-foreground">Novara Pro {title}</span>
                        {saving && <span className="text-xs font-semibold text-cooling">{saving}</span>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {product.trialDays && product.trialDays > 0
                          ? `${product.trialDays} days free, then ${product.priceString} ${PRO_PERIOD_LABEL[period]}`
                          : `${product.priceString} ${PRO_PERIOD_LABEL[period]}`}
                      </div>
                    </button>
                  ) : null,
                )}
                {!annual && !monthly && <p className="text-sm text-muted-foreground">No plans are available right now.</p>}

                <Button
                  className="w-full rounded-xl"
                  onClick={subscribe}
                  disabled={!chosen || busy !== null}
                >
                  {busy === "purchase" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : trialDays > 0 ? (
                    `Start ${trialDays}-day free trial`
                  ) : (
                    "Subscribe"
                  )}
                </Button>
                {chosen && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {subscriptionTerms({ priceString: chosen.priceString, period: selected, trialDays })}
                  </p>
                )}
              </>
            )}
          </section>
        )}

        {message && <p role="status" className="text-sm text-foreground">{message}</p>}

        <section className="space-y-2 pt-2">
          <Button variant="ghost" className="w-full rounded-xl" onClick={restore} disabled={busy !== null}>
            {busy === "restore" ? "Restoring…" : "Restore Purchases"}
          </Button>
          {!isPro && (
            <Button variant="ghost" className="w-full rounded-xl" onClick={manage} disabled={busy !== null}>
              Manage Subscription
            </Button>
          )}
        </section>

        <LegalLinks showAccount={required} />
      </main>
    </div>
  );
}
