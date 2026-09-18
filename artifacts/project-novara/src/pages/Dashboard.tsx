import { Link } from "wouter";
import { computeHealthScore, computeStatus, getDaysPastDue, formatDate } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { ContactCard } from "@/components/ContactCard";
import { OnboardingTour } from "@/components/OnboardingTour";
import { Plus, Loader2, Users, Clock, Info, ChevronRight, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContacts } from "@/hooks/useContacts";
import { useSettings } from "@/hooks/useSettings";
import { useUser } from "@clerk/react";

export default function Dashboard() {
  const { contacts, isLoading } = useContacts();
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();
  const { user } = useUser();
  const connectedContacts = contacts.filter(c => c.connectionStatus === "connected");
  const pipelineCount = contacts.filter(c => c.connectionStatus === "pipeline").length;
  const healthScore = computeHealthScore(connectedContacts);
  const stats = connectedContacts.reduce(
    (acc, contact) => {
      const status = computeStatus(contact);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { Warm: 0, Cooling: 0, Cold: 0, Dormant: 0 } as Record<string, number>
  );
  const overdueContacts = connectedContacts
    .filter(c => getDaysPastDue(c) > 0)
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
      const aPriority = priorityOrder[a.currentPriority ?? a.importance] ?? 1;
      const bPriority = priorityOrder[b.currentPriority ?? b.importance] ?? 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return getDaysPastDue(b) - getDaysPastDue(a);
    });
  const warmContacts = connectedContacts.filter(c => computeStatus(c) === "Warm");
  const maxOverdueDays = overdueContacts.length > 0
    ? Math.max(...overdueContacts.map(c => getDaysPastDue(c)))
    : 0;
  if (isLoading || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background pb-nav">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
              {user?.firstName ? `Hi, ${user.firstName}` : "Novara"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your network at a glance</p>
          </div>
          <Link href="/add">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </Link>
        </div>
      </header>

      <div className="px-4 py-4">
        <Link
          href="/contacts"
          className="surface-card block p-4 mb-4 transition-colors hover:bg-elevated"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Network Health
              <Info
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-label="Share of your connected contacts still inside their follow-up window"
              />
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="flex items-end gap-2 mb-3">
            <span className="font-serif text-5xl font-bold leading-none tracking-tight text-foreground tabular-nums">
              {healthScore}
            </span>
            <span className="mb-1 text-sm text-muted-foreground">/100</span>
          </div>
          {/* Four tinted wells rather than pastel blocks: the semantic hue is
              carried by the number and a translucent wash, so the tiles read
              as one module instead of four competing swatches. */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-xl border border-warm/15 bg-warm-soft p-2">
              <div className="text-lg font-bold tabular-nums text-warm">{stats.Warm}</div>
              <div className="text-xs text-warm">Warm</div>
            </div>
            <div className="rounded-xl border border-cooling/15 bg-cooling-soft p-2">
              <div className="text-lg font-bold tabular-nums text-cooling">{stats.Cooling}</div>
              <div className="text-xs text-cooling">Cooling</div>
            </div>
            <div className="rounded-xl border border-cold/15 bg-cold-soft p-2">
              <div className="text-lg font-bold tabular-nums text-cold">{stats.Cold}</div>
              <div className="text-xs text-cold">Cold</div>
            </div>
            <div className="rounded-xl border border-dormant/15 bg-dormant-soft p-2">
              <div className="text-lg font-bold tabular-nums text-dormant">{stats.Dormant || 0}</div>
              <div className="text-xs text-dormant">Dormant</div>
            </div>
          </div>
        </Link>
        {/* Career goals drive every priority suggestion in the app, and nothing
            ever asked for them — they sat behind Settings with no prompt, so
            the app quietly ran with every contact on its base priority. This
            card appears only while they are unset and disappears the moment
            they are, so it needs no dismiss. */}
        {settings && settings.careerGoals.length === 0 && !settings.careerStatement.trim() && (
          <Link
            href="/settings#career-profile"
            className="block mb-4 rounded-2xl border border-primary/15 bg-primary/[0.06] p-4 transition-colors hover:bg-primary/10"
          >
            <div className="flex items-center gap-2.5">
              <Target className="w-6 h-6 text-primary shrink-0" />
              <p className="flex-1 text-[15px] font-bold text-primary">Set your career goals</p>
              <ChevronRight className="w-4 h-4 text-primary/60 shrink-0" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Novara raises the priority of contacts who can help you get there, and lets the rest
              settle. Until they are set, every contact keeps its base priority.
            </p>
          </Link>
        )}

        {overdueContacts.length > 0 && (
          <div className="mb-4">
            <Link href="/contacts" className="flex items-center gap-2 mb-2 group">
              <Clock className="h-4 w-4 text-overdue" />
              <h2 className="flex-1 text-sm font-semibold text-foreground">Overdue Follow-ups</h2>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
            </Link>
            <div className="mb-3 flex items-center justify-between rounded-xl border border-overdue/20 bg-overdue-soft px-3 py-2">
              <span className="text-xs font-medium text-overdue">{overdueContacts.length} follow-up{overdueContacts.length > 1 ? "s" : ""} overdue</span>
              <span className="text-xs text-overdue">Oldest: {maxOverdueDays} day{maxOverdueDays !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-3">
              {overdueContacts.map(contact => {
                const daysPast = getDaysPastDue(contact);
                return (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    showOverdueBadge
                    overdaysPast={daysPast}
                  />
                );
              })}
            </div>
          </div>
        )}
        {warmContacts.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-warm inline-block" />
              On Track
            </h2>
            <div className="space-y-3">
              {warmContacts.map(contact => (
                <ContactCard key={contact.id} contact={contact} />
              ))}
            </div>
          </div>
        )}
        {connectedContacts.length === 0 && (
          <div className="text-center py-16">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No contacts yet</h3>
            <p className="text-sm text-muted-foreground mb-6">Add your first contact to start tracking your network health.</p>
            <Link href="/add">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add your first contact
              </Button>
            </Link>
          </div>
        )}
        {pipelineCount > 0 && (
          <Link href="/contacts">
            <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{pipelineCount} contact{pipelineCount > 1 ? "s" : ""} in pipeline</span>
              <span className="text-xs text-primary font-medium">View all</span>
            </div>
          </Link>
        )}
      </div>
      {settings && !settings.hasSeenTutorial && (
        <OnboardingTour onComplete={() => updateSettings.mutate({ hasSeenTutorial: true })} />
      )}
      <BottomNav />
    </div>
  );
}
