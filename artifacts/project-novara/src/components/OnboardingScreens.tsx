// ============================================================================
// The pictures in the first-run tour: each step's screen, drawn with the app's
// own components and tokens rather than recorded.
//
// They replaced screen recordings of the old navy UI. A recording goes stale
// the moment a screen is restyled; these follow the real tokens, the light and
// dark themes, and the shared components (ScoreRing, ContactAvatar,
// StatusBadge, Button) automatically. If a screen's LAYOUT changes, update its
// mock here to match.
//
// Every screen is laid out at phone size (MOCK_WIDTH x MOCK_HEIGHT) and scaled
// down by OnboardingTour to fit its frame. They are pictures: inert, hidden
// from assistive tech, and no tap ever reaches them.
//
// The people and companies are invented. Dates are computed from today so the
// "Overdue by" and "Due in" labels always agree with the dates beside them.
// ============================================================================
import { format, addDays } from "date-fns";
import {
  ArrowLeft, Bell, Cake, CalendarDays, CalendarPlus, CheckCircle2, ChevronRight, Clock,
  ExternalLink, Info, LayoutDashboard, Newspaper, Pencil, PlusCircle, Plus, Search, Send,
  Settings as SettingsIcon, Target, TrendingUp, Users, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContactAvatar } from "@/components/ContactAvatar";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import { NovaraMark } from "@/components/NovaraMark";
import { ScoreRing } from "@/components/ScoreRing";
import { StatusBadge } from "@/components/StatusBadge";
import { canPickNativeContact } from "@/lib/nativeBridge";
import { cn, describeFollowUp, formatDate, type RelationshipStatus } from "@/lib/utils";

/** An iPhone-sized canvas in CSS pixels, at the tour frame's aspect ratio. */
export const MOCK_WIDTH = 390;
export const MOCK_HEIGHT = Math.round((MOCK_WIDTH * 1338) / 660);

/** A date `days` from today, as the API stores it. */
function fromToday(days: number): string {
  return format(addDays(new Date(), days), "yyyy-MM-dd");
}

// ── Shared chrome ────────────────────────────────────────────────────────────

/** Draws the eye to the one thing a step is about. Mounted only while its
 *  step is on screen, so the ring animates in each time. The 100vmax shadow
 *  dims everything else; the tour frame clips it. */
function Spot({ active, children, className }: { active: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {children}
      {active && <span className="ob-focus pointer-events-none absolute -inset-1.5 z-10 rounded-[20px]" />}
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex h-11 shrink-0 items-center px-7 text-[15px] font-semibold text-foreground">9:41</div>
  );
}

/** The app's four sections. Inside the iOS app this is the native tab bar. */
function TabBar({ active }: { active: "Dashboard" | "Contacts" | "Add" | "Settings" }) {
  const items = [
    { label: "Dashboard", icon: LayoutDashboard },
    { label: "Contacts", icon: Users },
    { label: "Add", icon: PlusCircle },
    { label: "Settings", icon: SettingsIcon },
  ] as const;
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-20 items-start justify-around border-t border-border bg-background px-4 pt-3">
      {items.map(({ label, icon: Icon }) => (
        <div
          key={label}
          className={cn("flex w-16 flex-col items-center gap-1", label === active ? "text-primary" : "text-muted-foreground")}
        >
          <Icon className="h-5 w-5" />
          <span className="text-[10px] font-medium tracking-wide">{label}</span>
        </div>
      ))}
    </div>
  );
}

function DashboardHeader() {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 px-6 pb-4">
      <div>
        <p className="font-serif text-3xl font-bold tracking-tight text-foreground">Novara</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Your network at a glance</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card text-foreground shadow-sm">
          <Search className="h-[18px] w-[18px]" />
        </span>
        <Button size="sm" tabIndex={-1} className="h-10 gap-1.5 rounded-xl px-4">
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

function BackHeader({ title, edit }: { title?: string; edit?: boolean }) {
  return (
    <div className="flex items-center border-b border-border/50 px-4 pb-3">
      <span className="flex h-9 w-9 items-center justify-center text-foreground">
        <ArrowLeft className="h-5 w-5" />
      </span>
      {title && <p className="ml-2 font-serif text-xl font-bold tracking-tight text-foreground">{title}</p>}
      {edit && (
        <span className="ml-auto flex h-9 w-9 items-center justify-center text-foreground">
          <Pencil className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

function Screen({ tab, children }: { tab?: React.ComponentProps<typeof TabBar>["active"]; children: React.ReactNode }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <StatusBar />
      {children}
      {tab && <TabBar active={tab} />}
    </div>
  );
}

// ── Sample people ────────────────────────────────────────────────────────────

interface Person {
  first: string;
  last: string;
  role: string;
  company: string;
  status: RelationshipStatus;
  due: string;
}

const OVERDUE: Person[] = [
  { first: "Priya", last: "Raman", role: "Partner", company: "Northwind Capital", status: "Cold", due: fromToday(-12) },
  { first: "Aisha", last: "Okonkwo", role: "Product Manager", company: "Lumen Pay", status: "Cooling", due: fromToday(-5) },
  { first: "Daniel", last: "Whitfield", role: "Engineer", company: "Arcfield", status: "Cooling", due: fromToday(-2) },
];

const UPCOMING: Person[] = [
  { first: "Marcus", last: "Lee", role: "Founder", company: "Tidewater Labs", status: "Warm", due: fromToday(3) },
  { first: "Elena", last: "Costa", role: "Recruiter", company: "Brightline", status: "Warm", due: fromToday(9) },
];

function FollowUpRow({ person }: { person: Person }) {
  const due = describeFollowUp({ nextFollowUpDate: person.due });
  return (
    <div className="flex items-center gap-3 py-3">
      <ContactAvatar firstName={person.first} lastName={person.last} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {person.first} {person.last}
          </p>
          <StatusBadge status={person.status} className="shrink-0 text-[11px]" />
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {person.role} · {person.company}
        </p>
        <p className={cn("mt-1 flex items-center gap-1 text-xs", due.overdue ? "text-overdue" : "text-muted-foreground")}>
          <CalendarDays className="h-3 w-3 shrink-0" />
          {due.label} · {formatDate(person.due)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}

function FollowUpList({ title, people, overdue }: { title: string; people: Person[]; overdue?: boolean }) {
  return (
    <section className={cn("surface-card px-4 pb-1 pt-4", overdue && "border-overdue/25")}>
      <div className="mb-1 flex items-center gap-2">
        {overdue ? <Clock className="h-4 w-4 text-foreground" /> : <CalendarDays className="h-4 w-4 text-foreground" />}
        <p className="flex-1 text-[15px] font-semibold text-foreground">
          {title}
          {overdue && (
            <span className="ml-2 rounded-full bg-overdue-soft px-2 py-0.5 align-middle text-xs font-semibold text-overdue">
              {people.length}
            </span>
          )}
        </p>
        <span className="flex items-center gap-0.5 text-sm font-medium text-foreground">
          View all
          <ChevronRight className="h-4 w-4" />
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {people.map(p => (
          <FollowUpRow key={p.first} person={p} />
        ))}
      </div>
    </section>
  );
}

// ── The screens, one per tour step ───────────────────────────────────────────

export type MockScreen = (props: { active: boolean }) => React.ReactElement;

/** Dashboard: the Network Health card. */
export const HealthScreen: MockScreen = ({ active }) => (
  <Screen tab="Dashboard">
    <DashboardHeader />
    <div className="space-y-4 px-4 py-4">
      <Spot active={active}>
        <div className="surface-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
              Network Health
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-4 pb-5">
            <ScoreRing score={78} />
            <div>
              <p className="text-sm text-muted-foreground">out of 100</p>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-warm-soft px-2 py-0.5 font-semibold tabular-nums text-warm">
                  <TrendingUp className="h-3 w-3" />
                  +6
                </span>
                vs last month
              </p>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {([
              ["Warm", 14, "border-warm/15 bg-warm-soft text-warm"],
              ["Cooling", 4, "border-cooling/15 bg-cooling-soft text-cooling"],
              ["Cold", 2, "border-cold/15 bg-cold-soft text-cold"],
              ["Dormant", 1, "border-dormant/15 bg-dormant-soft text-dormant"],
            ] as const).map(([label, n, tone]) => (
              <div key={label} className={cn("rounded-xl border p-2", tone)}>
                <div className="text-lg font-bold tabular-nums">{n}</div>
                <div className="text-xs">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </Spot>
      <FollowUpList title="Overdue Follow-ups" people={OVERDUE} overdue />
    </div>
  </Screen>
);

/** Settings: the Career Profile card. */
export const GoalsScreen: MockScreen = ({ active }) => (
  <Screen tab="Settings">
    <div className="border-b border-border/50 px-6 pb-4">
      <p className="font-serif text-2xl font-bold tracking-tight text-foreground">Settings</p>
    </div>
    <div className="px-4 py-5">
      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Career Profile</p>
      <Spot active={active}>
        <div className="surface-card space-y-6 p-5">
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Describe your career goals. Novara uses this to suggest the right importance and follow-up cadence for
              each contact.
            </p>
            <div className="h-28 rounded-md border border-input bg-input-background px-3 py-2 text-sm text-foreground">
              Moving into product leadership in fintech, ideally at an early-stage startup.
            </div>
          </div>
          <div className="space-y-3 border-t border-border/50 pt-5">
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Current Career Goals</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Contacts whose industry, function, or interests match these goals will rise in priority.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Fintech", "Product leadership", "Startups"].map(goal => (
                <span
                  key={goal}
                  className="inline-flex items-center gap-1.5 rounded-full border border-warm/25 bg-warm-soft px-3 py-1.5 text-xs font-semibold text-warm"
                >
                  {goal}
                  <X className="h-3 w-3" />
                </span>
              ))}
              <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <Plus className="h-3 w-3" /> Add goal
              </span>
            </div>
          </div>
        </div>
      </Spot>
    </div>
  </Screen>
);

/** Dashboard: Overdue and Upcoming follow-ups. */
export const FollowUpsScreen: MockScreen = ({ active }) => (
  <Screen tab="Dashboard">
    <DashboardHeader />
    <div className="space-y-4 px-4 py-4">
      <Spot active={active}>
        <FollowUpList title="Overdue Follow-ups" people={OVERDUE} overdue />
      </Spot>
      <FollowUpList title="Upcoming Follow-ups" people={UPCOMING} />
    </div>
  </Screen>
);

/** The top of a contact, shared by the contact screens below. */
function ContactTop() {
  return (
    <div className="mb-6">
      <ContactAvatar firstName="Aisha" lastName="Okonkwo" size={88} className="mb-4" />
      <p className="mb-1 font-serif text-3xl font-bold leading-tight tracking-tight text-foreground">Aisha Okonkwo</p>
      <p className="text-lg font-medium text-muted-foreground">Product Manager @ Lumen Pay</p>
      <div className="mt-4 flex items-center gap-2">
        <StatusBadge status="Cooling" />
        <ImportanceBadge importance="High" />
      </div>
    </div>
  );
}

/** Contact: Mark contacted and Contact now. */
export const ContactNowScreen: MockScreen = ({ active }) => (
  <Screen tab="Contacts">
    <BackHeader edit />
    <div className="px-4 py-4">
      <ContactTop />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Button tabIndex={-1} className="h-14 gap-1.5 rounded-xl text-sm font-semibold shadow-md">
          <CheckCircle2 className="h-5 w-5" />
          Mark contacted
        </Button>
        <Spot active={active}>
          <Button tabIndex={-1} variant="secondary" className="h-14 w-full gap-1.5 rounded-xl text-sm font-semibold">
            <Send className="h-5 w-5" />
            Contact now
          </Button>
        </Spot>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button tabIndex={-1} variant="outline" className="h-12 gap-2 rounded-xl font-semibold">
          <CalendarPlus className="h-4 w-4" />
          Add to Calendar
        </Button>
        <Button tabIndex={-1} variant="outline" className="h-12 gap-2 rounded-xl font-semibold">
          <Bell className="h-4 w-4" />
          Set Reminder
        </Button>
      </div>
    </div>
  </Screen>
);

/** Contact: Conversation Starters. */
export const StartersScreen: MockScreen = ({ active }) => (
  <Screen tab="Contacts">
    <BackHeader edit />
    <div className="px-4 py-4">
      <ContactTop />
      <Spot active={active}>
        <div className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Conversation Starters</p>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Use recent Lumen Pay news to reconnect naturally.</p>
          <ul className="space-y-3">
            {[
              ["Lumen Pay launches instant payouts for small businesses", fromToday(-2)],
              ["Lumen Pay opens a new engineering hub in Lisbon", fromToday(-6)],
            ].map(([title, date]) => (
              <li key={title} className="flex items-start gap-3 rounded-xl bg-background/60 p-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <ExternalLink className="h-2.5 w-2.5 text-primary" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-foreground">{title}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Fintech Daily · {format(new Date(`${date}T00:00:00`), "MMM d")}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Spot>
    </div>
  </Screen>
);

/** Add Contact: the tabs and the Manual form. The Contacts tab exists only
 *  in the iPhone app, exactly as on the real screen. */
export const AddScreen: MockScreen = ({ active }) => {
  const tabs = ["Manual", ...(canPickNativeContact() ? ["Contacts"] : []), "Business card", "LinkedIn", "QR Code"];
  const field = (label: string, placeholder: string, optional?: boolean) => (
    <div className="space-y-2">
      <p className="text-sm font-medium leading-none text-foreground">
        {label}
        {optional && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </p>
      <div className="flex h-12 items-center rounded-xl border border-input bg-input-background px-3 text-base text-muted-foreground">
        {placeholder}
      </div>
    </div>
  );
  return (
    <Screen tab="Add">
      <BackHeader title="Add Contact" />
      <div className="px-4 pt-4">
        <Spot active={active} className="mb-5">
          <div className="flex gap-1 rounded-xl bg-muted/70 p-1">
            {tabs.map((label, i) => (
              <span
                key={label}
                // A touch tighter than the real row, which scrolls when it
                // runs out of room; a picture has to fit all five tabs.
                className={cn(
                  "flex-auto whitespace-nowrap rounded-lg px-1.5 py-2 text-center text-[12px] font-medium",
                  i === 0 ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </Spot>
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Basic information</p>
          <div className="grid grid-cols-2 gap-4">
            {field("First name", "Sarah")}
            {field("Last name", "Jones")}
          </div>
          {field("Company", "Acme")}
          {field("Role", "Recruiter", true)}
          <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Relationship details</p>
          {field("Where did you meet?", "MBA Alumni Event, LinkedIn DM…", true)}
        </div>
      </div>
    </Screen>
  );
};

/** Contact: Relationship Details, with the cadence and a birthday. */
export const RememberScreen: MockScreen = ({ active }) => {
  const row = (Icon: typeof CalendarDays, label: string, value: string, strong?: boolean) => (
    <div className="flex items-start gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/80">
        <Icon className="h-4 w-4 text-foreground/70" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-sm text-foreground", strong ? "font-semibold" : "font-medium")}>{value}</p>
      </div>
    </div>
  );
  const birthday = addDays(new Date(), 40);
  return (
    <Screen tab="Contacts">
      <BackHeader edit />
      <div className="px-4 py-4">
        <div className="mb-6 flex items-center gap-4">
          <ContactAvatar firstName="Aisha" lastName="Okonkwo" size={64} />
          <div className="min-w-0">
            <p className="font-serif text-2xl font-bold leading-tight tracking-tight text-foreground">Aisha Okonkwo</p>
            <p className="text-sm font-medium text-muted-foreground">Product Manager @ Lumen Pay</p>
          </div>
        </div>
        <Spot active={active}>
          <div className="space-y-4 rounded-2xl border border-border/50 bg-card p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Relationship Details</p>
            {row(CalendarDays, "Next Follow Up", formatDate(fromToday(21)), true)}
            {row(CalendarDays, "Last Interaction", formatDate(fromToday(0)))}
            {row(Cake, "Birthday", format(birthday, "MMMM d"))}
            <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-3">
              <div className="rounded-xl bg-background/60 p-3">
                <p className="mb-1 text-xs text-muted-foreground">First reach-out</p>
                <p className="text-sm font-semibold text-foreground">2 days</p>
                <p className="mt-0.5 text-xs text-muted-foreground">after meeting</p>
              </div>
              <div className="rounded-xl bg-background/60 p-3">
                <p className="mb-1 text-xs text-muted-foreground">Current cadence</p>
                <p className="text-sm font-semibold text-foreground">Every 3 weeks</p>
              </div>
            </div>
          </div>
        </Spot>
      </div>
    </Screen>
  );
};

/** The lock screen, with the reminders the server actually sends. */
export const NotifyScreen: MockScreen = ({ active }) => {
  const banner = (title: string, body: string, when: string) => (
    <div className="flex gap-3 rounded-[22px] border border-border/60 bg-card/90 p-3.5 shadow-sm">
      <NovaraMark size={38} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[15px] font-semibold text-foreground">{title}</p>
          <p className="shrink-0 text-xs text-muted-foreground">{when}</p>
        </div>
        <p className="text-sm leading-snug text-foreground/80">{body}</p>
      </div>
    </div>
  );
  return (
    <div className="flex h-full flex-col bg-elevated">
      <StatusBar />
      <div className="pt-6 text-center">
        <p className="text-lg font-semibold text-muted-foreground">{format(new Date(), "EEEE d MMMM")}</p>
        <p className="text-[88px] font-semibold leading-none tracking-tight text-foreground">9:41</p>
      </div>
      <div className="mt-auto px-3 pb-16">
        <Spot active={active}>
          <div className="space-y-2">
            {banner("It's Aisha's birthday today", "A good moment to reach out to Aisha Okonkwo.", "now")}
            {banner("Overdue follow-up", "Priya Raman is overdue for a follow-up.", "9:00")}
          </div>
        </Spot>
      </div>
    </div>
  );
};
