// ============================================================================
// The first-run introduction: a short narrated video of someone setting up
// Novara, with a banner over each step.
//
// WHAT DRIVES IT
// --------------
// Rendered by pages/Welcome.tsx, which owns completion (hasSeenTutorial):
//   • pages/Dashboard.tsx sends new accounts to /welcome
//   • pages/Settings.tsx "Replay Tutorial" sends people back here
//   • onComplete fires on Escape and on the bottom button
//
// THE VIDEO
// ---------
// public/onboarding/novara-onboarding.mp4 is a screen recording of the real
// app with sample data and a voiceover, edited in demo/onboarding-tutorial
// (Remotion). To change it, re-render there and re-encode with
// -movflags +faststart and BT.709 colour tags (untagged, browsers show its
// navy as near black). It is not in the service worker precache
// (vite.config.ts globPatterns has no mp4), so it is only downloaded by
// people who open the tutorial.
//
// onboarding-chapters.json says where each of the 8 steps starts. It is
// written by demo/onboarding-tutorial/remotion/chapters.mjs from the same
// timeline the video is rendered from: re-export it whenever the video is
// re-rendered, or step skipping lands mid-step.
//
// The whole video always shows (object-contain). With object-cover, iPhones
// whose video area is wider than 9:16 (the safe areas, the sound row and the
// button row all take height) cropped the top and bottom, and the bottom of
// the phone mockup ended up behind the bar. Any space left at the sides is
// the video's own navy, so there is no visible box edge.
//
// MOVING THROUGH IT, LIKE A REEL OR YOUTUBE
// -----------------------------------------
//   • tap the right side for the next step, the left side for the previous
//     one (or back to the start of this one); the middle pauses. The video's
//     own banners say which step you're on, so there's no extra label
//   • drag or tap the bar at the bottom to jump anywhere; its ticks mark
//     where each step starts
//   • on a keyboard: arrow keys for steps, space to pause
//
// NOT AN INVITATION TO SKIP
// -------------------------
// A button at the bottom from the first frame read as "tap here to begin" and
// people skipped the demo by accident. So it appears only after a second of
// playback, and says what it does: "Skip the demo. Get Started". Only once
// the video has ended does it become a plain "Get started".
//
// DEGRADES, NEVER TRAPS
//   • Tries to play with sound. Where autoplay with sound is refused (Safari,
//     and possibly the iOS web view), it plays muted with a "Tap for sound"
//     button; the speaker button switches sound at any time
//   • prefers-reduced-motion: nothing plays until the person taps play, and
//     the button is there from the start
//   • if the video cannot load (offline), "Get started" is right there
//   • Escape closes at any moment
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import timeline from "./onboarding-chapters.json";

// The navy the encoded video actually renders as (its source is #08111F;
// BT.709 rounding lands it here), so the bars above and below it match.
const VIDEO_BG = "#06101D";
const base = import.meta.env.BASE_URL.replace(/\/$/, "");
const VIDEO_SRC = `${base}/onboarding/novara-onboarding.mp4`;
const POSTER_SRC = `${base}/onboarding/novara-onboarding-poster.jpg`;

/** Seconds of playback before the skip button shows. */
const SKIP_AFTER_SEC = 1;

/** Within this many seconds of a step's start, "back" goes to the step before
 *  it rather than restarting this one (how Stories and most players behave). */
const RESTART_GRACE_SEC = 1.5;

/** Step starts, then the closing card, so "next" from step 8 reaches the end. */
const STOPS = [...timeline.chapters.map((c) => c.start), timeline.outro];

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
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [playedSec, setPlayedSec] = useState(0);

  const close = useCallback(() => onComplete(), [onComplete]);

  const seekTo = useCallback((sec: number) => {
    const video = videoRef.current;
    if (!video) return;
    const duration = video.duration || timeline.duration;
    const target = Math.max(0, Math.min(sec, duration - 0.05));
    video.currentTime = target;
    setProgress(target / duration);
    if (target < duration - 0.3) setEnded(false);
    if (video.paused && !reducedMotion) video.play().catch(() => setPlaying(false));
  }, [reducedMotion]);

  const nextStep = useCallback(() => {
    const now = videoRef.current?.currentTime ?? 0;
    // A small margin so a tap just after landing on a step moves on from it,
    // without skipping a step that is about to start.
    const stop = STOPS.find((s) => s > now + 0.1);
    if (stop !== undefined) seekTo(stop);
  }, [seekTo]);

  const prevStep = useCallback(() => {
    const now = videoRef.current?.currentTime ?? 0;
    const passed = STOPS.filter((s) => s <= now + 0.05);
    const current = passed[passed.length - 1];
    if (current === undefined) return seekTo(0);
    if (now - current > RESTART_GRACE_SEC) return seekTo(current);
    seekTo(passed[passed.length - 2] ?? 0);
  }, [seekTo]);

  // Start with sound if the browser allows it, otherwise muted.
  const start = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    try {
      await video.play();
      setMuted(false);
    } catch {
      video.muted = true;
      setMuted(true);
      await video.play().catch(() => setPlaying(false));
    }
  }, []);

  useEffect(() => {
    if (!reducedMotion) void start();
  }, [reducedMotion, start]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      if (ended) video.currentTime = 0;
      setEnded(false);
      video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [ended]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") nextStep();
      else if (e.key === "ArrowLeft") prevStep();
      else if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, nextStep, prevStep, togglePlay]);

  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (video.paused && !ended) video.play().catch(() => setPlaying(false));
  };

  const replay = () => seekTo(0);

  const showButton = failed || ended || playedSec >= SKIP_AFTER_SEC || (reducedMotion && !playing && playedSec === 0);

  const overlay = (
    <div
      className="fixed inset-0 z-[90] text-white"
      style={{ backgroundColor: VIDEO_BG }}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Novara"
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col pt-safe pb-safe">
        <div className="flex h-11 shrink-0 items-center px-4">
          {!failed && (
            <button
              type="button"
              onClick={toggleSound}
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={muted ? "Turn sound on" : "Turn sound off"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              {muted && "Tap for sound"}
            </button>
          )}
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
            <>
              <video
                ref={videoRef}
                className="h-full w-full object-contain"
                src={VIDEO_SRC}
                poster={POSTER_SRC}
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
                  setPlayedSec((s) => Math.max(s, v.currentTime));
                }}
                onError={() => setFailed(true)}
              />

              {/* Reel-style tap zones: back, pause, next. */}
              <div className="absolute inset-0 flex">
                <button type="button" onClick={prevStep} className="h-full w-[30%]" aria-label="Previous step" />
                <button
                  type="button"
                  onClick={togglePlay}
                  className="group relative h-full flex-1"
                  aria-label={playing ? "Pause video" : "Play video"}
                >
                  {playing && (
                    <span className="absolute left-1/2 top-3 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-black/30 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      <Pause className="h-4 w-4 fill-current" />
                    </span>
                  )}
                </button>
                <button type="button" onClick={nextStep} className="h-full w-[30%]" aria-label="Next step" />
              </div>

              {!playing && !ended && (
                <span className="pointer-events-none absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#08111F] shadow-lg">
                  <Play className="ml-1 h-7 w-7 fill-current" />
                </span>
              )}

            </>
          )}
        </div>

        {/* Fixed height, so the video doesn't jump when the button appears. */}
        <div className="h-[100px] shrink-0 px-6 pb-1 pt-2">
          {!failed && <Scrubber progress={progress} onSeek={(f) => seekTo(f * (videoRef.current?.duration || timeline.duration))} />}
          {showButton && (
            <div className="flex gap-3 animate-in fade-in duration-500">
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
              {ended || failed ? (
                <Button
                  onClick={close}
                  className="h-auto flex-1 gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition-transform duration-150 active:scale-[0.985]"
                >
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={close}
                  className="h-auto flex-1 gap-2 rounded-2xl border-white/25 bg-white/5 px-4 py-3.5 text-[15px] font-semibold text-white/85 hover:bg-white/10 hover:text-white"
                >
                  Skip the demo. Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Portalled so no ancestor stacking context can put the bottom nav over it.
  return typeof document === "undefined" ? overlay : createPortal(overlay, document.body);
}

/** The progress bar, draggable like a video player's, with a tick at each step. */
function Scrubber({ progress, onSeek }: { progress: number; onSeek: (fraction: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const seekFrom = (e: ReactPointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const box = track.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)));
  };

  return (
    <div
      className="relative mb-3 flex h-6 cursor-pointer touch-none items-center"
      role="slider"
      aria-label="Video position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        seekFrom(e);
      }}
      onPointerMove={(e) => dragging && seekFrom(e)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      <div ref={trackRef} className={`relative w-full overflow-visible rounded-full bg-white/15 transition-[height] ${dragging ? "h-1.5" : "h-1"}`}>
        <div className="absolute inset-y-0 left-0 rounded-full bg-white/80" style={{ width: `${progress * 100}%` }} />
        {timeline.chapters.slice(1).map((c) => (
          <span
            key={c.step}
            className="absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded-full bg-white/45"
            style={{ left: `${(c.start / timeline.duration) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        <span
          className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-[width,height] ${dragging ? "h-4 w-4" : "h-3 w-3"}`}
          style={{ left: `${progress * 100}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
