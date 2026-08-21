import { useState } from "react";
import { useLocation } from "wouter";
import {
  UserPlus, Clock, Activity, CheckCircle2, Newspaper,
  Sparkles, X, ChevronRight, ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    icon: UserPlus,
    title: "Add your first contact",
    description:
      "Tap + to add anyone worth keeping in touch with. Include how you met, their importance, and a follow-up cadence.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Clock,
    title: "Set a follow-up cadence",
    description:
      "Choose how often to reconnect — weekly, monthly, or quarterly. Novara schedules reminders automatically so no relationship goes cold.",
    color: "bg-violet-50 text-violet-600",
  },
  {
    icon: Activity,
    title: "Track your Network Health",
    description:
      "Your score (0–100) shows how well you're maintaining key relationships. Keep it above 70 to stay connected with everyone who matters.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: CheckCircle2,
    title: "Mark contacts as reached out",
    description:
      "One tap resets the follow-up clock. Novara flags contacts as Warm, Cooling, or Cold — so you always know who needs attention.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: Newspaper,
    title: "Get conversation starters",
    description:
      "Open any contact to see live news about their company. Walk into every conversation with something relevant to say.",
    color: "bg-rose-50 text-rose-600",
  },
];

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const progressWidth = ((step + 1) / STEPS.length) * 100;
  const Icon = current.icon;

  const handleNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setStep((s) => s + 1);
  };

  const handleFinish = () => {
    onComplete();
    setLocation("/add");
  };

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 px-3 pb-1">
      <div className="bg-white border border-border/60 rounded-2xl shadow-xl overflow-hidden max-w-md mx-auto">
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progressWidth}%` }}
          />
        </div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </span>
            </div>
            <button
              onClick={onComplete}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Skip tour"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "bg-primary w-4"
                    : i < step
                    ? "bg-primary/40 w-1.5"
                    : "bg-gray-200 w-1.5"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${current.color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-foreground">{current.title}</h3>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed mb-4">
            {current.description}
          </p>

          <div className="flex items-center justify-between">
            <button
              onClick={onComplete}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              Skip tour
            </button>
            {isLast ? (
              <div className="flex gap-2">
                <button
                  onClick={onComplete}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-xl border border-border"
                >
                  Done
                </button>
                <button
                  onClick={handleFinish}
                  className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-xl hover:bg-primary/90 active:scale-[0.97] transition-all"
                >
                  Add first contact
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-4 py-2 rounded-xl hover:bg-primary/90 active:scale-[0.97] transition-all"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
