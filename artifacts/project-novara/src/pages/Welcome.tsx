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
import { useLocation } from "wouter";
import { toast } from "sonner";
import { OnboardingVideo } from "@/components/OnboardingVideo";
import { useSettings } from "@/hooks/useSettings";

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { settings, updateSettings } = useSettings();
  // Guards against a second Continue/Skip/Escape while the save is in flight.
  const finishing = useRef(false);

  // Get started, Skip and Escape all reach this through OnboardingVideo's onComplete.
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

  return <OnboardingVideo onComplete={finish} />;
}
