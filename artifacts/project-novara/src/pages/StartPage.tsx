// ============================================================================
// Novara's landing page for students and young professionals, at /start.
//
// ONE JOB, IN THE FIRST FEW SECONDS: get the visitor to download the iOS app.
// So the page is short on purpose: a hero (promise, button, the app moving in
// a phone), one strip of three screens, and the button again. It does not tour
// every feature and does not link the /try demo: using Novara means
// downloading it.
//
// PUBLIC AND UNAUTHENTICATED on purpose: it is the link shared with students
// (career services, flyers, LinkedIn). Registered in App.tsx outside
// ProtectedRoute; InstallPrompt hides itself here because its "add to home
// screen" banner would compete with the App Store button.
//
// The hero shows two store badges: the App Store, and an Android "coming
// soon" badge that is not a link. Desktop also gets a QR code to scan; the
// closing button tells Android visitors there is no Play Store build yet.
// Every button reports to PostHog as `start_cta`.
//
// The phone plays real app screenshots (public/screens/, fictional demo
// contacts) rather than a screen recording: the existing recordings show a
// real-looking contact and live headlines that cannot go on a public page.
// ============================================================================
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Download } from "lucide-react";
import { NovaraMark } from "@/components/NovaraMark";
import { PhoneFrame } from "@/components/PhoneFrame";
import { APP_STORE_URL } from "@/lib/appStore";

const NAVY = "#08111F";
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

/** The one action. Android has no Play Store build yet, so it says so. */
function DownloadButton({ platform, where }: { platform: Platform; where: string }) {
  if (platform === "android") {
    return (
      <span className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3.5 text-base font-semibold text-white">
        Coming soon to the Play Store
      </span>
    );
  }
  return (
    <a
      href={APP_STORE_URL}
      onClick={() => track(`${where}:app_store`, platform)}
      className="inline-flex items-center justify-center gap-2.5 rounded-full bg-white px-7 py-4 text-base font-semibold text-black shadow-[0_12px_32px_-10px_rgba(0,0,0,0.7)] transition-transform hover:-translate-y-0.5"
    >
      <AppleLogo className="h-5 w-5" />
      Download on the App Store
    </a>
  );
}

function PlayLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M4.2 2.4c-.3.3-.4.7-.4 1.2v16.8c0 .5.1.9.4 1.2l9.3-9.6-9.3-9.6Zm10.6 10.9 2.6 2.7-11.2 6.4 8.6-9.1Zm0-2.6L6.2 1.6l11.2 6.4-2.6 2.7Zm3.9-2.1 3 1.7c.9.5.9 1.3 0 1.8l-3 1.7-2.9-2.6 2.9-2.6Z" />
    </svg>
  );
}

/** The hero's pair of store badges: the App Store, live, and Android, not
 *  yet. Same box and the same blue family: the App Store one is a bright,
 *  saturated Novara blue because it is the call to action, Android is the
 *  muted version of it. Both edges are visible against the navy, so they read
 *  as one size. Android is deliberately not a link. No hover lift, so the two
 *  always line up. */
const BADGE =
  "box-border inline-flex h-14 w-[164px] shrink-0 items-center gap-2.5 rounded-2xl border-[1.5px] px-3.5 sm:w-[176px]";

function BadgeText({ small, big }: { small: string; big: string }) {
  return (
    <span className="flex min-w-0 flex-col leading-none">
      <span className="text-[11px] font-medium">{small}</span>
      <span className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{big}</span>
    </span>
  );
}

function StoreBadges({ platform }: { platform: Platform }) {
  return (
    <div className="flex items-center gap-3">
      <a
        href={APP_STORE_URL}
        onClick={() => track("hero:app_store", platform)}
        className={`${BADGE} border-[#6B85FF] bg-[#3B5BFF] text-white transition-colors hover:bg-[#4A68FF]`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <AppleLogo className="h-7 w-7" />
        </span>
        <BadgeText small="Download on the" big="App Store" />
      </a>
      <span
        aria-label="Android app coming soon"
        className={`${BADGE} cursor-default select-none border-[#33459A] bg-[#131E45] text-[#9FB2FF]`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">
          <PlayLogo className="h-6 w-6" />
        </span>
        <BadgeText small="Coming soon" big="Android" />
      </span>
    </div>
  );
}

function FinePrint({ platform }: { platform: Platform }) {
  return (
    <p className="text-sm text-[#AAB7CA]">
      {platform === "android"
        ? "On iPhone today. Android is on its way."
        : "7 days free for new subscribers, then $4.99/month. Cancel anytime."}
    </p>
  );
}

/** What the hero phone plays, one screen at a time, each with the line that
 *  says why it matters. */
const REEL = [
  { src: shot("dashboard"), line: "See who needs you today" },
  { src: shot("contact"), line: "Priorities that follow your goals" },
  { src: shot("conversation-starters"), line: "Always something to say" },
  { src: shot("add-card"), line: "Add anyone in seconds" },
];
const REEL_MS = 2800;

function PhoneReel() {
  const [i, setI] = useState(0);
  useEffect(() => {
    // Respect reduced motion: hold on the first screen.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % REEL.length), REEL_MS);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="relative">
      <div className="relative">
        <PhoneFrame src={REEL[0].src} alt="Novara on iPhone" eager />
        {/* The other screens stack on the first and cross-fade in turn. */}
        {REEL.slice(1).map((s, n) => (
          <img
            key={s.src}
            src={s.src}
            alt=""
            aria-hidden
            className={`absolute left-[9px] top-[9px] w-[calc(100%-18px)] rounded-[2.05rem] transition-opacity duration-700 ${
              i === n + 1 ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
        {/* Keep the Dynamic Island above the fading screens. */}
        <div className="pointer-events-none absolute left-1/2 top-[calc(9px+1.55%)] h-[3%] w-[28%] -translate-x-1/2 rounded-full bg-[#0B0F17]" />
      </div>
      <div className="absolute -bottom-5 left-1/2 w-max max-w-[92%] -translate-x-1/2">
        <p
          key={i}
          className="animate-in fade-in slide-in-from-bottom-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#08111F] shadow-xl duration-500"
        >
          {REEL[i].line}
        </p>
      </div>
    </div>
  );
}

const PROOF = [
  { src: shot("dashboard"), title: "Know who to reach out to", body: "Overdue and upcoming, ranked by what matters to you." },
  { src: shot("conversation-starters"), title: "Never send “just checking in”", body: "Fresh news on their company, every day." },
  { src: shot("add-card"), title: "Add someone in seconds", body: "Snap a business card or a LinkedIn screenshot." },
];

export default function StartPage() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [showSticky, setShowSticky] = useState(false);
  const heroCtaRef = useRef<HTMLDivElement>(null);
  const finalCtaRef = useRef<HTMLDivElement>(null);

  useEffect(() => setPlatform(detectPlatform()), []);

  // The sticky bar shows only while neither of the page's own buttons is on
  // screen, so two download buttons never stack at the bottom.
  useEffect(() => {
    const targets = [heroCtaRef.current, finalCtaRef.current].filter(Boolean) as Element[];
    const visible = new Set<Element>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target);
          else visible.delete(e.target);
        }
        setShowSticky(visible.size === 0);
      },
      { rootMargin: "0px 0px -40px 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Novara: keep the people you meet";
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    if (description) {
      description.content =
        "Novara reminds you who to follow up with and gives you something to say. For students and young professionals. 7 days free on iPhone.";
    }
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== undefined) description.content = previousDescription;
    };
  }, []);

  return (
    <div
      className="min-h-[100dvh] overflow-x-clip text-white antialiased"
      style={{ fontFamily: SANS, colorScheme: "dark", background: NAVY }}
    >
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section
        className="relative"
        style={{
          background: `radial-gradient(ellipse 70% 55% at 75% 45%, rgba(41,65,163,0.6), transparent 70%), ${NAVY}`,
        }}
      >
        <header className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <NovaraMark size={30} />
            <span className="font-serif text-lg font-bold">Novara</span>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-6 sm:px-6 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.1fr_0.9fr] lg:pb-16 lg:pt-0">
          <div>
            <p className="text-sm font-semibold text-[#8FA6FF]">Networking for students &amp; young professionals</p>
            <h1 className="mt-3 font-serif text-[2.6rem] font-bold leading-[1.04] sm:text-6xl lg:text-7xl">
              Great chat.{" "}
              <span className="text-[#8FA6FF]">Now what?</span>
            </h1>
            <p className="mt-5 max-w-lg text-xl leading-relaxed text-[#C4CEDD] sm:text-2xl">
              Novara turns people you meet into contacts you keep.
            </p>
            <div ref={heroCtaRef} className="mt-8 flex flex-col items-start gap-3">
              <StoreBadges platform={platform} />
              <FinePrint platform={platform} />
            </div>
          </div>

          <div className="relative mx-auto w-[min(72vw,280px)] lg:w-[320px]">
            <div className="absolute -inset-12 rounded-full bg-[#2941A3]/35 blur-3xl" />
            <PhoneReel />
            {platform === "desktop" && (
              <div className="absolute -left-40 bottom-16 hidden w-36 rounded-2xl bg-white p-3 text-center shadow-2xl lg:block">
                <img
                  src={`${basePath}/start/app-store-qr.svg`}
                  alt="QR code for Novara on the App Store"
                  className="mx-auto h-24 w-24"
                />
                <p className="mt-2 text-[11px] font-semibold leading-snug text-[#08111F]">
                  Scan with your iPhone to download
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Three screens, one line each ────────────────────────────────── */}
      <section className="bg-[#F7F6F2] py-16 text-[#08111F] sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:px-6 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible">
            {PROOF.map((p) => (
              <div
                key={p.title}
                className="flex w-[64vw] max-w-[260px] shrink-0 snap-center flex-col items-center text-center md:w-auto md:max-w-none"
              >
                <PhoneFrame src={p.src} alt={p.title} className="w-[170px] md:w-[200px]" />
                <p className="mt-6 font-serif text-xl font-bold">{p.title}</p>
                <p className="mt-1.5 text-[#5B6272]">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── The button again ────────────────────────────────────────────── */}
      <section
        className="py-20 sm:py-24"
        style={{
          background: `radial-gradient(ellipse 60% 80% at 50% 100%, rgba(41,65,163,0.6), transparent 70%), ${NAVY}`,
        }}
      >
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 text-center sm:px-6">
          <h2 className="font-serif text-3xl font-bold leading-tight sm:text-5xl">
            Your next opportunity is probably someone you’ve already met.
          </h2>
          <div ref={finalCtaRef} className="mt-9 flex flex-col items-center gap-3">
            <DownloadButton platform={platform} where="final" />
            <FinePrint platform={platform} />
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-sm text-[#7D8BA3]">
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
      {platform !== "android" && (
        <div
          className={`fixed inset-x-0 bottom-0 z-40 border-t border-black/5 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-[#08111F] backdrop-blur-md transition-transform duration-300 sm:hidden ${
            showSticky ? "translate-y-0" : "translate-y-full"
          }`}
          aria-hidden={!showSticky}
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
      )}
    </div>
  );
}
