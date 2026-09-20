// ============================================================================
// The first-run introduction to Novara.
//
// WHAT DRIVES IT (unchanged, deliberately)
// ----------------------------------------
// The export and props are `OnboardingTour` / `onComplete`, so the two callers
// need no edits:
//   • pages/Dashboard.tsx renders it when `!settings.hasSeenTutorial`
//   • pages/Settings.tsx "Replay Tutorial" sets hasSeenTutorial back to false
//
// Completion lives in user_settings.has_seen_tutorial. The API returns false
// for a user with no settings row (routes/settings.ts) and the column defaults
// to false, so NEW accounts see this. hooks/useSettings.ts defaults the client
// value to TRUE, which is what stops it being forced on people mid-session
// before their real settings arrive. Do not change either default.
//
// NO NATIVE BUILD IS NEEDED. Clips are web assets under /onboarding/, not in
// the binary, and Capacitor already compiles in the two WKWebView settings
// inline muted video needs (allowsInlineMediaPlayback,
// mediaTypesRequiringUserActionForPlayback). Build 8 plays this as shipped.
//
// WHY IT IS BUILT THE WAY IT IS
// -----------------------------
// The first version remounted a single <video> per step via `key={step}`. That
// is what made it feel like five separate things rather than one sequence:
// every Continue destroyed the element, started a fresh network fetch, and
// showed an empty box until the first frame decoded. Hard cut, visible gap.
//
// So now:
//   • ALL five <video> elements are mounted once and never unmounted. The
//     whole payload is ~432 KB, so preloading every clip up front costs one
//     cheap burst at open and makes every later step instant.
//   • Steps CROSSFADE by opacity. The outgoing frame is still on screen while
//     the incoming one appears, so there is never an empty container.
//   • Inactive clips are paused rather than torn down, so each holds a decoded
//     frame — its own poster. Nothing ever renders blank.
//   • The frame is fixed: the media box, the copy block and the button all
//     occupy the same space on every step, so only the CONTENT changes.
//     The copy block has a min-height so a longer description cannot push the
//     button around.
//   • It renders through a PORTAL to document.body. As a sibling of BottomNav
//     inside the page tree, z-index alone did not reliably win — an ancestor
//     stacking context scoped it, and the nav showed through the overlay.
//
// DEGRADES, NEVER TRAPS
//   • a clip that fails falls back to that step's icon, per step
//   • prefers-reduced-motion: no autoplay, no crossfade, icons instead
//   • Skip on every step including the last; Escape also closes
//   • muted, so it can never make noise in a meeting
//   • no step asks for Contacts, camera or notification permission
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity, UserPlus, Sparkles, Newspaper, BellRing,
  ArrowRight, ChevronRight, type LucideIcon,
} from "lucide-react";

interface Step {
  title: string;
  description: string;
  /** Served from the web app, not the binary. Optional: no clip is fine. */
  video?: string;
  /** Shown when the clip fails, or when the user prefers reduced motion. */
  icon: LucideIcon;
  tone: string;
}

const STEPS: Step[] = [
  {
    title: "Your network, remembered",
    description:
      "Everyone who matters to your career in one place, with today's follow-ups at the top.",
    video: "/onboarding/01-dashboard.mp4",
    icon: Activity,
    tone: "bg-primary/15 text-primary",
  },
  {
    title: "Add people in seconds",
    description:
      "Scan a business card, or import someone straight from your iPhone contacts.",
    video: "/onboarding/02-add.mp4",
    icon: UserPlus,
    tone: "bg-priority-medium-soft text-priority-medium",
  },
  {
    title: "See who's going cold",
    description:
      "Contacts move from Warm to Cooling to Cold as time passes, so nothing slips quietly.",
    video: "/onboarding/03-status.mp4",
    icon: Sparkles,
    tone: "bg-cooling-soft text-cooling",
  },
  {
    title: "Always have a reason",
    description:
      "Recent news about their company, ready to open with — instead of “just checking in”.",
    video: "/onboarding/04-contact.mp4",
    icon: Newspaper,
    tone: "bg-warm-soft text-warm",
  },
  {
    title: "Never miss a follow-up",
    description:
      "A reminder when someone is due. Tap it and you land on their profile, ready to write.",
    video: "/onboarding/05-reminders.mp4",
    icon: BellRing,
    tone: "bg-priority-high-soft text-priority-high",
  },
];

/** Long enough to read as a dissolve, short enough to feel instant. */
const CROSSFADE_MS = 280;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Play only the step on screen, and rewind it so it always opens on its
  // first frame rather than wherever it happened to be left. Everything else
  // pauses, holding a decoded frame so the crossfade never reveals an empty
  // box. Runs after paint, so tapping Continue is never gated on video work.
  useEffect(() => {
    if (reducedMotion) return;
    videoRefs.current.forEach((el, i) => {
      if (!el) return;
      if (i === step) {
        try {
          el.currentTime = 0;
        } catch {
          // Seeking before metadata arrives throws on some engines; the clip
          // simply starts wherever it is, which is still a real frame.
        }
        el.play().catch(() => {
          // Autoplay can be refused (Low Power Mode). The first frame stays
          // on screen, which is a perfectly good still.
        });
      } else {
        el.pause();
      }
    });
  }, [step, reducedMotion]);

  const close = useCallback(() => onComplete(), [onComplete]);

  // Escape is the keyboard equivalent of Skip — insurance against trapping
  // anyone on iPad with a keyboard, or on the web.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const next = () => (isLast ? close() : setStep((s) => s + 1));

  const overlay = (
    <div
      className="fixed inset-0 z-[90] bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Novara"
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-6 pt-safe pb-safe">
        <div className="flex shrink-0 items-center justify-between py-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {step + 1} of {STEPS.length}
          </span>
          <button
            onClick={close}
            className="-mr-2 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7">
          {/* One container for the whole sequence. Width-capped so the clip
              reads as a device-sized preview rather than a shrunken
              screenshot, and fixed in place so nothing moves between steps. */}
          <div // aspect matches the clips exactly (660x1338). It was 9/16, which is
              // WIDER than the footage, so object-cover silently cropped the top
              // and bottom off every step — which is why clips appeared to open
              // mid-sentence.
              className="relative aspect-[660/1338] w-full max-w-[248px] max-h-[52vh] shrink-0 overflow-hidden rounded-[22px] border border-border bg-elevated">
            {STEPS.map((s, i) => {
              const visible = i === step;
              const useIcon = reducedMotion || !s.video || failed[i];
              if (useIcon) {
                const Icon = s.icon;
                return (
                  <div
                    key={i}
                    className="absolute inset-0 flex items-center justify-center transition-opacity"
                    style={{
                      opacity: visible ? 1 : 0,
                      transitionDuration: `${reducedMotion ? 0 : CROSSFADE_MS}ms`,
                    }}
                    aria-hidden={!visible}
                  >
                    <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${s.tone}`}>
                      <Icon className="h-7 w-7" />
                    </div>
                  </div>
                );
              }
              return (
                <video
                  key={i}
                  ref={(el) => {
                    videoRefs.current[i] = el;
                  }}
                  className="absolute inset-0 h-full w-full object-cover transition-opacity"
                  style={{
                    opacity: visible ? 1 : 0,
                    transitionDuration: `${CROSSFADE_MS}ms`,
                  }}
                  src={s.video}
                  muted
                  playsInline
                  loop
                  // Every clip is fetched when onboarding opens, not when its
                  // step arrives. ~432 KB total buys an instant Continue.
                  preload="auto"
                  aria-hidden="true"
                  onError={() => setFailed((f) => ({ ...f, [i]: true }))}
                />
              );
            })}
          </div>

          {/* min-height holds the frame steady: a three-line description on
              one step must not shift the dots or the button on another. */}
          <div
            key={step}
            className="min-h-[116px] w-full text-center animate-in fade-in slide-in-from-bottom-1 duration-300"
          >
            <h2 className="font-serif text-[26px] font-bold leading-tight tracking-tight text-foreground">
              {current.title}
            </h2>
            <p className="mx-auto mt-2.5 max-w-[19rem] text-[15px] leading-relaxed text-muted-foreground">
              {current.description}
            </p>
          </div>
        </div>

        <div className="shrink-0 pb-1 pt-2">
          <div className="mb-5 flex justify-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ease-out ${
                  i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          <button
            onClick={next}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-[15px] font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.985]"
          >
            {isLast ? "Get started" : "Continue"}
            {isLast ? <ArrowRight className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  // Portalled so no ancestor stacking context can put BottomNav over it.
  return typeof document === "undefined"
    ? overlay
    : createPortal(overlay, document.body);
}
