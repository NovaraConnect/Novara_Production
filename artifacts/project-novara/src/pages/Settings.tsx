import { useEffect, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import ThemeSetting from "@/components/ThemeSetting";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Bell, Save, Check, X, Plus, LogOut, RefreshCw, Smartphone, ChevronRight, BookOpen, Target, Trash2, Bug, Lightbulb } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useAuth, useClerk, useUser } from "@clerk/react";
import { UserSettings } from "@/types/contact";
import { NovaraMark } from "@/components/NovaraMark";
import { isNativeShell } from "@/lib/installPrompt";
import { APP_VERSION } from "@/lib/appVersion";
import { deleteAccount } from "@/lib/api";
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

      <main className="flex-1 px-4 py-8 flex flex-col gap-8">

        {/* App identity */}
        <section className="brand-glow text-center space-y-3">
          <NovaraMark size={80} className="mx-auto mb-4" />
          <h2 className="font-serif text-2xl font-bold text-foreground">Novara</h2>
          {user && (
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.primaryEmailAddress?.emailAddress}</span>
            </p>
          )}
        </section>

        {/* Account — same row pattern as Notifications, Support and Mobile App
            below, so the whole screen is one list rather than buttons in one
            card and rows in the next. */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Account</p>
          <div className="surface-card overflow-hidden divide-y divide-border/60">
            <button
              onClick={async () => {
                try {
                  await updateSettings.mutateAsync({ hasSeenTutorial: false });
                  setLocation("/dashboard");
                  toast.success("Tutorial reset — it'll appear on the Dashboard");
                } catch {
                  toast.error("Failed to reset tutorial");
                }
              }}
              disabled={updateSettings.isPending}
              className="w-full p-4 flex items-center gap-4 hover:bg-elevated transition-colors text-left disabled:opacity-60"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 text-primary" />
              </div>
              <p className="flex-1 text-sm font-semibold text-foreground">Replay Tutorial</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
            {/* Signing out is reversible; deleting the account is not. They used
                to look identical, which left the only irreversible action in
                the app with no more weight than ending a session. Sign out is
                now a neutral row like Replay Tutorial, so red in this card
                means exactly one thing. */}
            <button
              onClick={() => signOut({ redirectUrl: `${basePath}/` })}
              className="w-full p-4 flex items-center gap-4 hover:bg-elevated transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                <LogOut className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="flex-1 text-sm font-semibold text-foreground">Sign out</p>
              <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              className="w-full p-4 flex items-center gap-4 hover:bg-destructive/10 transition-colors text-left"
              data-testid="button-delete-account"
            >
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-destructive">Delete account</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Permanently removes your contacts and your Novara login
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-destructive" aria-hidden="true" />
            </button>
          </div>
        </section>

        <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your Novara account?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your contacts, your career profile, your notification
                settings and your Novara login. It cannot be undone, and there is no way to
                recover the data afterwards.
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

        {/* Auto-downgrade cadence setting */}
        <section className="surface-card p-5 space-y-4">
          <div className="flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-foreground">Auto-downgrade cadence</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                After this many months, contacts move to a maintenance cadence (twice per year) automatically.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {DOWNGRADE_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => handleDowngradeChange(opt)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  settings.autoDowngradeAfterMonths === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                {labelMonths(opt)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Currently: contacts older than <span className="font-semibold text-foreground">{labelMonths(settings.autoDowngradeAfterMonths)}</span> follow up every 6 months.
          </p>
        </section>

        {/* Career Profile */}
        <section id="career-profile" className="scroll-mt-24">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Career Profile</p>
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

        <ThemeSetting />

        {/* Notifications */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Notifications</p>
          <button
            onClick={() => setLocation("/notifications")}
            className="surface-card w-full p-4 flex items-center gap-4 hover:bg-elevated transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Notification settings</p>
              <p className="text-xs text-muted-foreground mt-0.5">Follow-up reminders, status alerts, weekly digest</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </section>

        {/* Support */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Support</p>
          <div className="space-y-3">
            <button
              onClick={() => setLocation("/feedback?type=bug")}
              className="surface-card w-full p-4 flex items-center gap-4 hover:bg-elevated transition-colors text-left"
              data-testid="nav-report-bug"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Bug className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Report a bug</p>
                <p className="text-xs text-muted-foreground mt-0.5">Let us know when something isn't working</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setLocation("/feedback?type=feature")}
              className="surface-card w-full p-4 flex items-center gap-4 hover:bg-elevated transition-colors text-left"
              data-testid="nav-suggest-feature"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Lightbulb className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Suggest a feature</p>
                <p className="text-xs text-muted-foreground mt-0.5">Tell us what would make Novara better</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </section>

        {/* Install app — browsers and installed PWAs only. */}
        {!nativeApp && (
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Mobile App</p>
          <button
            onClick={() => setLocation("/install")}
            className="surface-card w-full p-4 flex items-center gap-4 hover:bg-elevated transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Install on your phone</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add Novara to your home screen for the full app experience</p>
            </div>
            <div className="text-muted-foreground">›</div>
          </button>
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
