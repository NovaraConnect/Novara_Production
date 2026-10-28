import { useEffect } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { computeHealthScore, computeStatus, getDaysPastDue, formatDate, describeFollowUp, cn } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { ContactAvatar } from "@/components/ContactAvatar";
import { StatusBadge } from "@/components/StatusBadge";
import { RecentActivity } from "@/components/RecentActivity";
import { ScoreRing } from "@/components/ScoreRing";
import { useHealthTrend } from "@/hooks/useHealthTrend";
import { Plus, Loader2, Users, Info, ChevronRight, Target, Search, CalendarDays, Clock, TrendingUp, TrendingDown } from "lucide-react";
import type { Contact } from "@/types/contact";
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
    { Warm: 0, Cooling: 0, Cold: 0, Dormant: 0 } as Record<string, number>
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
        <Link
          href="/contacts"
          className="surface-card block p-4 mb-4 transition-colors hover:bg-elevated"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
              Network Health
              <Info
                className="h-3.5 w-3.5 text-muted-foreground"
                aria-label="Share of your connected contacts still inside their follow-up window"
              />
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-4 pb-5">
            <ScoreRing score={healthScore} />
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">out of 100</p>
              {/* Shown once there is a month of history to compare with. */}
              {healthChange !== null && (
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums",
                      healthChange > 0 && "bg-warm-soft text-warm",
                      healthChange < 0 && "bg-cold-soft text-cold",
                      healthChange === 0 && "bg-muted text-muted-foreground",
                    )}
                  >
                    {healthChange > 0 && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
                    {healthChange < 0 && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                    {healthChange > 0 ? `+${healthChange}` : healthChange === 0 ? "No change" : `−${-healthChange}`}
                  </span>
                  vs last month
                </p>
              )}
            </div>
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

/** A Dashboard list of follow-ups: the first three, each with when it is due,
 *  and "View all" to Contacts. Renders nothing when the list is empty. */
function FollowUpCard({
  title,
  icon,
  contacts,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  contacts: Contact[];
  tone?: "overdue";
}) {
  if (contacts.length === 0) return null;
  return (
    <section
      className={cn("surface-card px-4 pt-4 pb-1 mb-4", tone === "overdue" && "border-overdue/25")}
      aria-label={title}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="flex-1 text-[15px] font-semibold text-foreground">
          {title}
          {tone === "overdue" && (
            <span className="ml-2 rounded-full bg-overdue-soft px-2 py-0.5 align-middle text-xs font-semibold text-overdue">
              {contacts.length}
            </span>
          )}
        </h2>
        <Link href="/contacts" className="flex items-center gap-0.5 text-sm font-medium text-foreground">
          View all
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-border/60">
        {contacts.slice(0, 3).map(contact => {
          const due = describeFollowUp(contact);
          return (
            <Link key={contact.id} href={`/contacts/${contact.id}`} className="flex items-center gap-3 py-3">
              <ContactAvatar firstName={contact.firstName} lastName={contact.lastName} photo={contact.photo} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[15px] font-semibold text-foreground">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <StatusBadge status={computeStatus(contact)} className="shrink-0 text-[11px]" />
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {contact.role}{contact.role && contact.company ? " · " : ""}{contact.company}
                </p>
                <p className={cn("mt-1 flex items-center gap-1 text-xs", due.overdue ? "text-overdue" : "text-muted-foreground")}>
                  <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {due.label} · {formatDate(contact.nextFollowUpDate)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
