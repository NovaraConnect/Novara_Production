import { useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Bell, Save, Check, X, Plus, LogOut, RefreshCw, Smartphone, ChevronRight, BookOpen, Target } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useClerk, useUser } from "@clerk/react";
import { UserSettings } from "@/types/contact";

const DOWNGRADE_OPTIONS: UserSettings["autoDowngradeAfterMonths"][] = [3, 6, 9, 12];

function labelMonths(m: number) {
  return m === 1 ? "1 month" : `${m} months`;
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Settings() {
  const [, setLocation] = useLocation();
  const { settings, updateSettings } = useSettings();
  const { user } = useUser();
  const { signOut } = useClerk();

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
      toast.success(`Auto-downgrade set to ${labelMonths(months)}`);
    } catch { toast.error("Failed to update setting"); }
  };

  return (
    <div className="mobile-container pb-24 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Settings</h1>
      </header>

      <main className="flex-1 px-6 py-8 flex flex-col gap-8">

        {/* App identity */}
        <section className="text-center space-y-3">
          <div className="w-20 h-20 bg-primary/10 rounded-3xl mx-auto flex items-center justify-center border border-primary/20 shadow-sm mb-4">
            <span className="font-serif text-3xl font-bold text-primary">N</span>
          </div>
          <h2 className="font-serif text-2xl font-bold text-foreground">Project Novara</h2>
          {user && (
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{user.primaryEmailAddress?.emailAddress}</span>
            </p>
          )}
        </section>

        {/* Account */}
        <section className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">Account</p>
          <Button
            variant="outline"
            className="w-full gap-2"
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
          >
            <BookOpen className="w-4 h-4" />
            Replay Tutorial
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive border-destructive/20 hover:bg-destructive/5"
            onClick={() => signOut({ redirectUrl: `${basePath}/` })}
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </section>

        {/* Auto-downgrade cadence setting */}
        <section className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4">
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
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Career Profile</p>
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-6">

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
                  <Button size="sm" onClick={handleSaveStatement} className={saved ? "bg-emerald-600 hover:bg-emerald-700" : ""} data-testid="button-save-statement">
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
                  <span key={goal} className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30 text-xs font-semibold px-3 py-1.5 rounded-full">
                    {goal}
                    <button onClick={() => handleRemoveGoal(goal)} className="hover:text-destructive transition-colors" aria-label={`Remove ${goal}`} disabled={updateSettings.isPending}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {showGoalInput ? (
                  <div className="flex items-center gap-1 border border-emerald-400 rounded-full px-3 py-1 bg-card">
                    <Input
                      autoFocus value={newGoal}
                      onChange={(e) => setNewGoal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddGoal(); } if (e.key === "Escape") { setShowGoalInput(false); setNewGoal(""); } }}
                      placeholder="e.g. Fintech, VC"
                      className="border-0 p-0 h-auto text-xs w-24 focus-visible:ring-0 shadow-none"
                    />
                    <button onClick={handleAddGoal} className="text-emerald-600" disabled={updateSettings.isPending}><Check className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setShowGoalInput(false); setNewGoal(""); }} className="text-muted-foreground"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ) : (
                  <button onClick={() => setShowGoalInput(true)}
                    className="inline-flex items-center gap-1 border border-dashed border-border text-muted-foreground text-xs font-medium px-3 py-1.5 rounded-full hover:border-emerald-400 hover:text-emerald-600 transition-colors">
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

        {/* Notifications */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Notifications</p>
          <button
            onClick={() => setLocation("/notifications")}
            className="w-full bg-card border border-border/50 rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:bg-secondary/30 transition-colors text-left"
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
              className="w-full bg-card border border-border/50 rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:bg-secondary/30 transition-colors text-left"
              data-testid="nav-report-bug"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-lg">
                🐞
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Report a bug</p>
                <p className="text-xs text-muted-foreground mt-0.5">Let us know when something isn't working</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => setLocation("/feedback?type=feature")}
              className="w-full bg-card border border-border/50 rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:bg-secondary/30 transition-colors text-left"
              data-testid="nav-suggest-feature"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 text-lg">
                💡
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Suggest a feature</p>
                <p className="text-xs text-muted-foreground mt-0.5">Tell us what would make Novara better</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </section>

        {/* Install app */}
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Mobile App</p>
          <button
            onClick={() => setLocation("/install")}
            className="w-full bg-card border border-border/50 rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:bg-secondary/30 transition-colors text-left"
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

        <div className="text-center mt-auto pt-4">
          <p className="text-xs text-muted-foreground">Version 2.0.0 · Cloud-synced</p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
