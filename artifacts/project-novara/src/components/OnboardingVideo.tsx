// ============================================================================
// The first-run introduction: a short, silent video of someone setting up
// Novara, with a banner over each step.
//
// WHAT DRIVES IT
// --------------
// Rendered by pages/Welcome.tsx, which owns completion (hasSeenTutorial):
//   • pages/Dashboard.tsx sends new accounts to /welcome
//   • pages/Settings.tsx "Replay Tutorial" sends people back here
//   • onComplete fires on Skip, Escape and "Get started"
//
// THE VIDEO
// ---------
// public/onboarding/novara-onboarding.mp4 is a screen recording of the real
// app with sample data, edited in demo/onboarding-tutorial (Remotion). To
// change it, re-render there and re-encode with -movflags +faststart so it
// starts playing before it has fully downloaded. It is not in the service
// worker precache (vite.config.ts globPatterns has no mp4), so it is only
// downloaded by people who open the tutorial.
//
// The video fills its area (object-cover trims a sliver of plain navy at the
// sides on tall phones), and the frame around it is the video's own navy in
// both themes, so there is no visible box edge.
//
// DEGRADES, NEVER TRAPS
//   • muted + playsInline, the only autoplay iOS allows; if autoplay is
//     refused anyway, it waits on a play button
//   • prefers-reduced-motion: nothing plays until the person taps play
//   • if the video cannot load (offline), "Get started" is right there
//   • Skip at every moment; Escape also closes
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const VIDEO_BG = "#08111F";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const VIDEO_SRC = `${base}/onboarding/novara-onboarding.mp4`;
const POSTER_SRC = `${base}/onboarding/novara-onboarding-poster.jpg`;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

interface OnboardingVideoProps {
  onComplete: () => void;
}

export function OnboardingVideo({ onComplete }: OnboardingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useMemo(prefersReducedMotion, []);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);

  const close = useCallback(() => onComplete(), [onComplete]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Autoplay where allowed. A refusal just leaves the play button showing.
  useEffect(() => {
    if (reducedMotion) return;
    videoRef.current?.play().catch(() => setPlaying(false));
  }, [reducedMotion]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (ended) video.currentTime = 0;
      setEnded(false);
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    setEnded(false);
    video.play().catch(() => setPlaying(false));
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[90] text-white"
      style={{ backgroundColor: VIDEO_BG }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Novara"
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col pt-safe pb-safe">
        <div className="flex shrink-0 items-center justify-end px-5 py-2">
          <button
            onClick={close}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-white/70 transition-colors hover:text-white"
          >
            Skip
          </button>
        </div>

        <div className="relative min-h-0 flex-1">
          {failed ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <h2 className="font-serif text-[26px] font-bold leading-tight">Welcome to Novara</h2>
              <p className="text-[15px] leading-relaxed text-white/70">
                The introduction video couldn't load. You can watch it any time from Settings, under Replay Tutorial.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={togglePlay}
              className="group absolute inset-0 block h-full w-full"
              aria-label={playing ? "Pause video" : "Play video"}
            >
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                src={VIDEO_SRC}
                poster={POSTER_SRC}
                muted
                playsInline
                preload="auto"
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => {
                  setPlaying(false);
                  setEnded(true);
                }}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration) setProgress(v.currentTime / v.duration);
                }}
                onError={() => setFailed(true)}
              />
              {!playing && !ended && (
                <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#08111F] shadow-lg">
                  <Play className="ml-1 h-7 w-7 fill-current" />
                </span>
              )}
              {playing && (
                <span className="absolute right-4 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <Pause className="h-4 w-4 fill-current" />
                </span>
              )}
            </button>
          )}
        </div>

        <div className="shrink-0 px-6 pb-1 pt-3">
          {!failed && (
            <div className="mb-4 h-1 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <div className="h-full rounded-full bg-white/70" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
          <div className="flex gap-3">
            {ended && (
              <Button
                variant="outline"
                onClick={replay}
                className="h-auto flex-1 gap-2 rounded-2xl border-white/25 bg-transparent px-4 py-3.5 text-[15px] font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Watch again
              </Button>
            )}
            <Button
              onClick={close}
              className="h-auto flex-1 gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-transform duration-150 active:scale-[0.985]"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  // Portalled so no ancestor stacking context can put the bottom nav over it.
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}
