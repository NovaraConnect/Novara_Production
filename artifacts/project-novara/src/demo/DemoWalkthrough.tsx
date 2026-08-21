import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronRight, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  {
    step: 1,
    page: "dashboard" as const,
    title: "View your network health",
    description:
      "Your Network Health Score reflects how well you're maintaining key relationships. 66/100 means you're doing well — but 2 contacts are cooling.",
    targetId: "demo-health",
  },
  {
    step: 2,
    page: "dashboard" as const,
    title: "See who needs follow-up",
    description:
      "Novara automatically flags contacts due for follow-up. Sarah is due today, Marc and Priya are already overdue. Tap Next to open Sarah's profile.",
    targetId: "demo-attention",
    nextNavigates: true,
  },
  {
    step: 3,
    page: "contact" as const,
    title: "Open a contact",
    description:
      "You're on Sarah Jones' profile. She's Warm — you last reached out 25 days ago. Her follow-up is due today.",
    targetId: "demo-profile",
  },
  {
    step: 4,
    page: "contact" as const,
    title: "See recent company news",
    description:
      "Novara pulls live Tesla headlines — so you always have something meaningful to say when you reach out to Sarah.",
    targetId: "demo-news",
  },
  {
    step: 5,
    page: "contact" as const,
    title: "Mark contact as reached out to",
    description:
      "One tap resets the follow-up clock. Novara will remind you to reach out to Sarah again in 30 days.",
    targetId: "demo-mark-contacted",
    isLast: true,
  },
];

const STORAGE_KEY = "novara_demo_step";

function getStoredStep(): number {
  const s = sessionStorage.getItem(STORAGE_KEY);
  return s ? parseInt(s) : 1;
}

function storeStep(n: number) {
  sessionStorage.setItem(STORAGE_KEY, String(n));
}

function resetStep() {
  sessionStorage.removeItem(STORAGE_KEY);
}

interface DemoWalkthroughProps {
  page: "dashboard" | "contact";
}

export function DemoWalkthrough({ page }: DemoWalkthroughProps) {
  const [step, setStepState] = useState(() => {
    const stored = getStoredStep();
    // If navigating directly to contact page, jump past dashboard steps
    const adjusted = page === "contact" && stored < 3 ? 3 : stored;
    if (adjusted !== stored) storeStep(adjusted);
    return adjusted;
  });
  const [dismissed, setDismissed] = useState(false);
  const [, setLocation] = useLocation();

  const setStep = useCallback((n: number) => {
    storeStep(n);
    setStepState(n);
  }, []);

  const currentStepDef = STEPS.find((s) => s.step === step && s.page === page);

  useEffect(() => {
    if (!currentStepDef?.targetId) return;
    const el = document.getElementById(currentStepDef.targetId);
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }
  }, [currentStepDef]);

  const handleNext = () => {
    const current = STEPS.find((s) => s.step === step);
    if (!current) return;

    if (current.isLast) {
      resetStep();
      toast.success("Tour complete! Ready to try Novara with your real contacts?", {
        duration: 5000,
        action: {
          label: "Get started free",
          onClick: () => setLocation("/sign-up"),
        },
      });
      setDismissed(true);
      return;
    }

    if (current.nextNavigates) {
      setStep(step + 1);
      setLocation("/demo/contacts/demo-sarah");
      return;
    }

    setStep(step + 1);
  };

  const handleSkip = () => {
    resetStep();
    setDismissed(true);
  };

  if (dismissed || !currentStepDef) return null;

  const totalSteps = STEPS.length;
  const progressWidth = (step / totalSteps) * 100;

  return (
    <div className="fixed bottom-20 left-0 right-0 z-40 px-3 pb-1">
      <div className="bg-white border border-border/60 rounded-2xl shadow-xl overflow-hidden max-w-md mx-auto">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        <div className="p-4">
          {/* Step indicator + skip */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Step {step} of {totalSteps}
              </span>
            </div>
            <button
              onClick={handleSkip}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Skip tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Dot indicators */}
          <div className="flex gap-1.5 mb-3">
            {STEPS.map((s) => (
              <div
                key={s.step}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s.step === step
                    ? "bg-primary w-4"
                    : s.step < step
                    ? "bg-primary/40 w-1.5"
                    : "bg-gray-200 w-1.5"
                }`}
              />
            ))}
          </div>

          <h3 className="text-sm font-bold text-foreground mb-1">
            {currentStepDef.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            {currentStepDef.description}
          </p>

          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Skip tour
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-xl hover:bg-primary/90 active:scale-[0.97] transition-all"
            >
              {currentStepDef.isLast ? "Finish tour" : currentStepDef.nextNavigates ? "Open Sarah's profile" : "Next"}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
