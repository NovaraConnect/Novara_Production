import { useState } from "react";
import { Link } from "wouter";
import { computeHealthScore, computeStatus, getDaysPastDue, formatDate, statusBorderColor } from "@/lib/utils";
import { BottomNav } from "@/components/BottomNav";
import { ContactCard } from "@/components/ContactCard";
import { OnboardingTour } from "@/components/OnboardingTour";
import { Plus, Loader2, X, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useContacts } from "@/hooks/useContacts";
import { useSettings } from "@/hooks/useSettings";
import { useUser } from "@clerk/react";

export default function Dashboard() {
  const { contacts, isLoading } = useContacts();
  const { settings, isLoading: settingsLoading, updateSettings } = useSettings();
  const { user } = useUser();
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    localStorage.getItem("novara_hs_banner_v1") === "true"
  );
  const dismissBanner = () => {
    localStorage.setItem("novara_hs_banner_v1", "true");
    setBannerDismissed(true);
  };
  const connectedContacts = contacts.filter(c => c.connectionStatus === "connected");
  const pipelineCount = contacts.filter(c => c.connectionStatus === "pipeline").length;
  const healthScore = computeHealthScore(connectedContacts);
  const stats = connectedContacts.reduce(
    (acc, contact) => {
      const status = computeStatus(contact);
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    },
    { Warm: 0, Cooling: 0, Cold: 0, Dormant: 0 } as Record<string, number>
  );
  const overdueContacts = connectedContacts
    .filter(c => getDaysPastDue(c) > 0)
    .sort((a, b) => {
      const priorityOrder: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
      const aPriority = priorityOrder[a.currentPriority ?? a.importance] ?? 1;
      const bPriority = priorityOrder[b.currentPriority ?? b.importance] ?? 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return getDaysPastDue(b) - getDaysPastDue(a);
    });
  const warmContacts = connectedContacts.filter(c => computeStatus(c) === "Warm");
  const maxOverdueDays = overdueContacts.length > 0
    ? Math.max(...overdueContacts.map(c => getDaysPastDue(c)))
    : 0;
  if (isLoading || settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background pb-nav">
      <div className="px-4 pt-safe-header pb-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {user?.firstName ? `Hi, ${user.firstName}` : "Dashboard"}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your network at a glance</p>
          </div>
          <Link href="/add">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </Link>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-muted-foreground">Network Health</span>
            {!bannerDismissed && (
              <button onClick={dismissBanner} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-4xl font-bold text-foreground">{healthScore}</span>
            <span className="text-muted-foreground text-sm mb-1">/100</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-emerald-50 rounded-lg p-2">
              <div className="text-lg font-bold text-emerald-600">{stats.Warm}</div>
              <div className="text-xs text-emerald-600">Warm</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-2">
              <div className="text-lg font-bold text-yellow-600">{stats.Cooling}</div>
              <div className="text-xs text-yellow-600">Cooling</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-2">
              <div className="text-lg font-bold text-orange-600">{stats.Cold}</div>
              <div className="text-xs text-orange-600">Cold</div>
            </div>
            <div className="bg-red-50 rounded-lg p-2">
              <div className="text-lg font-bold text-red-600">{stats.Dormant || 0}</div>
              <div className="text-xs text-red-600">Dormant</div>
            </div>
          </div>
        </div>
        {overdueContacts.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-4 w-4 text-orange-500" />
              <h2 className="text-sm font-semibold text-foreground">Overdue Follow-ups</h2>
            </div>
            <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-2 mb-3 flex items-center justify-between">
              <span className="text-xs text-orange-700 font-medium">{overdueContacts.length} follow-up{overdueContacts.length > 1 ? "s" : ""} overdue</span>
              <span className="text-xs text-orange-600">Oldest: {maxOverdueDays} day{maxOverdueDays !== 1 ? "s" : ""}</span>
            </div>
            <div className="space-y-3">
              {overdueContacts.map(contact => {
                const daysPast = getDaysPastDue(contact);
                const status = computeStatus(contact);
                return (
                  <div key={contact.id} className={`border-l-4 ${statusBorderColor(status)} rounded-r-xl overflow-hidden`}>
                    <ContactCard contact={contact} showOverdueBadge overdaysPast={daysPast} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {warmContacts.length > 0 && (
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
              On Track
            </h2>
            <div className="space-y-3">
              {warmContacts.map(contact => (
                <ContactCard key={contact.id} contact={contact} />
              ))}
            </div>
          </div>
        )}
        {connectedContacts.length === 0 && (
          <div className="text-center py-16">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No contacts yet</h3>
            <p className="text-sm text-muted-foreground mb-6">Add your first contact to start tracking your network health.</p>
            <Link href="/add">
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add your first contact
              </Button>
            </Link>
          </div>
        )}
        {pipelineCount > 0 && (
          <Link href="/contacts">
            <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{pipelineCount} contact{pipelineCount > 1 ? "s" : ""} in pipeline</span>
              <span className="text-xs text-primary font-medium">View all</span>
            </div>
          </Link>
        )}
      </div>
      {settings && !settings.hasSeenTutorial && (
        <OnboardingTour onComplete={() => updateSettings.mutate({ hasSeenTutorial: true })} />
      )}
      <BottomNav />
    </div>
  );
}
