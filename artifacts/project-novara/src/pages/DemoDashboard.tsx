import { Link } from "wouter";
import { computeHealthScore, computeStatus, formatDate } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { StatusBadge } from "@/components/StatusBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import { Card, CardContent } from "@/components/ui/card";
import { DEMO_CONTACTS, DEMO_SETTINGS } from "@/demo/demoData";
import { DemoBanner } from "@/demo/DemoBanner";
import { DemoWalkthrough } from "@/demo/DemoWalkthrough";
import { isInMaintenanceMode } from "@/lib/cadence";
import { CalendarDays, MapPin } from "lucide-react";
import { Contact } from "@/types/contact";

function DemoContactCard({ contact }: { contact: Contact }) {
  return (
    <Link href={`/try/contacts/${contact.id}`}>
      <Card className="overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-all duration-200 bg-card hover:-translate-y-0.5 cursor-pointer">
        <CardContent className="p-5 pb-4">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground tracking-tight leading-none mb-1">
                {contact.firstName} {contact.lastName}
              </h3>
              <p className="text-sm text-muted-foreground font-medium">
                {contact.role ? `${contact.role} @ ` : ""}{contact.company}
              </p>
            </div>
            <StatusBadge status={computeStatus(contact)} />
          </div>

          <div className="flex items-center text-xs text-muted-foreground mb-4">
            <MapPin className="w-3 h-3 mr-1.5 opacity-70" />
            <span className="truncate">{contact.metAt ?? "—"}</span>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border/40">
            <div className="flex items-center text-xs text-muted-foreground">
              <CalendarDays className="w-3.5 h-3.5 mr-1.5 opacity-70" />
              Follow up:{" "}
              <span className="ml-1 font-medium text-foreground">
                {formatDate(contact.nextFollowUpDate)}
              </span>
            </div>
            <ImportanceBadge importance={contact.importance} className="text-[10px] px-2 py-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DemoDashboard() {
  const contacts = DEMO_CONTACTS;
  const settings = DEMO_SETTINGS;

  const healthScore = computeHealthScore(contacts);

  const stats = contacts.reduce(
    (acc, contact) => {
      const status = computeStatus(contact);
      acc[status]++;
      return acc;
    },
    { Warm: 0, Cooling: 0, Cold: 0, Dormant: 0 },
  );

  // Demo is "frozen" at June 14, 2026
  const today = new Date("2026-06-14T00:00:00.000Z");
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const dueFollowUps = contacts
    .filter((c) => new Date(c.nextFollowUpDate) <= nextWeek)
    .sort(
      (a, b) =>
        new Date(a.nextFollowUpDate).getTime() -
        new Date(b.nextFollowUpDate).getTime(),
    );

  const maintenanceCount = contacts.filter((c) =>
    isInMaintenanceMode(c, settings.autoDowngradeAfterMonths),
  ).length;

  const dueCount = dueFollowUps.filter(
    (c) => new Date(c.nextFollowUpDate) <= today,
  ).length;

  return (
    <div className="mobile-container pb-24 flex flex-col">
      <DemoBanner />

      <header className="pt-10 pb-6 px-6 bg-card border-b border-border/50">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground">
            Project Novara
          </h1>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide">
            Demo · 7 sample contacts loaded
          </p>
        </div>
      </header>

      <main className="flex-1 px-6 py-8 flex flex-col gap-8">
        {/* Health Score */}
        <section
          id="demo-health"
          className="flex flex-col items-center justify-center p-8 bg-card rounded-2xl border border-border/50 shadow-sm relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none" />
          <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-1 relative z-10">
            Network Health
          </h2>
          <p className="text-xs text-muted-foreground relative z-10 mb-3">
            {contacts.length} connected
          </p>
          <div className="flex items-baseline gap-2 relative z-10">
            <span className="text-7xl font-sans font-bold tracking-tighter text-foreground">
              {healthScore}
            </span>
            <span className="text-xl font-medium text-muted-foreground">/100</span>
          </div>
          <div className="w-full max-w-[200px] h-2 bg-secondary rounded-full mt-6 overflow-hidden relative z-10">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out bg-primary"
              style={{ width: `${healthScore}%` }}
            />
          </div>
        </section>

        {/* Stats Row */}
        <section className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
            <span className="text-xl font-bold text-emerald-700">{stats.Warm}</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase text-emerald-600/80 mt-1">
              Warm
            </span>
          </div>
          <div className="flex flex-col items-center p-3 bg-amber-50 rounded-xl border border-amber-100">
            <span className="text-xl font-bold text-amber-700">{stats.Cooling}</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase text-amber-600/80 mt-1">
              Cooling
            </span>
          </div>
          <div className="flex flex-col items-center p-3 bg-blue-50 rounded-xl border border-blue-100">
            <span className="text-xl font-bold text-blue-700">{stats.Cold}</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase text-blue-600/80 mt-1">
              Cold
            </span>
          </div>
        </section>

        {/* Maintenance notice */}
        {maintenanceCount > 0 && (
          <div className="bg-secondary/50 border border-border/40 rounded-xl px-4 py-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{maintenanceCount}</span>{" "}
            contact{maintenanceCount !== 1 ? "s" : ""} in maintenance cadence (twice per
            year).
          </div>
        )}

        {/* Needs Attention */}
        <section id="demo-attention">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground">
              Needs Attention
            </h2>
            <span className="text-xs bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded-full">
              {dueCount} due
            </span>
          </div>
          <div className="space-y-3">
            {dueFollowUps.slice(0, 3).map((contact) => (
              <DemoContactCard key={contact.id} contact={contact} />
            ))}
            {dueFollowUps.length > 3 && (
              <p className="text-xs text-center text-primary font-semibold py-2">
                +{dueFollowUps.length - 3} more contacts
              </p>
            )}
          </div>
        </section>

        {/* All contacts */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground">
              All Contacts
            </h2>
            <span className="text-xs text-muted-foreground">{contacts.length} total</span>
          </div>
          <div className="space-y-3">
            {contacts
              .filter((c) => !dueFollowUps.includes(c))
              .map((contact) => (
                <DemoContactCard key={contact.id} contact={contact} />
              ))}
          </div>
        </section>
      </main>

      <BottomNav />
      <DemoWalkthrough page="dashboard" />
    </div>
  );
}
