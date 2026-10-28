import { useEffect } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { computeHealthScore, computeStatus, getDaysPastDue } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { RecentActivity } from "@/components/RecentActivity";
import { NetworkHealthCard, type StatusCounts } from "@/components/NetworkHealthCard";
import { FollowUpCard } from "@/components/FollowUpCard";
import { useHealthTrend } from "@/hooks/useHealthTrend";
import { Plus, Loader2, Users, ChevronRight, Target, Search, CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContacts } from "@/hooks/useContacts";
import { Redirect } from "wouter";
import { useSettings } from "@/hooks/useSettings";
import { recordPositiveMoment } from "@/lib/reviewPrompt";

export default function Dashboard() {
  const { contacts, isLoading } = useContacts();
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();
  const connectedContacts = contacts.filter(c => c.connectionStatus === "connected");
  const pipelineCount = contacts.filter(c => c.connectionStatus === "pipeline").length;
  const healthScore = computeHealthScore(connectedContacts);
  const lastMonth = useHealthTrend();
  const healthChange = lastMonth ? healthScore - lastMonth.score : null;
  const { user } = useUser();
  // A score that has gone up since last month is a good moment to ask for a
  // rating (counted at most once a day; see lib/reviewPrompt.ts).
  const scoreRose = !isLoading && healthChange !== null && healthChange > 0;
  useEffect(() => {
    if (scoreRose) recordPositiveMoment("scoreUp", user?.createdAt);
  }, [scoreRose, user?.createdAt]);
  const stats = connectedContacts.reduce(
    (acc, contact) => {
      const status = computeStatus(contact);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { Warm: 0, Cooling: 0, Cold: 0, Dormant: 0 } as StatusCounts
  );
  // Overdue: highest priority first, then longest overdue. Upcoming: soonest
  // first. Each card shows the first few; "View all" goes to Contacts.
  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const overdue = connectedContacts
    .filter(c => getDaysPastDue(c) > 0)
    .sort((a, b) => {
      const aPriority = priorityOrder[a.currentPriority ?? a.importance] ?? 1;
      const bPriority = priorityOrder[b.currentPriority ?? b.importance] ?? 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return getDaysPastDue(b) - getDaysPastDue(a);
    });
  const upcoming = connectedContacts
    .filter(c => getDaysPastDue(c) === 0)
    .sort((a, b) => (a.nextFollowUpDate ?? "").localeCompare(b.nextFollowUpDate ?? ""));
  if (isLoading || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // First run goes to /welcome rather than showing an overlay here. That path
  // is not one of the iOS shell's sections, so the native tab bar hides and
  // the introduction gets the whole screen. Checked after the loading guard,
  // so a slow settings fetch never flashes the Dashboard first.
  if (settings && !settings.hasSeenTutorial) {
    return <Redirect to="/welcome" />;
  }

  return (
    <div className="min-h-screen bg-background pb-nav">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">Novara</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your network at a glance</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/contacts#search"
              aria-label="Search contacts"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-foreground shadow-sm transition-colors hover:bg-elevated"
            >
              <Search className="h-[18px] w-[18px]" />
            </Link>
            <Link href="/add">
              <Button size="sm" className="h-10 gap-1.5 rounded-xl px-4">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="px-4 py-4">
        <NetworkHealthCard score={healthScore} change={healthChange} stats={stats} href="/contacts" />
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
              <p className="flex-1 text-[15px] font-bold text-primary">Set your career profile</p>
              <ChevronRight className="w-4 h-4 text-primary/60 shrink-0" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              Tell Novara what you're working towards. It raises the priority of contacts who can
              help you get there; until then, every contact keeps its base priority.
            </p>
          </Link>
        )}

        <FollowUpCard
          title="Overdue Follow-ups"
          icon={<Clock className="h-4 w-4 text-foreground" aria-hidden="true" />}
          contacts={overdue}
          tone="overdue"
        />
        <FollowUpCard
          title="Upcoming Follow-ups"
          icon={<CalendarDays className="h-4 w-4 text-foreground" aria-hidden="true" />}
          contacts={upcoming}
        />
        <div className="mb-4">
          <RecentActivity contacts={connectedContacts} />
        </div>
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
              <span className="text-xs text-foreground font-medium">View all</span>
            </div>
          </Link>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
