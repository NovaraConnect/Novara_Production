// ============================================================================
// Novara's landing page for students and young professionals, at /start.
//
// ONE JOB: get the visitor to download the iOS app. Everything on the page
// either says why, removes a reason not to, or repeats the button.
//
// PUBLIC AND UNAUTHENTICATED on purpose: it is the link shared with students
// (career services, flyers, LinkedIn). Registered in App.tsx outside
// ProtectedRoute; InstallPrompt hides itself here because its "add to home
// screen" banner would compete with the App Store button.
//
// The button adapts to the device: iPhone goes straight to the App Store,
// desktop also gets a QR code to scan, and Android (no Play Store build yet)
// is told so plainly. Every button reports to PostHog as `start_cta`.
//
// Not linked: the /try demo. Its sample data has aged (Network Health shows
// 0/100) and it still has the old design; link it again once it is refreshed.
//
// Claims come from the repository, as on /investors: pricing and trial from
// docs/APPLE_IAP_SETUP.md, privacy from the LinkedIn import and the privacy
// policy. No user counts, ratings or testimonials: none exist to quote yet.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Briefcase,
  Check,
  ChevronDown,
  Download,
  GraduationCap,
  Lock,
  Newspaper,
  ScanLine,
  Target,
} from "lucide-react";
import { NovaraMark } from "@/components/NovaraMark";
import { PhoneFrame } from "@/components/PhoneFrame";

const APP_STORE_URL = "https://apps.apple.com/us/app/novara-connect/id6811249861";

const NAVY = "#08111F";
const BRAND = "#2941A3";
const SANS = "'Plus Jakarta Sans', 'Inter', system-ui, sans-serif";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const shot = (name: string) => `${basePath}/screens/${name}.jpg`;

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  // Dev only: /start?platform=ios|android|desktop, to check each variant.
  const forced = new URLSearchParams(window.location.search).get("platform");
  if (import.meta.env.DEV && (forced === "ios" || forced === "android" || forced === "desktop")) {
    return forced;
  }
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/** Which button, in which spot, on which device. Silently a no-op without PostHog. */
function track(cta: string, platform: Platform) {
  const ph = (window as unknown as { posthog?: { capture: (e: string, p: object) => void } }).posthog;
  ph?.capture("start_cta", { cta, platform });
}

function AppleLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 384 512" className={className} fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

/** The main action. On Android there is no Play Store build to send anyone
 *  to yet, so it says that instead of pretending. */
function PrimaryCta({
  platform,
  where,
  onDark = false,
}: {
  platform: Platform;
  where: string;
  /** White button on the navy sections, black on the light ones. */
  onDark?: boolean;
}) {
  const pad = "px-6 py-3.5 text-base";
  if (platform === "android") {
    return (
      <span
        className={`inline-flex items-center justify-center gap-2 rounded-full border font-semibold ${pad} ${
          onDark ? "border-white/25 text-white" : "border-[#08111F]/20 text-[#08111F]"
        }`}
      >
        Coming soon to the Play Store
      </span>
    );
  }
  return (
    <a
      href={APP_STORE_URL}
      onClick={() => track(`${where}:app_store`, platform)}
      className={`inline-flex items-center justify-center gap-2.5 rounded-full font-semibold shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition-transform hover:-translate-y-0.5 ${pad} ${
        onDark ? "bg-white text-black" : "bg-black text-white"
      }`}
    >
      <AppleLogo className="h-5 w-5" />
      Download on the App Store
    </a>
  );
}

function PriceLine({ light = false }: { light?: boolean }) {
  return (
    <p className={`text-sm ${light ? "text-[#AAB7CA]" : "text-[#5B6272]"}`}>
      New subscribers get <span className={light ? "text-white" : "text-[#08111F]"}>7 days free</span>, then
      $4.99/month. Cancel anytime.
    </p>
  );
}

const HERO_POINTS = [
  "Add someone in seconds from a business card or LinkedIn screenshot",
  "Reminders for who to follow up with, ranked by your goals",
  "Fresh news on their company, so you always have something to say",
];

const FAMILIAR = [
  "“I’ll add them on LinkedIn later.”",
  "“We should grab coffee sometime.”",
  "“Wait… where did I meet them?”",
];

const STEPS = [
  {
    icon: ScanLine,
    title: "Capture them before you forget",
    body: "Snap a business card or a LinkedIn screenshot, scan a QR code, or pick from your iPhone contacts. Novara fills in the details.",
    src: shot("add-card"),
  },
  {
    icon: Target,
    title: "Know exactly who to reach out to",
    body: "Your dashboard shows who’s overdue and who’s next, ranked by what you’re working towards. No more guessing.",
    src: shot("dashboard"),
  },
  {
    icon: Newspaper,
    title: "Never send “just checking in”",
    body: "Novara pulls recent news about their company, so every message has a real reason to exist.",
    src: shot("conversation-starters"),
  },
];

const AUDIENCES = {
  student: {
    label: "I’m a student",
    icon: GraduationCap,
    title: "Turn recruiting season into relationships",
    moments: ["Career fairs", "Info sessions", "Alumni coffee chats", "Professors and TAs", "Club speakers"],
    goal: "I want a product management internship in fintech",
    body: "Write your goal once. The recruiters and alumni who can get you there rise to the top of your list, and Novara reminds you to stay in touch before the next application cycle.",
  },
  pro: {
    label: "I’m working",
    icon: Briefcase,
    title: "Keep the people who shape your next move",
    moments: ["Your first manager", "Mentors", "Industry events", "Former classmates", "That founder you met once"],
    goal: "I want to move into product at a growth-stage startup",
    body: "Write where you’re headed. Novara keeps the people who can help close, nudges you before they go cold, and remembers the details you’d otherwise lose.",
  },
} as const;

const FAQ = [
  {
    q: "Is there a free trial?",
    a: "Yes. New subscribers get 7 days free, then Novara Pro is $4.99 a month or $49.99 a year. Cancel at least 24 hours before the trial ends and you won’t be charged. You manage it in your iPhone’s Settings, under your Apple Account.",
  },
  {
    q: "Do I need an iPhone?",
    a: "Novara is on the App Store for iPhone today. Android, on the Play Store, is coming soon.",
  },
  {
    q: "Does Novara connect to my LinkedIn?",
    a: "No. Novara only reads the screenshot you choose to give it. It never logs into or accesses your LinkedIn account.",
  },
  {
    q: "Who can see my contacts?",
    a: "Only you. Novara is a personal tool, not a team CRM. You can export your data at any time, and deleting your account deletes your contacts.",
  },
];

export default function StartPage() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [audience, setAudience] = useState<keyof typeof AUDIENCES>("student");
  const [showSticky, setShowSticky] = useState(false);
  const heroCtaRef = useRef<HTMLDivElement>(null);

  useEffect(() => setPlatform(detectPlatform()), []);

  // The sticky bar only appears once the hero's own button has scrolled away.
  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setShowSticky(!entry.isIntersecting), {
      rootMargin: "0px 0px -40px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Novara: never let an important relationship go cold";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    if (description) {
      description.content =
        "Novara remembers everyone you meet, tells you who to follow up with and when, and gives you something to say. For students and young professionals. 7 days free on iPhone.";
    }
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
    };
  }, []);

  const a = AUDIENCES[audience];

  return (
    <div
      className="min-h-[100dvh] overflow-x-clip bg-[#F7F6F2] text-[#08111F] antialiased"
      style={{ fontFamily: SANS, colorScheme: "light" }}
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <NovaraMark size={30} />
            <span className="font-serif text-lg font-bold text-white">Novara</span>
          </div>
          <Link
            href="/sign-in"
            className="text-sm font-medium text-[#AAB7CA] transition-colors hover:text-white"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden pt-16"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 80% 40%, rgba(41,65,163,0.55), transparent 70%), ${NAVY}`,
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24 lg:pt-16">
          <div>
            <p className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-[#C4CEDD]">
              For students &amp; young professionals
            </p>
            <h1 className="mt-5 font-serif text-[2.5rem] font-bold leading-[1.05] text-white sm:text-6xl">
              You met the right people.
              <span className="block text-[#8FA6FF]">Now keep them.</span>
            </h1>
            <ul className="mt-7 space-y-3">
              {HERO_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px] text-[#DCE3EE]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2941A3]">
                    <Check className="h-3 w-3 text-white" strokeWidth={3} />
                  </span>
                  {p}
                </li>
              ))}
            </ul>

            <div ref={heroCtaRef} className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
              <PrimaryCta platform={platform} where="hero" onDark />
              <a
                href="#how"
                onClick={() => track("hero:how_it_works", platform)}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white"
              >
                See how it works <ChevronDown className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-4">
              {platform === "android" ? (
                <p className="text-sm text-[#AAB7CA]">On iPhone today. Android is on its way.</p>
              ) : (
                <PriceLine light />
              )}
            </div>
          </div>

          <div className="relative mx-auto w-[min(70vw,290px)] lg:w-[310px]">
            <div className="absolute -inset-10 rounded-full bg-[#2941A3]/30 blur-3xl" />
            <PhoneFrame
              src={shot("dashboard")}
              alt="The Novara dashboard: a Network Health score and the people to follow up with"
              className="relative lg:rotate-[2deg]"
              eager
            />
            {/* On desktop, the phone is the one place to send them. */}
            {platform === "desktop" && (
              <div className="absolute -bottom-6 -left-24 hidden w-44 rounded-2xl bg-white p-3 text-center shadow-2xl lg:block">
                <img
                  src={`${basePath}/start/app-store-qr.svg`}
                  alt="QR code for Novara on the App Store"
                  className="mx-auto h-28 w-28"
                />
                <p className="mt-2 text-xs font-semibold leading-snug text-[#08111F]">
                  Scan with your iPhone camera to download
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Sound familiar ──────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-serif text-3xl font-bold sm:text-4xl">Sound familiar?</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {FAMILIAR.map((q) => (
              <div
                key={q}
                className="rounded-2xl border border-[#E4E2DA] bg-white px-5 py-4 text-center font-serif text-lg italic text-[#2A3146] md:p-6 md:text-xl"
              >
                {q}
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-2xl text-center text-lg leading-relaxed text-[#4B5363]">
            Every one of those is a door that quietly closes. Not because you did anything wrong, just
            because life got busy. <span className="font-semibold text-[#08111F]">Novara keeps them open.</span>
          </p>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-4 bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-serif text-3xl font-bold sm:text-4xl">
            Thirty seconds after you meet someone
          </h2>
          <div className="-mx-4 mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:px-0">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex w-[72vw] max-w-[280px] shrink-0 snap-center flex-col items-center text-center md:w-auto md:max-w-none">
                <PhoneFrame src={step.src} alt={step.title} className="w-[180px] md:w-[220px]" />
                <div className="mt-7 flex items-center gap-2 text-sm font-semibold" style={{ color: BRAND }}>
                  <step.icon className="h-4 w-4" /> Step {i + 1}
                </div>
                <p className="mt-2 font-serif text-xl font-bold">{step.title}</p>
                <p className="mt-2 max-w-xs leading-relaxed text-[#5B6272]">{step.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-col items-center gap-3">
            <PrimaryCta platform={platform} where="how" />
            {platform !== "android" && <PriceLine />}
          </div>
        </div>
      </section>

      {/* ── Made for where you are ──────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center font-serif text-3xl font-bold sm:text-4xl">Made for where you are</h2>
          <div className="mx-auto mt-8 flex w-fit rounded-full border border-[#E4E2DA] bg-white p-1">
            {(Object.keys(AUDIENCES) as (keyof typeof AUDIENCES)[]).map((key) => {
              const Icon = AUDIENCES[key].icon;
              const active = key === audience;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAudience(key)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-5 ${
                    active ? "text-white" : "text-[#5B6272] hover:text-[#08111F]"
                  }`}
                  style={active ? { background: BRAND } : undefined}
                >
                  <Icon className="h-4 w-4" /> {AUDIENCES[key].label}
                </button>
              );
            })}
          </div>

          <div className="mt-12 grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="font-serif text-3xl font-bold leading-tight">{a.title}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {a.moments.map((m) => (
                  <span key={m} className="rounded-full bg-[#E9ECF7] px-3 py-1 text-sm font-medium text-[#2A3146]">
                    {m}
                  </span>
                ))}
              </div>
              <div className="mt-7 rounded-2xl border border-[#E4E2DA] bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#7A8191]">Your career profile</p>
                <p className="mt-2 font-medium">“{a.goal}”</p>
              </div>
              <p className="mt-6 text-lg leading-relaxed text-[#4B5363]">{a.body}</p>
            </div>
            <PhoneFrame
              src={shot("career-profile")}
              alt="Novara's career profile, where you describe your goals"
              className="mx-auto hidden w-[240px] lg:block"
            />
          </div>
        </div>
      </section>

      {/* ── Privacy ─────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-20" style={{ background: NAVY }}>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 md:grid-cols-[auto_1fr] md:items-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
            <Lock className="h-6 w-6 text-[#8FA6FF]" />
          </span>
          <div>
            <h2 className="font-serif text-2xl font-bold text-white sm:text-3xl">Your network stays yours.</h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-[#AAB7CA]">
              Novara never connects to your LinkedIn account; it only reads the screenshot you give it.
              Your list is just for you, with no feed and no team. You can export everything at any time, and a priority you
              set yourself is never overridden.
            </p>
          </div>
        </div>
      </section>

      {/* ── Founder ─────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center sm:px-6">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full font-serif text-xl font-bold text-white"
            style={{ background: "radial-gradient(circle at 30% 30%, #1334A7, #040E41)" }}
            aria-hidden
          >
            CC
          </div>
          <p className="mt-6 font-serif text-2xl italic leading-snug sm:text-[1.7rem]">
            “I moved from France to the US alone at 18 and built my network from scratch. Meeting people
            was the easy part. Keeping up with them was the hard part, so I built Novara.”
          </p>
          <p className="mt-4 text-sm font-medium text-[#5B6272]">Cloé Carmery, founder · UF alum</p>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="bg-white py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-center font-serif text-3xl font-bold sm:text-4xl">Less than a coffee a month</h2>
          <div className="mt-10 rounded-3xl border border-[#E4E2DA] p-6 shadow-[0_24px_48px_-28px_rgba(8,17,31,0.25)] sm:p-10">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <NovaraMark size={36} />
                <p className="font-serif text-2xl font-bold">Novara Pro</p>
              </div>
              <span className="rounded-full bg-[#E9ECF7] px-3 py-1 text-xs font-semibold" style={{ color: BRAND }}>
                7 days free
              </span>
            </div>
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
            <ul className="mt-7 grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-2">
              {[
                "Unlimited contacts",
                "Follow-up reminders",
                "Card, QR and LinkedIn import",
                "Goal-based priorities",
                "Conversation starters",
                "Export your data anytime",
              ].map((f) => (
                <li key={f} className="flex items-center gap-2.5">
                  <Check className="h-4 w-4 shrink-0" style={{ color: BRAND }} /> {f}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col items-center gap-3">
              <PrimaryCta platform={platform} where="pricing" />
              <p className="text-xs text-[#7A8191]">Cancel anytime in your iPhone’s Settings.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-center font-serif text-3xl font-bold sm:text-4xl">Questions</h2>
          <div className="mt-10 divide-y divide-[#E4E2DA] rounded-2xl border border-[#E4E2DA] bg-white">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-[#7A8191] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 leading-relaxed text-[#5B6272]">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-28"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 50% 100%, rgba(41,65,163,0.6), transparent 70%), ${NAVY}`,
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 text-center sm:px-6">
          <NovaraMark size={56} />
          <h2 className="mt-8 font-serif text-3xl font-bold leading-tight text-white sm:text-5xl">
            Your next opportunity is probably someone you’ve already met.
          </h2>
          <div className="mt-10">
            <PrimaryCta platform={platform} where="final" onDark />
          </div>
          <div className="mt-4">
            {platform === "android" ? (
              <p className="text-sm text-[#AAB7CA]">On iPhone today. Android is on its way.</p>
            ) : (
              <PriceLine light />
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-sm text-[#7D8BA3]" style={{ background: NAVY }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 pb-20 sm:flex-row sm:px-6 sm:pb-0">
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

      {/* ── Sticky download bar (phones) ────────────────────────────────── */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-300 sm:hidden ${
          showSticky && platform !== "android" ? "translate-y-0" : "translate-y-full"
        }`}
        aria-hidden={!showSticky || platform === "android"}
      >
        <div className="flex items-center gap-3">
          <NovaraMark size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold leading-tight">Novara</p>
            <p className="truncate text-xs text-[#5B6272]">7 days free</p>
          </div>
          <a
            href={APP_STORE_URL}
            onClick={() => track("sticky:app_store", platform)}
            className="inline-flex items-center gap-1.5 rounded-full bg-black px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" /> Get the app
          </a>
        </div>
      </div>
    </div>
  );
}
