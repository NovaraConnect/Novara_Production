import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { formatDate, computeStatus } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import {
  ArrowLeft,
  Linkedin,
  MapPin,
  AlignLeft,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  Newspaper,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DEMO_CONTACTS, DEMO_SETTINGS, TESLA_NEWS } from "@/demo/demoData";
import { DemoBanner } from "@/demo/DemoBanner";
import { DemoWalkthrough } from "@/demo/DemoWalkthrough";
import { isInMaintenanceMode, formatCadenceLabel } from "@/lib/cadence";

export default function DemoContactDetail() {
  const [, params] = useRoute("/demo/contacts/:id");
  const [, setLocation] = useLocation();
  const [contacted, setContacted] = useState(false);
  const [contacting, setContacting] = useState(false);

  const contact = DEMO_CONTACTS.find((c) => c.id === params?.id) ?? DEMO_CONTACTS[0];
  const settings = DEMO_SETTINGS;

  const maintenance = isInMaintenanceMode(contact, settings.autoDowngradeAfterMonths);
  const cadenceLabel = formatCadenceLabel(contact, settings);

  const isSarah = contact.id === "demo-sarah";
  const news = isSarah ? TESLA_NEWS : [];

  const handleMarkContacted = async () => {
    setContacting(true);
    await new Promise((r) => setTimeout(r, 700));
    setContacting(false);
    setContacted(true);
    toast.success("Interaction recorded! (Demo — not saved to your account)");
  };

  return (
    <div className="mobile-container pb-12 flex flex-col min-h-[100dvh] bg-background">
      <DemoBanner />

      <header className="sticky top-[42px] z-40 bg-background/95 backdrop-blur-md pt-4 pb-4 px-4 flex items-center justify-between border-b border-border/30">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/demo")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-xs text-muted-foreground font-medium">Demo contact</span>
        <div className="w-10" />
      </header>

      <main className="flex-1 px-6 py-4">
        {/* Profile header */}
        <div id="demo-profile" className="mb-8">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground mb-1 leading-tight">
            {contact.firstName} {contact.lastName}
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            {contact.role ? `${contact.role} @ ` : ""}
            {contact.company}
          </p>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <StatusBadge status={computeStatus(contact)} />
            <ImportanceBadge importance={contact.importance} />
            {contact.connectionStatus === "pipeline" && (
              <span className="inline-flex items-center gap-1 bg-violet-50 text-violet-700 border border-violet-200 rounded-full text-[10px] font-semibold px-2.5 py-1">
                Pipeline
              </span>
            )}
            {maintenance && (
              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-semibold px-2.5 py-1">
                <RefreshCw className="w-2.5 h-2.5" />
                Maintenance cadence
              </span>
            )}
          </div>
        </div>

        {/* Primary action */}
        <Button
          id="demo-mark-contacted"
          onClick={contacted ? undefined : handleMarkContacted}
          disabled={contacting}
          className={`w-full h-14 rounded-xl text-base font-semibold shadow-md active:scale-[0.98] transition-all mb-4 ${
            contacted
              ? "bg-emerald-600 hover:bg-emerald-600 text-white"
              : ""
          }`}
        >
          {contacting ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-5 h-5 mr-2" />
          )}
          {contacted ? "Contacted! ✓" : "Mark as Contacted Today"}
        </Button>

        <div className="space-y-4">
          {/* Relationship details */}
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Relationship Details
            </h3>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-foreground/70" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Follow Up</p>
                <p className="text-sm font-semibold text-foreground">
                  {formatDate(contact.nextFollowUpDate)}
                  {contact.id === "demo-sarah" && (
                    <span className="ml-2 text-xs text-amber-600 font-semibold">Due today</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-foreground/70" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Interaction</p>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(contact.lastInteractionDate)}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-foreground/70" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">First Contact</p>
                <p className="text-sm font-medium text-foreground">
                  {formatDate(contact.firstContactDate)}
                </p>
              </div>
            </div>

            <div className="border-t border-border/40 pt-3 grid grid-cols-2 gap-3">
              <div className="bg-background/60 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">First reach-out</p>
                <p className="text-sm font-semibold text-foreground">
                  {contact.initialFollowUpDays === 1
                    ? "1 day"
                    : `${contact.initialFollowUpDays} days`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">after meeting</p>
              </div>
              <div className="bg-background/60 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Current cadence</p>
                <p
                  className={`text-sm font-semibold ${
                    maintenance ? "text-amber-600" : "text-foreground"
                  }`}
                >
                  {cadenceLabel}
                </p>
                {maintenance && (
                  <p className="text-xs text-amber-500 mt-0.5">moved to maintenance</p>
                )}
              </div>
            </div>

            {contact.metAt && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-foreground/70" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Met At</p>
                  <p className="text-sm font-medium text-foreground">{contact.metAt}</p>
                </div>
              </div>
            )}
          </div>

          {/* Conversation Starters */}
          <div id="demo-news" className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Conversation Starters
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Use recent {contact.company} news to reconnect naturally.
            </p>

            {news.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No recent company news found.
              </p>
            ) : (
              <ul className="space-y-3">
                {news.map((h, i) => (
                  <li key={i} className="group">
                    <a
                      href={h.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 rounded-xl p-3 bg-background/60 hover:bg-primary/5 border border-transparent hover:border-primary/15 transition-all"
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <ExternalLink className="w-2.5 h-2.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          {h.title}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {h.source} ·{" "}
                          {new Date(h.publishedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-4">
              Updates every 6 hours · Google News
            </p>
          </div>

          {/* Notes & Links */}
          {(contact.notes || contact.linkedinUrl) && (
            <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Notes & Links
              </h3>
              {contact.linkedinUrl && (
                <a
                  href={contact.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm font-medium text-primary hover:underline"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Linkedin className="w-4 h-4 text-primary" />
                  </div>
                  View LinkedIn Profile
                </a>
              )}
              {contact.notes && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0 mt-0.5">
                    <AlignLeft className="w-4 h-4 text-foreground/70" />
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                    {contact.notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* CTA to sign up */}
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 text-center space-y-3">
            <p className="text-sm font-semibold text-foreground">
              Like what you see?
            </p>
            <p className="text-xs text-muted-foreground">
              Create a free account and add your real contacts in under 2 minutes.
            </p>
            <a
              href="/sign-up"
              className="inline-flex items-center justify-center w-full h-11 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
            >
              Get started — it's free
            </a>
          </div>
        </div>
      </main>

      <DemoWalkthrough page="contact" />
    </div>
  );
}
