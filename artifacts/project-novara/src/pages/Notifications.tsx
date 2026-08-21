import { useState } from "react";
import { useLocation } from "wouter";
import {
  Bell,
  BellOff,
  ArrowLeft,
  Check,
  Loader2,
  AlertTriangle,
  Smartphone,
  Info,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { useNotifications } from "@/hooks/useNotifications";
import { toast } from "sonner";

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-primary" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function NotifToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export default function Notifications() {
  const [, setLocation] = useLocation();
  const {
    isSupported,
    permission,
    isSubscribed,
    settings,
    loading,
    error,
    requestAndSubscribe,
    unsubscribe,
    updateSettings,
    sendTest,
  } = useNotifications();

  const [enabling, setEnabling] = useState(false);
  const [testing, setTesting] = useState(false);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream;

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  async function handleToggle(enabled: boolean) {
    if (enabled) {
      setEnabling(true);
      const ok = await requestAndSubscribe();
      setEnabling(false);
      if (ok) toast.success("Notifications enabled");
      else if (permission === "denied")
        toast.error("Notifications are blocked. Allow them in browser settings.");
    } else {
      await unsubscribe();
      toast.info("Notifications disabled");
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await sendTest();
      toast.success("Test notification sent!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send test");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mobile-container pb-24 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border/50 px-4 py-3 flex items-center gap-3 z-10">
        <button
          onClick={() => setLocation("/settings")}
          className="p-2 -ml-2 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold text-foreground">Notifications</h1>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6 max-w-md mx-auto w-full">

        {/* iOS PWA warning */}
        {isIOS && !isStandalone && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Install the app first</p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Push notifications on iPhone require the app to be installed to your Home Screen.{" "}
                <button
                  onClick={() => setLocation("/install")}
                  className="underline font-semibold"
                >
                  Install Novara →
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Not supported */}
        {!isSupported && !loading && (
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex gap-3">
            <BellOff size={18} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-gray-700">Not supported</p>
              <p className="text-xs text-gray-500 mt-1">
                Your browser doesn't support push notifications. Try Chrome or Firefox.
              </p>
            </div>
          </div>
        )}

        {/* Enable notifications */}
        <section className="bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  isSubscribed ? "bg-primary/10" : "bg-gray-100"
                }`}
              >
                {isSubscribed ? (
                  <Bell size={20} className="text-primary" />
                ) : (
                  <BellOff size={20} className="text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Push notifications</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isSubscribed
                    ? "Active on this device"
                    : permission === "denied"
                    ? "Blocked — update in browser settings"
                    : "Get reminded when contacts need attention"}
                </p>
              </div>
            </div>
            {enabling ? (
              <Loader2 size={20} className="text-primary animate-spin flex-shrink-0" />
            ) : (
              <Toggle
                checked={isSubscribed}
                onChange={handleToggle}
                disabled={!isSupported || permission === "denied" || loading || (isIOS && !isStandalone)}
              />
            )}
          </div>
        </section>

        {/* Notification types */}
        {isSubscribed && (
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              What to notify
            </p>
            <div className="bg-card border border-border/50 rounded-2xl shadow-sm px-4 divide-y divide-border/50">
              <NotifToggleRow
                label="Follow-ups due today"
                description="Get reminded when a contact's follow-up date is today."
                checked={settings.notifyDueToday}
                onChange={(v) => void updateSettings({ notifyDueToday: v })}
              />
              <NotifToggleRow
                label="Overdue contacts"
                description="Alert when contacts have missed their follow-up window."
                checked={settings.notifyOverdue}
                onChange={(v) => void updateSettings({ notifyOverdue: v })}
              />
              <NotifToggleRow
                label="Warming down alerts"
                description="Notified when a contact moves from Warm → Cooling or Cold."
                checked={settings.notifyStatusChange}
                onChange={(v) => void updateSettings({ notifyStatusChange: v })}
              />
              <NotifToggleRow
                label="Weekly digest"
                description="Monday summary of your network health and overdue contacts."
                checked={settings.notifyWeeklyDigest}
                onChange={(v) => void updateSettings({ notifyWeeklyDigest: v })}
              />
            </div>
          </section>
        )}

        {/* Timing */}
        {isSubscribed && (
          <section>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Reminder time
            </p>
            <div className="bg-card border border-border/50 rounded-2xl shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Daily check at</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Notifications are sent at 9:00 AM UTC each day
                </p>
              </div>
              <span className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full">
                09:00 UTC
              </span>
            </div>
          </section>
        )}

        {/* Test notification */}
        {isSubscribed && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="w-full flex items-center justify-center gap-2 border border-border rounded-2xl p-4 text-sm font-medium text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-50"
          >
            {testing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} className="text-primary" />
            )}
            Send test notification
          </button>
        )}

        {error && (
          <p className="text-xs text-destructive text-center bg-destructive/5 border border-destructive/10 rounded-xl p-3">
            {error}
          </p>
        )}

        {/* How it works */}
        <section className="bg-card border border-border/50 rounded-2xl shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Info size={15} className="text-muted-foreground" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              How it works
            </p>
          </div>
          <ul className="space-y-2">
            {[
              {
                icon: <Bell size={14} className="text-primary" />,
                text: "Notifications are sent by the Novara server — no third-party service.",
              },
              {
                icon: <Smartphone size={14} className="text-primary" />,
                text: "Works on Android Chrome and iPhone (installed PWA, iOS 16.4+).",
              },
              {
                icon: <Check size={14} className="text-primary" />,
                text: "If you later publish to the App Store, server logic is fully reusable with FCM/APNs.",
              },
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
