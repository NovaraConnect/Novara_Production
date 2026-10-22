// ============================================================================
// Novara Pro paywall. NATIVE iOS SHELL ONLY.
//
// Shown only when every gate in isPaywallVisible() passes. In a browser, or on
// an older build, or with the server flag off, the route redirects to Settings
// and no payment control is rendered.
//
// The page never decides Pro itself. After Apple reports a purchase, it polls
// the server (GET /api/entitlements/me) until the RevenueCat webhook has
// written the entitlement.
// ============================================================================
import { useEffect, useState } from "react";
import { Redirect, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeatures } from "@/hooks/useFeatures";
import { useProStatus, PRO_STATUS_KEY } from "@/hooks/useProStatus";
import {
  canUseNativePurchases,
  getNativeProProducts,
  identifyNativePurchases,
  manageNativeSubscriptions,
  purchaseNativePro,
  restoreNativePurchases,
  type NativeProProduct,
  type ProPeriod,
} from "@/lib/nativeBridge";
import {
  ANNUAL_SAVING_LABEL,
  AUTO_RENEW_NOTICE,
  PRO_PERIOD_LABEL,
  isPaywallVisible,
  waitForPro,
} from "@/lib/purchases";
import { fetchProStatus } from "@/lib/api";

type Busy = null | "purchase" | "restore" | "manage";

export default function Paywall() {
  const [, setLocation] = useLocation();
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const features = useFeatures();
  const { isPro } = useProStatus();

  const visible = isPaywallVisible({
    nativePurchases: canUseNativePurchases(),
    applePaywallFlag: features.applePaywall,
    // University-entitled users never see payment offers. Entitlement
    // detection for university access arrives with that branch; until then
    // no user is university-entitled on this branch.
    universityEntitled: false,
  });

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

  if (!visible) return <Redirect to="/settings" />;

  const monthly = products?.find((p) => p.period === "monthly");
  const annual = products?.find((p) => p.period === "annual");
  const chosen = selected === "monthly" ? monthly : annual;

  const refreshStatus = async (): Promise<boolean> => {
    const confirmed = await waitForPro(() => fetchProStatus(getToken));
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
      setMessage(
        confirmed
          ? "Novara Pro is active. Thank you."
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
    setBusy("restore");
    setMessage(null);
    try {
      const result = await restoreNativePurchases();
      if (result.outcome === "restored") {
        const confirmed = await refreshStatus();
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

  return (
    <div className="mobile-container pb-10 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6 flex items-center">
        <Button variant="ghost" size="icon" className="-ml-2 mr-2" onClick={() => setLocation("/settings")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-serif text-xl font-bold tracking-tight text-foreground">Novara Pro</h1>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6">
        <section className="space-y-3">
          <p className="text-base font-semibold text-foreground">Keep every contact, without a limit.</p>
          <ul className="space-y-2 text-sm text-foreground">
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 text-cooling" /> Unlimited contacts</li>
            <li className="flex gap-2"><Check className="w-4 h-4 mt-0.5 text-cooling" /> Every Novara Pro feature</li>
          </ul>
          <p className="text-xs text-muted-foreground">Free includes up to 6 contacts.</p>
        </section>

        {isPro ? (
          <section className="space-y-3">
            <p className="text-sm text-foreground">You're on Novara Pro.</p>
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
                  { period: "annual" as const, product: annual, title: "Annual", saving: ANNUAL_SAVING_LABEL },
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
                        {product.priceString} {PRO_PERIOD_LABEL[period]}
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
                  {busy === "purchase" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Subscribe"}
                </Button>
                <p className="text-xs text-muted-foreground leading-relaxed">{AUTO_RENEW_NOTICE}</p>
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

        <p className="text-xs text-muted-foreground text-center">
          <a className="underline" href="/privacy">Privacy Policy</a>
        </p>
      </main>
    </div>
  );
}
