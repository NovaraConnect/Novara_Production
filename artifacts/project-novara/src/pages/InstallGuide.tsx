import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Share2, MoreVertical, Plus, CheckCircle2, Smartphone, Lightbulb } from "lucide-react";

type Tab = "iphone" | "android";

const iphoneSteps = [
  {
    icon: <Share2 size={22} className="text-primary" />,
    title: "Tap the Share button",
    desc: "In Safari, tap the share icon at the bottom of the screen (the box with an arrow pointing up).",
  },
  {
    icon: <Plus size={22} className="text-primary" />,
    title: 'Tap "Add to Home Screen"',
    desc: "Scroll down in the share sheet and tap \"Add to Home Screen\".",
  },
  {
    icon: <CheckCircle2 size={22} className="text-primary" />,
    title: 'Tap "Add"',
    desc: "Confirm the name (Novara) and tap \"Add\" in the top-right corner. The app icon will appear on your home screen.",
  },
];

const androidSteps = [
  {
    icon: <MoreVertical size={22} className="text-primary" />,
    title: "Open the browser menu",
    desc: "In Chrome, tap the three-dot menu (⋮) in the top-right corner of the browser.",
  },
  {
    icon: <Plus size={22} className="text-primary" />,
    title: '"Add to Home Screen" or "Install app"',
    desc: 'Tap "Add to Home Screen" or "Install app" from the menu. You may see a banner at the bottom of the screen instead.',
  },
  {
    icon: <CheckCircle2 size={22} className="text-primary" />,
    title: "Tap Install",
    desc: "Confirm by tapping \"Install\". Novara will appear as an app on your home screen and app drawer.",
  },
];

export default function InstallGuide() {
  const [tab, setTab] = useState<Tab>("iphone");
  const [, setLocation] = useLocation();

  const steps = tab === "iphone" ? iphoneSteps : androidSteps;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 bg-background/95 backdrop-blur-md border-b border-border/60 px-4 pt-safe pb-3 flex items-center gap-3 z-10">
        <button
          onClick={() => setLocation(-1 as unknown as string)}
          className="p-2 -ml-2 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold text-foreground">Install Novara</h1>
      </header>

      <div className="flex-1 px-4 py-6 max-w-md mx-auto w-full">
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 rounded-[22px] overflow-hidden shadow-lg mb-4">
            <img src="/icon-512.png" alt="Novara" className="w-full h-full object-cover" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-foreground mb-2">Add to Home Screen</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Install Novara on your phone for a full-screen, app-like experience — no App Store needed.
          </p>
        </div>

        <div className="flex rounded-xl bg-subtle p-1 mb-6">
          <button
            onClick={() => setTab("iphone")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === "iphone"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone size={16} />
            iPhone
          </button>
          <button
            onClick={() => setTab("android")}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === "android"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Smartphone size={16} />
            Android
          </button>
        </div>

        {tab === "iphone" && (
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 mb-5 flex items-start gap-2">
            <Lightbulb size={14} className="text-primary shrink-0 mt-0.5" />
            <p className="text-primary/90 text-xs leading-relaxed">
              <strong>Open this page in Safari</strong> — the Share button isn't available in other browsers on iPhone.
            </p>
          </div>
        )}

        <ol className="space-y-4 mb-8">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-4 surface-card p-4">
              <div className="flex-shrink-0 flex flex-col items-center gap-1">
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary text-sm font-bold">
                  {i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 bg-border min-h-[16px]" />
                )}
              </div>
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-center gap-2 mb-1">
                  {step.icon}
                  <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="bg-primary/[0.07] rounded-2xl p-4 border border-primary/20 mb-6">
          <p className="text-xs text-primary font-semibold mb-1">Why install?</p>
          <ul className="space-y-1">
            {[
              "Opens full-screen, no browser chrome",
              "Faster than opening a browser tab",
              "Works offline once loaded",
              "Feels like a native app",
            ].map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 size={12} className="text-primary flex-shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => setLocation("/dashboard")}
          className="w-full bg-primary text-primary-foreground font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors"
        >
          Got it — go to the app
        </button>
      </div>
    </div>
  );
}
