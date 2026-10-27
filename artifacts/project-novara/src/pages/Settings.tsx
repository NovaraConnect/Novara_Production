import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import ThemeSetting from "@/components/ThemeSetting";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Bell, Save, Check, X, Plus, LogOut, RefreshCw, Smartphone, ChevronRight, BookOpen, Target, Trash2, Bug, Lightbulb, CreditCard, Download, type LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { UserSettings } from "@/types/contact";
import { NovaraMark } from "@/components/NovaraMark";
import { isNativeShell } from "@/lib/installPrompt";
import { APP_VERSION } from "@/lib/appVersion";
import { deleteAccount } from "@/lib/api";
import { useContacts } from "@/hooks/useContacts";
import { canExportContacts, exportContacts } from "@/lib/exportContacts";
import { cn } from "@/lib/utils";
import { useSubscriptionState } from "@/hooks/useSubscriptionState";
import { usePaywallAvailable } from "@/hooks/usePaywallAvailable";
import { SUBSCRIPTION_ROUTE } from "@/lib/purchases";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const DOWNGRADE_OPTIONS: UserSettings["autoDowngradeAfterMonths"][] = [3, 6, 9, 12];

function labelMonths(m: number) {
  return m === 1 ? "1 month" : `${m} months`;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">{children}</p>;
}

/** One row of a grouped settings card: icon, label (and an optional line under
 *  it), an optional value on the right, and a chevron when it opens something. */
function SettingsRow({
  icon: Icon,
  label,
  detail,
  value,
  onClick,
  destructive,
  disabled,
  testId,
}: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  value?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      <Icon className={cn("h-5 w-5 shrink-0", destructive ? "text-destructive" : "text-foreground/80")} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px] font-medium", destructive ? "text-destructive" : "text-foreground")}>{label}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {value && <span className="shrink-0 text-sm text-muted-foreground">{value}</span>}
      {onClick && <ChevronRight className={cn("h-4 w-4 shrink-0", destructive ? "text-destructive" : "text-muted-foreground")} aria-hidden="true" />}
    </>
  );
  const row = "flex w-full items-center gap-4 px-4 py-3.5 text-left";
  if (!onClick) return <div className={row}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={cn(row, "transition-colors disabled:opacity-60", destructive ? "hover:bg-destructive/10" : "hover:bg-elevated")}
    >
      {body}
    </button>
  );
}

export default function Settings() {
  // Arriving from the Dashboard prompt via /settings#career-profile should
  // land on the editor, not the top of a long page. wouter does not scroll to
  // a hash by itself.
  useEffect(() => {
    if (window.location.hash !== "#career-profile") return;
    const target = document.getElementById("career-profile");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const [, setLocation] = useLocation();
  const { settings, updateSettings } = useSettings();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();

  // Inside the iOS app, "install this on your phone" is nonsense — they are
  // already in the installed app — and pointing at a non-App-Store install
  // route is exactly the kind of thing App Review objects to.
  const nativeApp = isNativeShell();

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { contacts } = useContacts();
  const subscription = useSubscriptionState();
  // Opens the subscription screen only where it can sell (the iPhone app with
  // the paywall on); elsewhere the row just shows the plan.
  const canManageSubscription = usePaywallAvailable();
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (contacts.length === 0) {
      toast.error("You have no contacts to export yet.");
      return;
    }
    setExporting(true);
    try {
      await exportContacts(contacts);
    } catch {
      toast.error("Couldn't export your contacts. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const replayTutorial = async () => {
    try {
      await updateSettings.mutateAsync({ hasSeenTutorial: false });
      // Straight to the introduction rather than via the Dashboard,
      // which would only redirect here anyway.
      setLocation("/welcome");
    } catch {
      toast.error("Failed to reset tutorial");
    }
  };

  // Account deletion, required by App Store Review Guideline 5.1.1(v) for any
  // app that lets people create an account. Irreversible, so it is behind a
  // confirmation and worded so nobody can tap it by accident.
  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await deleteAccount(getToken);
      setConfirmingDelete(false);
      toast.success("Your account and all its data have been deleted.");
      await signOut({ redirectUrl: `${basePath}/` });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete your account.");
    } finally {
      setDeleting(false);
    }
  };

  const [statement, setStatement] = useState(settings.careerStatement);
  const [saved, setSaved] = useState(false);

  const [newGoal, setNewGoal] = useState("");
  const [showGoalInput, setShowGoalInput] = useState(false);

  // Sync statement when settings load
  if (statement === "" && settings.careerStatement) {
    setStatement(settings.careerStatement);
  }

  // The server recalculates synchronously and returns a completion report, so
  // we can report the actual outcome instead of promising "immediate" updates.
  const reportRecalc = (result: unknown, prefix: string) => {
    const recalc = (result as { recalculation?: { ok: boolean; updated?: number; error?: string } } | undefined)?.recalculation;
    if (recalc && recalc.ok === false) {
      toast.error(`${prefix}, but recalculation failed: ${recalc.error ?? "unknown error"}`);
      return;
    }
    if (recalc && typeof recalc.updated === "number") {
      toast.success(`${prefix} — ${recalc.updated} contact${recalc.updated === 1 ? "" : "s"} updated`);
      return;
    }
    toast.success(prefix);
  };

  const handleSaveStatement = async () => {
    try {
      const res = await updateSettings.mutateAsync({ careerStatement: statement.trim() });
      setSaved(true);
      reportRecalc(res, "Career profile saved");
      setTimeout(() => setSaved(false), 2000);
    } catch {
      toast.error("Failed to save profile");
    }
  };

  const handleAddGoal = async () => {
    const trimmed = newGoal.trim();
    if (!trimmed) return;
    const current = settings.careerGoals ?? [];
    if (current.includes(trimmed)) { toast.error(`"${trimmed}" already exists`); return; }
    try {
      const res = await updateSettings.mutateAsync({ careerGoals: [...current, trimmed] });
      setNewGoal("");
      setShowGoalInput(false);
      reportRecalc(res, "Career goal added");
    } catch { toast.error("Failed to add goal"); }
  };

  const handleRemoveGoal = async (goal: string) => {
    try {
      const updated = (settings.careerGoals ?? []).filter(g => g !== goal);
      const res = await updateSettings.mutateAsync({ careerGoals: updated });
      reportRecalc(res, "Goal removed");
    } catch { toast.error("Failed to remove goal"); }
  };

  const handleDowngradeChange = async (months: UserSettings["autoDowngradeAfterMonths"]) => {
    try {
      await updateSettings.mutateAsync({ autoDowngradeAfterMonths: months });
    } catch { toast.error("Failed to update setting"); }
  };

  return (
    <div className="mobile-container pb-24 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Settings</h1>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col gap-7">

        {/* Who is signed in */}
        <section className="surface-card flex items-center gap-4 p-4">
          <NovaraMark size={56} className="shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold text-foreground">{user?.fullName || "Novara"}</p>
            {user && (
              <p className="truncate text-sm text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</p>
            )}
          </div>
        </section>

        <section>
          <SectionLabel>Account</SectionLabel>
          <div className="surface-card overflow-hidden divide-y divide-border/60">
            <SettingsRow icon={BookOpen} label="Replay Tutorial" onClick={replayTutorial} disabled={updateSettings.isPending} />
            <SettingsRow
              icon={CreditCard}
              label="Manage Subscription"
              value={subscription.isKnown ? subscription.label : undefined}
              onClick={canManageSubscription ? () => setLocation(SUBSCRIPTION_ROUTE) : undefined}
              testId="button-manage-subscription"
            />
            <SettingsRow icon={Bell} label="Notifications" onClick={() => setLocation("/notifications")} />
            {/* Signing out is reversible; deleting the account is not, so the
                two live in different groups and only the delete is red. */}
            <SettingsRow icon={LogOut} label="Sign out" onClick={() => signOut({ redirectUrl: `${basePath}/` })} />
          </div>
        </section>

        <section>
          <SectionLabel>Data &amp; Privacy</SectionLabel>
          <div className="surface-card overflow-hidden divide-y divide-border/60">
            {/* Hidden in iPhone app versions that cannot save files yet. */}
            {canExportContacts() && (
              <SettingsRow
                icon={Download}
                label="Export Data"
                detail={exporting ? "Preparing your file…" : "Download a copy of your contacts"}
                onClick={handleExport}
                disabled={exporting}
                testId="button-export-data"
              />
            )}
            <SettingsRow
              icon={Trash2}
              label="Delete Account"
              detail="Permanently removes your contacts and your Novara login"
              onClick={() => setConfirmingDelete(true)}
              destructive
              testId="button-delete-account"
            />
          </div>
        </section>

        <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your Novara account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your contacts, your career profile, your notification
                settings and your Novara login. It cannot be undone, and there is no way to
                recover the data afterwards. If you subscribe to Novara Pro, cancel it first in
                your iPhone's Settings → your name → Subscriptions: deleting your account
                doesn't stop Apple from billing you.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Keep my account</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  // Keep the dialog up while the request is in flight, so the
                  // screen does not flash back to Settings mid-delete.
                  event.preventDefault();
                  void handleDeleteAccount();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete-account"
              >
                {deleting ? "Deleting…" : "Delete everything"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <section>
          <SectionLabel>Preferences</SectionLabel>
          <div className="surface-card p-4 space-y-4">
            <div className="flex items-start gap-4">
              <RefreshCw className="h-5 w-5 shrink-0 text-foreground/80 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-[15px] font-medium text-foreground">Auto-downgrade cadence</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  After this many months, contacts move to a maintenance cadence (twice per year) automatically.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {DOWNGRADE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => handleDowngradeChange(opt)}
                  className={`rounded-xl border px-1 py-2 text-[13px] font-semibold transition-colors ${
                    settings.autoDowngradeAfterMonths === opt
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {labelMonths(opt)}
                </button>
              ))}
            </div>
          </div>
        </section>

        <ThemeSetting />

        {/* Career Profile */}
        <section id="career-profile" className="scroll-mt-24">
          <SectionLabel>Career Profile</SectionLabel>
          <div className="surface-card p-5 space-y-6">

            {/* Career statement */}
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Describe your career goals. Novara uses this to suggest the right importance and follow-up cadence for each contact.
              </p>
              <div className="space-y-2">
                <Textarea
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  placeholder="e.g. Breaking into early-stage VC, interested in AI/ML startups."
                  className="resize-none h-28 text-sm"
                  data-testid="input-career-statement"
                />
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleSaveStatement} className={saved ? "bg-warm text-[hsl(var(--primary-foreground))] hover:bg-warm/90" : ""} data-testid="button-save-statement">
                    {saved ? <Check className="w-4 h-4 mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                    {saved ? "Saved" : "Save"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Current Career Goals — drive dynamic priority */}
            <div className="border-t border-border/50 pt-5 space-y-3">
              <div className="flex items-start gap-2">
                <Target className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Current Career Goals</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    Contacts whose industry, function, or interests match these goals will rise in priority. Those with no overlap will fall. Changes take effect immediately.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {(settings.careerGoals ?? []).map((goal) => (
                  <span key={goal} className="inline-flex items-center gap-1.5 bg-warm-soft text-warm border border-warm/25 text-xs font-semibold px-3 py-1.5 rounded-full">
                    {goal}
                    <button onClick={() => handleRemoveGoal(goal)} className="hover:text-destructive transition-colors" aria-label={`Remove ${goal}`} disabled={updateSettings.isPending}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {showGoalInput ? (
                  <div className="flex items-center gap-1 border border-warm/50 rounded-full px-3 py-1 bg-input-background">
                    <Input
                      autoFocus value={newGoal}
                      onChange={(e) => setNewGoal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddGoal(); } if (e.key === "Escape") { setShowGoalInput(false); setNewGoal(""); } }}
                      placeholder="e.g. Fintech, VC"
                      className="border-0 p-0 h-auto text-xs w-24 focus-visible:ring-0 shadow-none"
                    />
                    <button onClick={handleAddGoal} className="text-warm" disabled={updateSettings.isPending}><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setShowGoalInput(false); setNewGoal(""); }} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => setShowGoalInput(true)}
                    className="inline-flex items-center gap-1 border border-dashed border-border text-muted-foreground text-xs font-medium px-3 py-1.5 rounded-full hover:border-warm/60 hover:text-warm transition-colors">
                    <Plus className="w-3 h-3" /> Add goal
                  </button>
                )}
              </div>
              {(settings.careerGoals ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground italic">No goals set — all contacts keep their base priority.</p>
              )}
            </div>

          </div>
        </section>

        <section>
          <SectionLabel>Support</SectionLabel>
          <div className="surface-card overflow-hidden divide-y divide-border/60">
            <SettingsRow icon={Bug} label="Report a bug" detail="Let us know when something isn't working" onClick={() => setLocation("/feedback?type=bug")} testId="nav-report-bug" />
            <SettingsRow icon={Lightbulb} label="Suggest a feature" detail="Tell us what would make Novara better" onClick={() => setLocation("/feedback?type=feature")} testId="nav-suggest-feature" />
          </div>
        </section>

        {/* Install app — browsers and installed PWAs only. */}
        {!nativeApp && (
          <section>
            <SectionLabel>Mobile App</SectionLabel>
            <div className="surface-card overflow-hidden">
              <SettingsRow icon={Smartphone} label="Install on your phone" detail="Add Novara to your home screen for the full app experience" onClick={() => setLocation("/install")} />
            </div>
          </section>
        )}

        <div className="text-center mt-auto pt-4">
          <p className="text-xs text-muted-foreground">Version {APP_VERSION} · Cloud-synced</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
