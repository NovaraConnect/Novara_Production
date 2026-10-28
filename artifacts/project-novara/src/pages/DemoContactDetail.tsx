// The public demo's contact page, at /try/contacts/:id: the signed-in
// ContactDetail's layout over sample data. Actions that would need an account
// (contacting, calendar, reminders) explain themselves instead of failing.
// The tour points at #demo-profile, #demo-news and #demo-mark-contacted.
import { useState } from "react";
import { Link, useRoute } from "wouter";
import {
  AlignLeft,
  ArrowLeft,
  Bell,
  Briefcase,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  MapPin,
  Newspaper,
  RefreshCw,
  Send,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/ContactAvatar";
import { StatusBadge } from "@/components/StatusBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import { computeStatus, formatDate } from "@/lib/utils";
import { formatCadenceLabel, isInMaintenanceMode } from "@/lib/cadence";
import { DEMO_CONTACTS, DEMO_SETTINGS, TESLA_NEWS } from "@/demo/demoData";
import { DemoBanner, DemoGetAppBar } from "@/demo/DemoBanner";
import { DemoWalkthrough } from "@/demo/DemoWalkthrough";

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/80">
        <Icon className="h-4 w-4 text-foreground/70" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

const inTheApp = (what: string) =>
  toast(`${what} works in the app`, { description: "The demo doesn’t save anything or contact anyone." });

export default function DemoContactDetail() {
  const [, params] = useRoute("/try/contacts/:id");
  const [contacting, setContacting] = useState(false);
  const [contacted, setContacted] = useState(false);

  const contact = DEMO_CONTACTS.find((c) => c.id === params?.id) ?? DEMO_CONTACTS[0];
  const maintenance = isInMaintenanceMode(contact, DEMO_SETTINGS.autoDowngradeAfterMonths);
  const cadenceLabel = formatCadenceLabel(contact, DEMO_SETTINGS);
  const news = contact.id === "demo-sarah" ? TESLA_NEWS : [];
  const hasProfile = Boolean(contact.industry || contact.function || contact.interests?.length);

  const handleMarkContacted = async () => {
    setContacting(true);
    await new Promise((r) => setTimeout(r, 600));
    setContacting(false);
    setContacted(true);
    toast.success(`Logged. Novara will remind you about ${contact.firstName} again later.`, {
      description: "Demo only: nothing was saved.",
    });
  };

  return (
    <div className="mobile-container pb-36">
      <DemoBanner />

      <header className="flex items-center justify-between px-4 pb-2 pt-4">
        <Link href="/try" aria-label="Back to the demo dashboard">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <span className="text-xs font-medium text-muted-foreground">Sample contact</span>
        <div className="w-10" />
      </header>

      <main className="px-4 py-2">
        <div id="demo-profile" className="mb-8">
          <ContactAvatar firstName={contact.firstName} lastName={contact.lastName} size={88} className="mb-4" />
          <h1 className="mb-1 font-serif text-3xl font-bold leading-tight tracking-tight text-foreground">
            {contact.firstName} {contact.lastName}
          </h1>
          <p className="text-lg font-medium text-muted-foreground">
            {contact.role ? `${contact.role} @ ` : ""}
            {contact.company}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={computeStatus(contact)} />
            <ImportanceBadge importance={contact.currentPriority ?? contact.importance} />
            {contact.connectionStatus === "pipeline" && (
              <span className="inline-flex items-center gap-1 rounded-full border border-priority-high/25 bg-priority-high-soft px-2.5 py-1 text-[10px] font-semibold text-priority-high">
                Pipeline
              </span>
            )}
            {maintenance && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cooling/25 bg-cooling-soft px-2.5 py-1 text-[10px] font-semibold text-cooling">
                <RefreshCw className="h-2.5 w-2.5" />
                Maintenance cadence
              </span>
            )}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Button
            id="demo-mark-contacted"
            onClick={contacted ? undefined : handleMarkContacted}
            disabled={contacting}
            className={`h-14 gap-1.5 rounded-xl text-sm font-semibold shadow-md transition-transform active:scale-[0.98] sm:text-base ${
              contacted ? "border border-warm/30 bg-warm-soft text-warm hover:bg-warm-soft" : ""
            }`}
          >
            {contacting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {contacted ? "Contacted" : "Mark contacted"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => inTheApp("Contacting")}
            className="h-14 gap-1.5 rounded-xl text-sm font-semibold sm:text-base"
          >
            <Send className="h-5 w-5" />
            Contact now
          </Button>
        </div>
        <div className="mb-8 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            onClick={() => inTheApp("Adding to your calendar")}
            className="h-12 w-full gap-2 rounded-xl font-semibold"
          >
            <CalendarPlus className="h-4 w-4" />
            Add to Calendar
          </Button>
          <Button
            variant="outline"
            onClick={() => inTheApp("Reminders")}
            className="h-12 w-full gap-2 rounded-xl font-semibold"
          >
            <Bell className="h-4 w-4" />
            Set Reminder
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Relationship Details</h3>
            <DetailRow
              icon={CalendarDays}
              label="Next Follow Up"
              value={<span className="font-semibold">{contacted ? "Reset by your check-in" : formatDate(contact.nextFollowUpDate)}</span>}
            />
            <DetailRow
              icon={CalendarDays}
              label="Last Interaction"
              value={contacted ? "Today" : formatDate(contact.lastInteractionDate)}
            />
            {contact.firstContactDate && (
              <DetailRow icon={CalendarDays} label="First contact date" value={formatDate(contact.firstContactDate)} />
            )}
            <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3">
              <div className="rounded-xl bg-background/60 p-3">
                <p className="mb-1 text-xs text-muted-foreground">First reach-out</p>
                <p className="text-sm font-semibold text-foreground">
                  {contact.initialFollowUpDays === 1 ? "1 day" : `${contact.initialFollowUpDays} days`}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">after meeting</p>
              </div>
              <div className="rounded-xl bg-background/60 p-3">
                <p className="mb-1 text-xs text-muted-foreground">Current cadence</p>
                <p className={`text-sm font-semibold ${maintenance ? "text-cooling" : "text-foreground"}`}>
                  {cadenceLabel}
                </p>
                {maintenance && <p className="mt-0.5 text-xs text-cooling/80">moved to maintenance</p>}
              </div>
            </div>
            {contact.metAt && <DetailRow icon={MapPin} label="Met At" value={contact.metAt} />}
          </div>

          {hasProfile && (
            <div className="space-y-3 rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Profile</h3>
              {contact.industry && <DetailRow icon={Briefcase} label="Industry" value={contact.industry} />}
              {contact.function && <DetailRow icon={Briefcase} label="Function" value={contact.function} />}
              {contact.interests && contact.interests.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/80">
                    <Tag className="h-4 w-4 text-foreground/70" />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted-foreground">Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.interests.map((i) => (
                        <span key={i} className="rounded-full bg-secondary/80 px-2 py-0.5 text-xs text-foreground/80">
                          {i}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div id="demo-news" className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Conversation Starters</h3>
            </div>
            <p className="mb-4 text-xs text-muted-foreground">
              Use recent {contact.company} news to reconnect naturally.
            </p>
            {news.length === 0 ? (
              <p className="text-sm italic text-muted-foreground">
                In the app, the latest {contact.company} headlines appear here every day.
              </p>
            ) : (
              <ul className="space-y-3">
                {news.map((h) => (
                  <li key={h.title} className="flex items-start gap-3 rounded-xl bg-background/60 p-3">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Newspaper className="h-2.5 w-2.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug text-foreground">{h.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {h.source} ·{" "}
                        {new Date(h.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-[10px] text-muted-foreground">
              Sample headlines in the demo · real news, updated daily, in the app
            </p>
          </div>

          {contact.notes && (
            <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notes</h3>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/80">
                  <AlignLeft className="h-4 w-4 text-foreground/70" />
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{contact.notes}</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <DemoWalkthrough page="contact" active={contact.id === "demo-sarah"} />
      <DemoGetAppBar />
    </div>
  );
}
