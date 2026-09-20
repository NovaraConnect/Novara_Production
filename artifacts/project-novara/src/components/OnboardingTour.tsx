// ============================================================================
// The first-run introduction to Novara.
//
// WHY THIS REPLACED THE OLD TOUR, IN PLACE
// ----------------------------------------
// This used to be a small coach-mark card docked above the bottom nav. It is
// now a full-screen introduction with a short silent clip per beat. The export
// name and props are deliberately UNCHANGED (`OnboardingTour`, `onComplete`),
// so the two things that drive it keep working without edits:
//
//   • pages/Dashboard.tsx renders it when `!settings.hasSeenTutorial`
//   • pages/Settings.tsx "Replay Tutorial" sets hasSeenTutorial back to false
//
// Completion lives server-side in user_settings.has_seen_tutorial, and
// hooks/useSettings.ts defaults it to TRUE. That default is what stops this
// being forced on people who were already using Novara — only rows that say
// false see it. Do not change that default.
//
// NO NATIVE BUILD IS NEEDED FOR THIS. The clips are ordinary web assets served
// from /onboarding/, not bundled into the binary, and Capacitor already ships
// the two WKWebView settings inline muted video needs
// (allowsInlineMediaPlayback, mediaTypesRequiringUserActionForPlayback) — see
// CAPBridgeViewController.swift. Build 8 plays this as-is.
//
// DEGRADES, NEVER TRAPS
//   • a clip that fails to load falls back to the step's icon
//   • prefers-reduced-motion skips playback entirely and shows the icon
//   • Skip is on screen at every step, and Escape closes it
//   • no step asks for Contacts, camera or notification permission
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, UserPlus, Sparkles, Newspaper, BellRing,
  ArrowRight, ChevronRight, type LucideIcon,
} from "lucide-react";

interface Step {
  /** Short enough to read in the seconds before the clip loops. */
  title: string;
  description: string;
  /** Served from the web app, not the binary. Optional: no clip is fine. */
  video?: string;
  /** Shown when the clip fails, or when the user prefers reduced motion. */
  icon: LucideIcon;
  /** Tailwind classes for the icon chip. Semantic tokens only. */
  tone: string;
}

const STEPS: Step[] = [
  {
    title: "Your network, remembered",
    description:
      "Novara keeps the people who matter to your career in one place, and tells you who to reach out to today.",
    video: "/onboarding/01-dashboard.mp4",
    icon: Activity,
    tone: "bg-primary/15 text-primary",
  },
  {
    title: "Add people in seconds",
    description:
      "Scan a business card with the camera, or import someone straight from your iPhone contacts.",
    video: "/onboarding/02-add.mp4",
    icon: UserPlus,
    tone: "bg-priority-medium-soft text-priority-medium",
  },
  {
    title: "See who's going cold",
    description:
      "Everyone moves between Warm, Cooling, Cold and Dormant as time passes, so nothing slips quietly.",
    video: "/onboarding/03-status.mp4",
    icon: Sparkles,
    tone: "bg-cooling-soft text-cooling",
  },
  {
    title: "Always have a reason",
    description:
      "Open a contact to see what their company has been doing lately — so your message is about something real.",
    video: "/onboarding/04-contact.mp4",
    icon: Newspaper,
    tone: "bg-warm-soft text-warm",
  },
  {
    title: "Never miss a follow-up",
    description:
      "Novara reminds you when someone is due. Tap the reminder and you land on their profile, ready to write.",
    video: "/onboarding/05-reminders.mp4",
    icon: BellRing,
    tone: "bg-priority-high-soft text-priority-high",
  },
];

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * The clip for one step, or its icon if the clip cannot or should not play.
 *
 * Remounted per step via `key`, so only one <video> is ever in the document
 * and nothing keeps decoding in the background.
 */
function StepMedia({ step, reducedMotion }: { step: Step; reducedMotion: boolean }) {
  const [failed, setFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Autoplay can still be refused at runtime (Low Power Mode, for instance).
  // The promise rejecting is not worth surfacing — the first frame stays on
  // screen, which is a perfectly good still.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || reducedMotion) return;
    el.play().catch(() => {});
  }, [reducedMotion]);

  const showIcon = failed || reducedMotion || !step.video;
  const Icon = step.icon;

  return (
    <div className="relative aspect-[9/16] max-h-[52vh] w-full overflow-hidden rounded-3xl border border-border bg-elevated">
      {showIcon ? (
        <div className="flex h-full w-full items-center justify-center">
          <div className={`flex h-20 w-20 items-center justify-center rounded-3xl ${step.tone}`}>
            <Icon className="h-9 w-9" />
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={step.video}
          // Silent by design: an onboarding that makes noise in a meeting is a
          // deletion. `muted` is also what lets iOS autoplay it at all.
          muted
          playsInline
          loop
          autoPlay
          preload="auto"
          aria-hidden="true"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Escape is the keyboard equivalent of Skip. Cheap insurance against ever
  // trapping someone — on iPad with a keyboard, or on the web.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onComplete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onComplete]);

  const next = () => (isLast ? onComplete() : setStep((s) => s + 1));

  return (
    <div
      // z-[90]: above BottomNav (z-50), which renders later in the DOM and
      // would otherwise win the tie and sit on top of the overlay. Still
      // below toasts (z-[100]) so an error can surface over it.
      className="fixed inset-0 z-[90] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Novara"
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col px-5 pt-safe pb-safe">
        {/* Skip is present on every step, including the last. */}
        <div className="flex items-center justify-between py-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {step + 1} of {STEPS.length}
          </span>
          <button
            onClick={onComplete}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
          <StepMedia key={step} step={current} reducedMotion={reducedMotion} />

          <div>
            <h2 className="font-serif text-2xl font-bold leading-tight tracking-tight text-foreground">
              {current.title}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {current.description}
            </p>
          </div>
        </div>

        <div className="pb-2 pt-4">
          <div className="mb-4 flex justify-center gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          <button
            onClick={next}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99]"
          >
            {isLast ? "Get started" : "Continue"}
            {isLast ? <ArrowRight className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
