// The public demo's Dashboard, at /try: the signed-in Dashboard's layout and
// components (NetworkHealthCard, FollowUpCard) over sample data, with no
// account. The tour (DemoWalkthrough) points at #demo-health and
// #demo-attention, so keep those ids.
import { CalendarDays, Clock } from "lucide-react";
import { computeHealthScore, computeStatus, getDaysPastDue } from "@/lib/utils";
import { NetworkHealthCard, type StatusCounts } from "@/components/NetworkHealthCard";
import { FollowUpCard } from "@/components/FollowUpCard";
import { DEMO_CONTACTS } from "@/demo/demoData";
import { DemoBanner, DemoGetAppBar } from "@/demo/DemoBanner";
import { DemoWalkthrough } from "@/demo/DemoWalkthrough";
import type { Contact } from "@/types/contact";

const demoHref = (c: Contact) => `/try/contacts/${c.id}`;

export default function DemoDashboard() {
  // Same rules as Dashboard: Network Health and the follow-up lists count
  // connected contacts only; pipeline contacts are listed separately.
  const connected = DEMO_CONTACTS.filter((c) => c.connectionStatus === "connected");
  const pipeline = DEMO_CONTACTS.filter((c) => c.connectionStatus === "pipeline");
  const healthScore = computeHealthScore(connected);
  const stats = connected.reduce(
    (acc, c) => {
      acc[computeStatus(c)]++;
      return acc;
    },
    { Warm: 0, Cooling: 0, Cold: 0, Dormant: 0 } as StatusCounts,
  );

  const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const overdue = connected
    .filter((c) => getDaysPastDue(c) > 0)
    .sort((a, b) => {
      const ap = priorityOrder[a.currentPriority ?? a.importance] ?? 1;
      const bp = priorityOrder[b.currentPriority ?? b.importance] ?? 1;
      if (ap !== bp) return ap - bp;
      return getDaysPastDue(b) - getDaysPastDue(a);
    });
  const upcoming = connected
    .filter((c) => getDaysPastDue(c) === 0)
    .sort((a, b) => (a.nextFollowUpDate ?? "").localeCompare(b.nextFollowUpDate ?? ""));

  return (
    <div className="mobile-container pb-36">
      <DemoBanner />

      <header className="border-b border-border/50 bg-background/95 px-6 pb-4 pt-6">
        <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">Novara</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Your network at a glance</p>
      </header>

      <div className="px-4 py-4">
        <div id="demo-health">
          <NetworkHealthCard score={healthScore} change={null} stats={stats} href="/try" />
        </div>
        <FollowUpCard
          id="demo-attention"
          title="Overdue Follow-ups"
          icon={<Clock className="h-4 w-4 text-foreground" aria-hidden="true" />}
          contacts={overdue}
          tone="overdue"
          contactHref={demoHref}
          viewAllHref="/try"
        />
        <FollowUpCard
          title="Upcoming Follow-ups"
          icon={<CalendarDays className="h-4 w-4 text-foreground" aria-hidden="true" />}
          contacts={upcoming}
          contactHref={demoHref}
          viewAllHref="/try"
        />
        {pipeline.length > 0 && (
          <FollowUpCard
            title="Pipeline"
            icon={<CalendarDays className="h-4 w-4 text-foreground" aria-hidden="true" />}
            contacts={pipeline}
            contactHref={demoHref}
            viewAllHref="/try"
          />
        )}
      </div>

      <DemoWalkthrough page="dashboard" />
      <DemoGetAppBar />
    </div>
  );
}
