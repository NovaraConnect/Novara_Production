// ============================================================================
// Novara's investor overview, at /investors.
//
// PUBLIC AND UNAUTHENTICATED on purpose: it is a link sent to investors, who
// have no account. It is registered in App.tsx OUTSIDE ProtectedRoute, and
// InstallPrompt hides itself here so the "install Novara" banner does not sit
// over the page.
//
// Its own fixed palette rather than the app's theme tokens: a page sent to an
// investor should look the same whether their phone is in light or dark mode.
//
// EVERY CLAIM HERE COMES FROM THE REPOSITORY OR THE APP ITSELF:
//   • pricing and trial         docs/APPLE_IAP_SETUP.md, docs/BILLING_AND_UNIVERSITY_ACCESS_PLAN.md §4A
//   • universities              same plan, §6: described only as a direction being explored
//   • "nudges, never overrides" docs/Founder-Vision.md
//   • screenshots               public/investors/, iPhone app with fictional demo contacts
//
// Anything that could not be verified is a <Placeholder>. Do not replace one
// with a number (users, revenue, market size) unless it is real.
// ============================================================================
import { useEffect } from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  Compass,
  GraduationCap,
  Mail,
  Newspaper,
  ScanLine,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { NovaraMark } from "@/components/NovaraMark";

const NAVY = "#08111F";
const BRAND = "#2941A3";
const PAPER = "#F7F6F2";

const SANS = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";

/** Where investors write to. Until it is set, the button shows a placeholder. */
const INVESTOR_EMAIL: string | null = "novaraconnect@gmail.com";

/** The founder's LinkedIn profile. Until it is set, a placeholder shows. */
const FOUNDER_LINKEDIN_URL: string | null = "https://www.linkedin.com/in/cloecarmery/";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const shot = (name: string) => `${basePath}/investors/${name}.jpg`;

/** Anything Cloé still has to fill in. Styled so it cannot be missed. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-dashed border-amber-500/70 bg-amber-100/80 px-1.5 py-0.5 font-medium text-amber-900">
      [{children}]
    </span>
  );
}

function PhoneFrame({
  src,
  alt,
  className = "",
  eager = false,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <div
      className={`relative rounded-[2.6rem] bg-[#0B0F17] p-[9px] shadow-[0_40px_80px_-24px_rgba(4,14,65,0.55),0_0_0_1px_rgba(255,255,255,0.08)_inset] ${className}`}
    >
      <div className="relative overflow-hidden rounded-[2.05rem] bg-white">
        <img
          src={src}
          alt={alt}
          width={720}
          height={1558}
          loading={eager ? "eager" : "lazy"}
          className="block h-auto w-full"
        />
        {/* Dynamic Island: sits between the clock and the status icons. */}
        <div className="absolute left-1/2 top-[1.6%] h-[3.1%] w-[30%] -translate-x-1/2 rounded-full bg-[#0B0F17]" />
      </div>
    </div>
  );
}

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p
      className={`text-xs font-semibold uppercase tracking-[0.18em] ${
        light ? "text-[#8FA6FF]" : "text-[#2941A3]"
      }`}
    >
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  intro,
  light = false,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div className="max-w-2xl">
      <Eyebrow light={light}>{eyebrow}</Eyebrow>
      <h2
        className={`mt-3 font-serif text-3xl font-bold leading-[1.15] sm:text-[2.6rem] ${
          light ? "text-white" : "text-[#08111F]"
        }`}
      >
        {title}
      </h2>
      {intro && (
        <p
          className={`mt-4 text-base leading-relaxed sm:text-lg ${
            light ? "text-[#AAB7CA]" : "text-[#4B5363]"
          }`}
        >
          {intro}
        </p>
      )}
    </div>
  );
}

const NAV = [
  { href: "#problem", label: "Problem" },
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#model", label: "Business model" },
  { href: "#founder", label: "Founder" },
];

const PROBLEMS = [
  {
    where: "Career fairs",
    what: "A stack of business cards goes into a drawer. By the time recruiting season comes around, nobody remembers who said what.",
  },
  {
    where: "Coffee chats",
    what: "“Let’s stay in touch” is sincere on both sides. Without a reminder, the follow-up never gets sent.",
  },
  {
    where: "Events and LinkedIn",
    what: "A connection request is not a relationship. The list grows; the people on it stop recognizing your name.",
  },
];

const SCREENS = [
  {
    src: shot("dashboard"),
    title: "Network Health",
    caption: "One score for how your network is doing, and who is overdue for a follow-up today.",
  },
  {
    src: shot("contacts"),
    title: "Every relationship has a temperature",
    caption: "Warm, Cooling, Cold or Dormant, with a priority and where you met.",
  },
  {
    src: shot("contact"),
    title: "Priority follows your goals",
    caption: "Contacts aligned with your career goals rise. One tap to mark contacted, schedule or remind.",
  },
  {
    src: shot("add-card"),
    title: "Scan a business card",
    caption: "Novara finds the card’s edges and fills in the details.",
  },
  {
    src: shot("add-linkedin"),
    title: "Import from a LinkedIn screenshot",
    caption: "Reads only the image you give it. Novara never connects to your LinkedIn account.",
  },
];

const STEPS = [
  {
    icon: ScanLine,
    title: "Capture the people you meet",
    body: "Scan a business card, a QR code or a LinkedIn screenshot, pick from iPhone Contacts, or add someone by hand. Photos and birthdays included.",
  },
  {
    icon: Target,
    title: "Tell Novara what you’re working towards",
    body: "A short career statement and goals. Novara suggests who matters most for that direction, and you can always override it.",
  },
  {
    icon: CalendarClock,
    title: "Get nudged before it goes cold",
    body: "Follow-ups are scheduled and ranked by priority. The dashboard shows who is overdue and who is coming up; notifications do the remembering.",
  },
  {
    icon: Newspaper,
    title: "Reach out with something to say",
    body: "Recent news about a contact’s company becomes a conversation starter, so a check-in never has to be “just checking in”.",
  },
];

const AUDIENCES = [
  {
    icon: GraduationCap,
    title: "Students",
    body: "Recruiting runs on career fairs, info sessions and alumni chats, all squeezed between classes.",
  },
  {
    icon: Briefcase,
    title: "MBA candidates",
    body: "Two years built around networking: recruiters, classmates, alumni and the people they introduce.",
  },
  {
    icon: Users,
    title: "Early-career professionals",
    body: "First jobs, first mentors, first industry network. The relationships that shape the next move.",
  },
];

const PRO_FEATURES = [
  "Unlimited contacts",
  "Network Health score and goal-based priority",
  "Follow-up scheduling and reminders",
  "Card, QR, LinkedIn and iPhone Contacts import",
  "Company news as conversation starters",
  "Export your data at any time",
];

export default function InvestorPage() {
  // Title and description for link previews and the browser tab, restored on
  // the way out so the rest of the app keeps its own.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Novara Connect · Investor overview";

    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    if (description) {
      description.content =
        "Novara Connect is a personal relationship CRM for students and young professionals: it notices when an important relationship is going cold, and helps you reach out.";
    }

    // Kept out of search results while it carries placeholders. Remove this
    // block once the page is ready to be found.
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);

    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) {
        description.content = previousDescription;
      }
      robots.remove();
    };
  }, []);

  return (
    <div
      className="min-h-[100dvh] overflow-x-clip bg-[#F7F6F2] text-[#08111F] antialiased"
      style={{ fontFamily: SANS, colorScheme: "light" }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#08111F]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <NovaraMark size={30} />
            <span className="font-serif text-lg font-bold text-white">Novara Connect</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm text-[#AAB7CA] lg:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="transition-colors hover:text-white">
                {item.label}
              </a>
            ))}
          </nav>
          <a
            href="#contact"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#08111F] transition-colors hover:bg-[#E3E8F7]"
          >
            Get in touch
          </a>
        </div>
      </header>

      <main id="top">
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden pt-16"
          style={{
            background: `radial-gradient(ellipse 70% 60% at 78% 45%, rgba(41,65,163,0.55), transparent 70%), ${NAVY}`,
          }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:pb-28 lg:pt-24">
            <div>
              <Eyebrow light>Investor overview</Eyebrow>
              <h1 className="mt-5 font-serif text-[2.6rem] font-bold leading-[1.06] text-white sm:text-6xl lg:text-[4.1rem]">
                Never let an important relationship go cold.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#C4CEDD]">
                Novara Connect is a personal relationship CRM for ambitious students and
                young professionals. It remembers the people you meet, notices when a
                relationship is cooling, and tells you who to reach out to next, ranked by
                what you’re working towards.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#product"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(41,65,163,0.9)] transition-transform hover:-translate-y-0.5"
                  style={{ background: BRAND }}
                >
                  See the product <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                >
                  Talk to the founder
                </a>
              </div>
              <dl className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-white/10 pt-6 text-sm">
                {[
                  ["Platform", "iPhone app"],
                  ["Model", "Subscription"],
                  ["Founded by", "Cloé Carmery, UF alum"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[#7D8BA3]">{k}</dt>
                    <dd className="mt-1 font-semibold text-white">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="relative mx-auto w-[min(78vw,300px)] lg:w-[320px]">
              <div className="absolute -inset-10 -z-0 rounded-full bg-[#2941A3]/30 blur-3xl" />
              <PhoneFrame
                src={shot("dashboard")}
                alt="Novara dashboard showing a Network Health score of 90 and overdue follow-ups"
                className="relative lg:rotate-[2deg]"
                eager
              />
            </div>
          </div>
        </section>

        {/* ── Problem ───────────────────────────────────────────────────── */}
        <section id="problem" className="scroll-mt-16 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="The problem"
              title="The network you build quietly goes cold."
              intro="Ambitious people meet valuable connections all the time, and lose most of them to nothing more dramatic than time and busyness. Not a bad conversation; just no second one."
            />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {PROBLEMS.map((p) => (
                <div
                  key={p.where}
                  className="rounded-2xl border border-[#E4E2DA] bg-white p-7 shadow-[0_1px_2px_rgba(8,17,31,0.04)]"
                >
                  <p className="font-serif text-xl font-bold">{p.where}</p>
                  <p className="mt-3 leading-relaxed text-[#4B5363]">{p.what}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 max-w-2xl text-lg leading-relaxed text-[#4B5363]">
              The tools people use today weren’t made for this. LinkedIn holds the
              connection, the camera roll holds the business card, the notes app holds the
              context, and nothing says <em>it’s time to reach out</em>. Sales CRMs can,
              but they’re built for teams and pipelines, not for one person’s career.
            </p>
          </div>
        </section>

        {/* ── Product ───────────────────────────────────────────────────── */}
        <section id="product" className="scroll-mt-16 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="The product"
              title="Who needs you today, not everyone you’ve ever met."
              intro="Novara opens on the handful of people worth reaching out to now. These are real screens from the iPhone app."
            />
          </div>
          <div className="mx-auto mt-14 max-w-6xl">
            <ul className="flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-4 sm:px-6 lg:grid lg:grid-cols-5 lg:gap-5 lg:overflow-visible lg:pb-0">
              {SCREENS.map((s) => (
                <li key={s.title} className="w-[62vw] max-w-[250px] shrink-0 snap-center lg:w-auto lg:max-w-none">
                  <PhoneFrame src={s.src} alt={s.title} />
                  <p className="mt-5 font-semibold leading-snug">{s.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#5B6272]">{s.caption}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 px-4 text-xs text-[#8A909C] sm:px-6">
              Screens shown with fictional demo contacts. Company names are illustrative and
              do not indicate any relationship with Novara.
            </p>
          </div>
        </section>

        {/* ── How it works ──────────────────────────────────────────────── */}
        <section id="how" className="scroll-mt-16 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading eyebrow="How it works" title="From a handshake to a relationship." />
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title} className="relative rounded-2xl border border-[#E4E2DA] bg-white p-7">
                  <div className="flex items-center justify-between">
                    <span
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-white"
                      style={{ background: BRAND }}
                    >
                      <step.icon className="h-5 w-5" />
                    </span>
                    <span className="font-serif text-3xl font-bold text-[#E1E4EE]">0{i + 1}</span>
                  </div>
                  <p className="mt-6 font-semibold leading-snug">{step.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#5B6272]">{step.body}</p>
                </li>
              ))}
            </ol>
            <div className="mt-8 flex flex-col gap-4 rounded-2xl bg-[#E9ECF7] p-7 sm:flex-row sm:items-center sm:gap-6">
              <Sparkles className="h-6 w-6 shrink-0" style={{ color: BRAND }} />
              <p className="leading-relaxed text-[#2A3146]">
                <span className="font-semibold text-[#08111F]">
                  The algorithm nudges; it never overrides you.
                </span>{" "}
                Goal-based suggestions move a contact’s priority by at most one level, and a
                priority you set yourself is never recalculated. Novara reads only the images
                you give it, and it never connects to your LinkedIn account.
              </p>
            </div>
          </div>
        </section>

        {/* ── Why now / who it's for ────────────────────────────────────── */}
        <section className="relative overflow-hidden py-20 sm:py-28" style={{ background: NAVY }}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              light
              eyebrow="Why now · Who it’s for"
              title="Built for the years when a network is made."
              intro="Careers increasingly move through people: referrals, alumni and the introductions they make. The years when that network is built are also the busiest. Novara is a tool for one person and their own relationships, on the phone they already carry to every event."
            />
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {AUDIENCES.map((a) => (
                <div key={a.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-7">
                  <a.icon className="h-6 w-6 text-[#8FA6FF]" />
                  <p className="mt-5 font-serif text-xl font-bold text-white">{a.title}</p>
                  <p className="mt-2 leading-relaxed text-[#AAB7CA]">{a.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-col gap-5 rounded-2xl border border-[#8FA6FF]/30 bg-[#2941A3]/20 p-7 sm:flex-row sm:items-start">
              <Compass className="h-6 w-6 shrink-0 text-[#8FA6FF]" />
              <div>
                <p className="font-semibold text-white">Universities as a channel</p>
                <p className="mt-2 max-w-3xl leading-relaxed text-[#C4CEDD]">
                  Career services already run the fairs, info sessions and alumni events where
                  these relationships begin. We are exploring campus access through career
                  centers, so students could receive Novara Pro through their school. It is a
                  direction, not yet a product or a partnership.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Business model ────────────────────────────────────────────── */}
        <section id="model" className="scroll-mt-16 py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Business model"
              title="One plan, sold through the App Store."
              intro="Novara Pro is an auto-renewing subscription through Apple In-App Purchase. New subscribers can start with a 7-day free trial."
            />
            <div className="mt-12 grid gap-5 lg:grid-cols-[1.25fr_1fr]">
              <div className="rounded-3xl border border-[#E4E2DA] bg-white p-8 shadow-[0_24px_48px_-28px_rgba(8,17,31,0.25)] sm:p-10">
                <div className="flex items-center gap-3">
                  <NovaraMark size={36} />
                  <p className="font-serif text-2xl font-bold">Novara Pro</p>
                </div>
                <p className="mt-6 inline-flex rounded-full bg-[#E9ECF7] px-3 py-1 text-xs font-semibold" style={{ color: BRAND }}>
                  7-day free trial
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[#E4E2DA] p-5">
                    <p className="text-sm text-[#5B6272]">Monthly</p>
                    <p className="mt-1 text-3xl font-bold">
                      $4.99<span className="text-base font-medium text-[#5B6272]"> / month</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border-2 p-5" style={{ borderColor: BRAND }}>
                    <p className="flex items-center justify-between text-sm text-[#5B6272]">
                      Annual
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: BRAND }}>
                        Save 16%
                      </span>
                    </p>
                    <p className="mt-1 text-3xl font-bold">
                      $49.99<span className="text-base font-medium text-[#5B6272]"> / year</span>
                    </p>
                    <p className="mt-1 text-xs text-[#5B6272]">$4.17 a month</p>
                  </div>
                </div>
                <ul className="mt-8 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: BRAND }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col rounded-3xl border border-dashed border-[#B9C1D6] bg-[#F0F1F5] p-8 sm:p-10">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5B6272]">Exploring</p>
                <p className="mt-3 font-serif text-2xl font-bold">University access</p>
                <p className="mt-4 leading-relaxed text-[#4B5363]">
                  A possible second revenue line: a university provides Novara Pro to its
                  students, paid by the institution rather than the student. We are exploring
                  what that could look like with career services.
                </p>
                <p className="mt-auto pt-8 text-sm text-[#7A8191]">
                  Not available today. No university agreements are in place.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Founder ───────────────────────────────────────────────────── */}
        <section id="founder" className="scroll-mt-16 bg-white py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <Eyebrow>Founder</Eyebrow>
              <div className="mt-6 flex items-center gap-5">
                <div
                  className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full font-serif text-3xl font-bold text-white"
                  style={{ background: `radial-gradient(circle at 30% 30%, #1334A7, #040E41)` }}
                  aria-hidden
                >
                  CC
                </div>
                <div>
                  <p className="font-serif text-3xl font-bold">Cloé Carmery</p>
                  <p className="mt-1 text-[#5B6272]">Founder · University of Florida alum</p>
                  <p className="mt-0.5 text-sm text-[#7A8191]">Formerly L’Oréal · Current NextEra</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 text-lg leading-relaxed text-[#4B5363]">
              <p>
                I’m French, a University of Florida alum, and my career has taken me from
                L’Oréal to NextEra. Along the way I’ve met a lot of people worth knowing, and
                I kept noticing the same thing: networking is the easy part. The hard part is
                what comes after, actually keeping up the network you’ve built.
              </p>
              <p>
                I built Novara Connect to close that gap, from the iPhone app to the
                subscription business behind it.
              </p>
              <p className="text-base">
                {FOUNDER_LINKEDIN_URL ? (
                  <a
                    href={FOUNDER_LINKEDIN_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold"
                    style={{ color: BRAND }}
                  >
                    Cloé on LinkedIn <ArrowRight className="h-4 w-4" />
                  </a>
                ) : (
                  <Placeholder>LinkedIn URL</Placeholder>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* ── Call to action ────────────────────────────────────────────── */}
        <section
          id="contact"
          className="scroll-mt-16 py-20 sm:py-28"
          style={{
            background: `radial-gradient(ellipse 60% 80% at 50% 100%, rgba(41,65,163,0.6), transparent 70%), ${NAVY}`,
          }}
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <NovaraMark size={56} className="mx-auto" />
            <h2 className="mt-8 font-serif text-3xl font-bold leading-tight text-white sm:text-5xl">
              Let’s talk.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#C4CEDD]">
              If you invest in tools for the next generation of professionals, Cloé would
              love to show you Novara and hear what you think.
            </p>
            <p className="mx-auto mt-4 max-w-xl text-sm text-[#C4CEDD]">
              <Placeholder>Optional: what you’re raising and what it’s for</Placeholder>
            </p>
            <div className="mt-10 flex flex-col items-center gap-3">
              {INVESTOR_EMAIL ? (
                <a
                  href={`mailto:${INVESTOR_EMAIL}?subject=${encodeURIComponent("Novara Connect")}`}
                  className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#08111F] transition-colors hover:bg-[#E3E8F7]"
                >
                  <Mail className="h-4 w-4" />
                  {INVESTOR_EMAIL}
                </a>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-[#08111F]">
                  <Mail className="h-4 w-4" />
                  <Placeholder>investor contact email</Placeholder>
                </span>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-8 text-sm text-[#7D8BA3]" style={{ background: NAVY }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <NovaraMark size={20} />
            <span>© {new Date().getFullYear()} Novara Connect</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/support" className="hover:text-white">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
