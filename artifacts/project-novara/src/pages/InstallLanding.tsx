import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { INSTALL_PROMPT_SEEN_KEY } from "@/lib/installPrompt";

export default function InstallLanding() {
  const [, setLocation] = useLocation();

  function handleAddToHomeScreen() {
    localStorage.setItem(INSTALL_PROMPT_SEEN_KEY, "true");
    setLocation("/install");
  }

  function handleContinueInBrowser() {
    localStorage.setItem(INSTALL_PROMPT_SEEN_KEY, "true");
    setLocation("/sign-in");
  }

  return (
    <div className="mobile-container flex flex-col min-h-[100dvh] bg-background items-center justify-center text-center px-6 gap-8">
      <div className="w-20 h-20 rounded-3xl overflow-hidden shadow-lg border border-primary/20">
        <img src="/icon-512.png" alt="Novara" className="w-full h-full object-cover" />
      </div>

      <div className="space-y-3 max-w-[320px]">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground leading-tight">
          Get the full Novara experience
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Add Novara to your home screen for a fast, full-screen, app-like experience — or continue straight in your
          browser.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-[320px]">
        <Button
          onClick={handleAddToHomeScreen}
          className="w-full h-12 rounded-xl text-base font-semibold shadow-md"
          data-testid="button-add-to-home-screen"
        >
          Add to Home Screen
        </Button>
        <Button
          variant="ghost"
          onClick={handleContinueInBrowser}
          className="w-full h-10 rounded-xl text-sm font-medium text-muted-foreground"
          data-testid="button-continue-in-browser"
        >
          Continue in Browser
        </Button>
      </div>
    </div>
  );
}
