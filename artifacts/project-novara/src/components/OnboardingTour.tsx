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
// NO NATIVE BUILD IS NEEDED. The pictures are React components
// (OnboardingScreens.tsx), drawn with the app's own tokens and components, so
// they follow the current design and both themes without re-recording
// anything. They replaced screen recordings of the old navy UI.
//
// WHY IT IS BUILT THE WAY IT IS
// -----------------------------
//   • ALL screens are mounted once and never unmounted, and steps CROSSFADE
//     by opacity, so the outgoing screen is still there while the incoming
//     one appears. There is never an empty frame.
//   • Each screen is laid out at phone size and scaled to fit the frame, so
//     it reads as a device-sized preview rather than a squashed page.
//   • The frame is fixed: the picture, the copy block and the button all
//     occupy the same space on every step, so only the CONTENT changes.
//     The copy block has a min-height so a longer description cannot push the
//     button around.
//   • It renders through a PORTAL to document.body. As a sibling of BottomNav
//     inside the page tree, z-index alone did not reliably win — an ancestor
//     stacking context scoped it, and the nav showed through the overlay.
//
// DEGRADES, NEVER TRAPS
//   • prefers-reduced-motion: no crossfade, no animated spotlight
//   • Skip on every step including the last; Escape also closes
//   • no step asks for Contacts, camera or notification permission
// ============================================================================
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canPickNativeContact } from "@/lib/nativeBridge";
import {
  MOCK_HEIGHT, MOCK_WIDTH, type MockScreen,
  HealthScreen, GoalsScreen, FollowUpsScreen, ContactNowScreen, StartersScreen,
  AddScreen, RememberScreen, NotifyScreen,
} from "@/components/OnboardingScreens";

interface Step {
  title: string;
  description: string;
  /** The screen the step is about. It spotlights the one thing the copy
   *  names, and everything else dims. */
  screen: MockScreen;
}

// The product loop, in order: you meet someone, Novara remembers them,
// understands the relationship, tells you when it needs attention, gives you
// something to say, lets you act on it, and reminds you again later. Each beat
// carries ONE idea, and each names the thing its screen is pointing at.
//
// Built at render rather than at import: whether the iPhone Contacts import
// exists is only known once the native bridge is up.
function buildSteps(): Step[] {
  return [
    {
      title: "Know where you stand",
      description:
        "See your Network Health score, how it has moved since last month, and who is warm, cooling, cold or dormant.",
      screen: HealthScreen,
    },
    {
      title: "Built around your goals",
      description:
        "Tell Novara what you're working towards, and the contacts who can help you get there rise in priority.",
      screen: GoalsScreen,
    },
    {
      title: "See who needs you today",
      description:
        "Your Dashboard lists who is overdue and who is coming up, most important first, with exactly how long it has been.",
      screen: FollowUpsScreen,
    },
    {
      title: "Reach out in one tap",
      description:
        "Contact now opens the way you actually talk to them \u2014 text, email or LinkedIn \u2014 without hunting for the details.",
      screen: ContactNowScreen,
    },
    {
      title: "No more \u201cjust checking in\u201d",
      description:
        "Novara pulls recent news about their company, so you always have a real reason to get back in touch.",
      screen: StartersScreen,
    },
    {
      title: "Add someone in seconds",
      description: canPickNativeContact()
        ? "Type them in, or import from your iPhone contacts \u2014 photo included \u2014 a business card, a LinkedIn screenshot or a QR code."
        : "Type them in, or scan a business card, a LinkedIn screenshot or a QR code, right there at the event.",
      screen: AddScreen,
    },
    {
      title: "Then let Novara remember",
      description:
        "Each contact gets their own rhythm, and Novara sets the next date when you reach out. It remembers birthdays too.",
      screen: RememberScreen,
    },
    {
      title: "It tells you when it's time",
      description:
        "A reminder arrives on the day \u2014 a follow-up that's due, or a birthday \u2014 and one tap takes you straight to them.",
      screen: NotifyScreen,
    },
  ];
}

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
  const steps = useMemo(buildSteps, []);
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  const current = steps[step];
  const isLast = step === steps.length - 1;

  // The screens are laid out at phone width; shrink them to the frame, which
  // is sized by the viewport height. Measured before paint so they never
  // appear at full size first.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setScale(frame.clientWidth / MOCK_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

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
            {step + 1} of {steps.length}
          </span>
          <button
            onClick={close}
            className="-mr-2 rounded-lg px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-7">
          {/* One container for the whole sequence. Width-capped so the screen
              reads as a device-sized preview, and fixed in place so nothing
              moves between steps. */}
          <div
            ref={frameRef}
            className="relative h-[min(50vh,460px)] aspect-[660/1338] shrink-0 overflow-hidden rounded-[22px] border border-border bg-background shadow-[var(--shadow-raised)]"
            aria-hidden="true"
          >
            {steps.map(({ screen: Screen }, i) => {
              const visible = i === step;
              return (
                <div
                  key={i}
                  className="pointer-events-none absolute left-0 top-0 origin-top-left select-none transition-opacity"
                  style={{
                    width: MOCK_WIDTH,
                    height: MOCK_HEIGHT,
                    transform: `scale(${scale})`,
                    opacity: visible ? 1 : 0,
                    transitionDuration: `${reducedMotion ? 0 : CROSSFADE_MS}ms`,
                  }}
                >
                  <Screen active={visible} />
                </div>
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
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ease-out ${
                  i === step ? "w-5 bg-primary" : i < step ? "w-1.5 bg-primary/40" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          <Button
            variant="cta"
            onClick={next}
            className="h-auto w-full gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-transform duration-150 active:scale-[0.985]"
          >
            {isLast ? "Get started" : "Continue"}
            {isLast ? <ArrowRight className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );

  // Portalled so no ancestor stacking context can put BottomNav over it.
  return typeof document === "undefined"
    ? overlay
    : createPortal(overlay, document.body);
}
