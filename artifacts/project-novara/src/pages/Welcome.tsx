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
//   • finishing (or skipping) sets it true and returns to the Dashboard
// ============================================================================
import { useLocation } from "wouter";
import { OnboardingTour } from "@/components/OnboardingTour";
import { useSettings } from "@/hooks/useSettings";

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { settings, updateSettings } = useSettings();

  const finish = () => {
    // Navigate first so the exit is immediate — the flag write is not
    // something the user should wait behind, and it is idempotent.
    setLocation("/dashboard");
    if (settings && !settings.hasSeenTutorial) {
      updateSettings.mutate({ hasSeenTutorial: true });
    }
  };

  return <OnboardingTour onComplete={finish} />;
}
