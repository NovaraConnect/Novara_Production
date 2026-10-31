// ============================================================================
// The first-run introduction, as a ROUTE rather than an overlay.
//
// WHY A ROUTE AND NOT A MODAL OVER THE DASHBOARD
// ----------------------------------------------
// Inside the iOS shell the bottom tab bar is a native UITabBar living OUTSIDE
// the web view. No CSS can cover it — a full-screen web overlay still had the
// native bar sitting under it, which is exactly what made the onboarding feel
// like a card on top of the app instead of its own moment.
//
// The shell already solves this: NovaraRouter.target(forPath:) returns
// .outsideShell for any path that is not one of the four sections, and
// NovaraRootViewController.setShellVisible(false) then hides the tab bar AND
// extends the web view to the bottom of the screen. So a route the shell does
// not recognise — this one — gets the whole display, natively, with NO change
// to the binary. Build 8 renders this full-screen as shipped.
//
// Completion still lives in exactly one place, user_settings.has_seen_tutorial,
// so nothing about new-vs-existing user behaviour changes:
//   • Dashboard redirects here when that flag is false
//   • Settings "Replay Tutorial" clears the flag and sends the user here
//   • finishing (or skipping) saves the flag, and only then returns to the
//     Dashboard. If the save fails we stay here and show a retryable error;
//     navigating first let the Dashboard read the stale `false` and send the
//     user straight back into this tour.
// ============================================================================
import { useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import { OnboardingTour } from "@/components/OnboardingTour";
import { OnboardingVideo } from "@/components/OnboardingVideo";
import { useSettings } from "@/hooks/useSettings";

// VIDEO ROLLOUT
// Everyone gets the onboarding video: new accounts and Settings > Replay
// Tutorial (?replay=1). Set this to false to give new accounts the card tour
// again (Replay keeps the video). Once the video has settled in,
// OnboardingTour/OnboardingScreens and this switch can be deleted.
const VIDEO_FOR_NEW_USERS = true;

export default function Welcome() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const showVideo = VIDEO_FOR_NEW_USERS || new URLSearchParams(search).has("replay");
  const { settings, updateSettings } = useSettings();
  // Guards against a second Continue/Skip/Escape while the save is in flight.
  const finishing = useRef(false);

  // Every way out of the tour or the video (Continue/Get started, Skip,
  // Escape) reaches this through onComplete.
  const finish = async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      if (settings && !settings.hasSeenTutorial) {
        // mutateAsync resolves after the mutation's onSuccess has written the
        // server's hasSeenTutorial: true into the ["settings"] cache, so the
        // Dashboard gate sees the saved value when we navigate below.
        await updateSettings.mutateAsync({ hasSeenTutorial: true });
      }
    } catch {
      toast.error("Couldn't save your progress. Check your connection and try again.");
      return;
    } finally {
      finishing.current = false;
    }
    setLocation("/dashboard");
  };

  return showVideo ? <OnboardingVideo onComplete={finish} /> : <OnboardingTour onComplete={finish} />;
}
