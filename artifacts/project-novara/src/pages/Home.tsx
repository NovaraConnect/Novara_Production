import { Link } from "wouter";
import { Users, RefreshCw, Newspaper, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="mobile-container flex flex-col min-h-[100dvh] bg-background">
      {/* Header */}
      <header className="pt-12 pb-6 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
            <span className="font-serif text-base font-bold text-primary">N</span>
          </div>
          <span className="font-serif text-lg font-bold text-foreground">Project Novara</span>
        </div>
        <Link href="/sign-in">
          <Button variant="ghost" size="sm" className="text-sm font-medium">Sign in</Button>
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 px-6 flex flex-col items-center justify-center text-center gap-6 py-10">
        <div className="w-24 h-24 bg-primary/10 rounded-3xl mx-auto flex items-center justify-center border border-primary/20 shadow-sm mb-2">
          <span className="font-serif text-5xl font-bold text-primary">N</span>
        </div>

        <div className="space-y-3 max-w-[320px]">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground leading-tight">
            Never let an important relationship go cold.
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Your personal relationship CRM for ambitious professionals. Stay in touch with the people who matter.
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-[320px] mt-2">
          <Link href="/sign-up">
            <Button className="w-full h-12 rounded-xl text-base font-semibold shadow-md">
              Get started — it's free
            </Button>
          </Link>
          <Link href="/try">
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl text-base font-semibold border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 gap-2"
            >
              <span>▶</span>
              Try Demo — see how it works
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="ghost" className="w-full h-10 rounded-xl text-sm font-medium text-muted-foreground">
              Sign in to your account
            </Button>
          </Link>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 gap-3 w-full max-w-[360px] mt-6">
          {[
            { icon: Users, label: "Track your contacts", desc: "Never forget who to reach out to" },
            { icon: RefreshCw, label: "Smart cadence", desc: "Auto-downgrade after 6 months" },
            { icon: Newspaper, label: "Live news", desc: "Conversation starters via Google News" },
            { icon: Shield, label: "Private & secure", desc: "Your data, your contacts" },
          ].map((f) => (
            <div key={f.label} className="bg-card border border-border/40 rounded-2xl p-4 text-left shadow-sm">
              <f.icon className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-semibold text-foreground leading-tight">{f.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-6 py-6 text-center">
        <p className="text-xs text-muted-foreground">
          Cloud-synced · Sign in from any device · Your data stays private
        </p>
      </footer>
    </div>
  );
}
