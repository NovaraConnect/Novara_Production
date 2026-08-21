import { useRoute, useLocation, Link } from "wouter";
import { useState, useEffect } from "react";
import { formatDate, computeStatus } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";
import { ImportanceBadge } from "@/components/ImportanceBadge";
import {
  ArrowLeft, Edit2, Trash2, Linkedin, MapPin, AlignLeft, CalendarDays,
  CheckCircle2, Bell, CalendarPlus, ExternalLink, Newspaper, Loader2, RefreshCw,
  Mail, Phone, TrendingUp, TrendingDown, Briefcase, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar";
import { requestNotificationPermission, sendNotification, isDigestEnabled, setDigestEnabled, scheduleDigestCheck } from "@/lib/webNotifications";
import { useCompanyNews } from "@/hooks/useCompanyNews";
import { useContacts } from "@/hooks/useContacts";
import { useSettings } from "@/hooks/useSettings";
import { isInMaintenanceMode, formatCadenceLabel } from "@/lib/cadence";

export default function ContactDetail() {
  const [match, params] = useRoute("/contacts/:id");
  const [, setLocation] = useLocation();
  const { contacts, markContacted, removeContact } = useContacts();
  const { settings } = useSettings();
  const [notifEnabled, setNotifEnabled] = useState(false);

  const contact = match && params?.id ? contacts.find(c => c.id === params.id) ?? null : null;

  useEffect(() => {
    setNotifEnabled(Notification?.permission === "granted");
  }, []);

  useEffect(() => {
    if (!contact && contacts.length > 0) {
      setLocation("/contacts");
    }
  }, [contact, contacts.length, setLocation]);

  const { headlines, status: newsStatus } = useCompanyNews(contact?.company, contact?.industry, contact?.role);

  if (!contact && contacts.length > 0) {
    return null;
  }

  if (!contact) {
    return (
      <div className="mobile-container flex items-center justify-center min-h-[100dvh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const maintenance = isInMaintenanceMode(contact, settings.autoDowngradeAfterMonths);
  const cadenceLabel = formatCadenceLabel(contact, settings);

  const basePriority = contact.basePriority ?? contact.importance;
  const currentPriority = contact.currentPriority ?? basePriority;
  const isPrioritized = currentPriority !== basePriority;
  const isUp = isPrioritized && (
    (currentPriority === "High" && basePriority !== "High") ||
    (currentPriority === "Medium" && basePriority === "Low")
  );
  const isDown = isPrioritized && !isUp;

  const handleMarkContacted = async () => {
    try {
      await markContacted.mutateAsync(contact.id);
      toast.success("Interaction recorded!");
    } catch {
      toast.error("Failed to record interaction.");
    }
  };

  const handleDelete = async () => {
    try {
      await removeContact.mutateAsync(contact.id);
      toast.success("Contact deleted");
      setLocation("/contacts");
    } catch {
      toast.error("Failed to delete contact.");
    }
  };

  const handleDownloadIcs = () => {
    if (!contact.nextFollowUpDate) { toast.error("No follow-up date set"); return; }
    downloadIcs(`${contact.firstName} ${contact.lastName}`, new Date(contact.nextFollowUpDate), contact.notes);
    toast.success("Calendar file downloaded");
  };

  const handleGoogleCalendar = () => {
    if (!contact.nextFollowUpDate) { toast.error("No follow-up date set"); return; }
    window.open(googleCalendarUrl(`${contact.firstName} ${contact.lastName}`, new Date(contact.nextFollowUpDate), contact.notes), "_blank");
  };

  const handleEnableNotifications = async () => {
    const granted = await requestNotificationPermission();
    if (granted) {
      setNotifEnabled(true);
      setDigestEnabled(true);
      scheduleDigestCheck(() => contacts.filter(c => new Date(c.nextFollowUpDate) <= new Date()).length);
      sendNotification("Novara notifications enabled ✓", "You'll get a daily digest of overdue follow-ups at 9 AM.");
      toast.success("Notifications enabled — daily digest at 9 AM");
    } else {
      toast.error("Notifications blocked — allow them in browser settings");
    }
  };

  const handleTestReminder = () => {
    sendNotification(
      `Follow up with ${contact.firstName} 👋`,
      `Your follow-up with ${contact.firstName} ${contact.lastName} is due ${formatDate(contact.nextFollowUpDate)}`
    );
    toast.success("Test reminder sent");
  };

  const hasProfile = contact.industry || contact.function || (contact.interests && contact.interests.length > 0);

  return (
    <div className="mobile-container pb-12 flex flex-col min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md pt-safe pb-4 px-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-1">
          <Link href={`/contacts/${contact.id}/edit`}>
            <Button variant="ghost" size="icon" data-testid="button-edit">
              <Edit2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="button-delete">
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="w-[90%] max-w-[400px] rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Contact?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove {contact.firstName} from your network.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <main className="flex-1 px-6 py-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground mb-1 leading-tight">
            {contact.firstName} {contact.lastName}
          </h1>
          <p className="text-lg text-muted-foreground font-medium">
            {contact.role ? `${contact.role} @ ` : ""}{contact.company}
          </p>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <StatusBadge status={computeStatus(contact)} />

            {/* Current Priority badge with trend indicator */}
            <div className="flex items-center gap-1">
              {isUp && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
              {isDown && <TrendingDown className="w-3.5 h-3.5 text-amber-500" />}
              <ImportanceBadge importance={currentPriority} />
            </div>

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
            {contact.priorityOverride && (
              <span className="inline-flex items-center gap-1 bg-secondary text-muted-foreground border border-border rounded-full text-[10px] font-semibold px-2.5 py-1">
                Manual override
              </span>
            )}
          </div>

          {/* Priority explanation row */}
          {(isPrioritized || contact.priorityOverride) && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              {contact.priorityOverride ? (
                <>
                  <span>Base: <strong>{basePriority}</strong> · Override active</span>
                </>
              ) : isUp ? (
                <>
                  <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                  <span>Boosted from <strong>{basePriority}</strong> — aligns with your career goals</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-3 h-3 text-amber-500 shrink-0" />
                  <span>Reduced from <strong>{basePriority}</strong> — limited career goal alignment</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Primary action */}
        <Button
          onClick={handleMarkContacted}
          className="w-full h-14 rounded-xl text-base font-semibold shadow-md active:scale-[0.98] transition-transform mb-4"
          disabled={markContacted.isPending}
          data-testid="button-mark-contacted"
        >
          {markContacted.isPending ? (
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="w-5 h-5 mr-2" />
          )}
          Mark as Contacted Today
        </Button>

        {/* Calendar + Notifications row */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full h-12 rounded-xl font-semibold gap-2" data-testid="button-add-calendar">
                <CalendarPlus className="w-4 h-4" />Add to Calendar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={handleGoogleCalendar} className="gap-2 cursor-pointer">
                <ExternalLink className="w-4 h-4" />Google Calendar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDownloadIcs} className="gap-2 cursor-pointer">
                <CalendarDays className="w-4 h-4" />Download .ics
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`w-full h-12 rounded-xl font-semibold gap-2 ${notifEnabled ? "border-primary/40 text-primary" : ""}`}
                data-testid="button-notifications"
              >
                <Bell className={`w-4 h-4 ${notifEnabled ? "fill-primary/20" : ""}`} />
                {notifEnabled ? "Reminders On" : "Set Reminder"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {!notifEnabled ? (
                <DropdownMenuItem onClick={handleEnableNotifications} className="gap-2 cursor-pointer">
                  <Bell className="w-4 h-4" />Enable browser notifications
                </DropdownMenuItem>
              ) : (
                <>
                  <div className="px-3 py-2 text-xs text-muted-foreground">Daily digest enabled at 9 AM.</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleTestReminder} className="gap-2 cursor-pointer">
                    <Bell className="w-4 h-4" />Send test reminder now
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { setDigestEnabled(false); setNotifEnabled(false); toast.success("Notifications disabled"); }}
                    className="gap-2 cursor-pointer text-destructive focus:text-destructive"
                  >
                    Turn off notifications
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="space-y-4">
          {/* Relationship details card */}
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Relationship Details</h3>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-foreground/70" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Next Follow Up</p>
                <p className="text-sm font-semibold text-foreground">{formatDate(contact.nextFollowUpDate)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                <CalendarDays className="w-4 h-4 text-foreground/70" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Interaction</p>
                <p className="text-sm font-medium text-foreground">{formatDate(contact.lastInteractionDate)}</p>
              </div>
            </div>

            {contact.firstContactDate && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                  <CalendarDays className="w-4 h-4 text-foreground/70" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">First contact date</p>
                  <p className="text-sm font-medium text-foreground">{formatDate(contact.firstContactDate)}</p>
                </div>
              </div>
            )}

            <div className="border-t border-border/40 pt-3 grid grid-cols-2 gap-3">
              <div className="bg-background/60 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">First reach-out</p>
                <p className="text-sm font-semibold text-foreground">
                  {contact.initialFollowUpDays === 1 ? "1 day" : `${contact.initialFollowUpDays} days`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">after meeting</p>
              </div>
              <div className="bg-background/60 rounded-xl p-3">
                <p className="text-xs text-muted-foreground mb-1">Current cadence</p>
                <p className={`text-sm font-semibold ${maintenance ? "text-amber-600" : "text-foreground"}`}>
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

          {/* Profile card (industry / function / interests) */}
          {hasProfile && (
            <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Profile</h3>

              {contact.industry && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                    <Briefcase className="w-4 h-4 text-foreground/70" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Industry</p>
                    <p className="text-sm font-medium text-foreground">{contact.industry}</p>
                  </div>
                </div>
              )}

              {contact.function && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                    <Briefcase className="w-4 h-4 text-foreground/70" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Function</p>
                    <p className="text-sm font-medium text-foreground">{contact.function}</p>
                  </div>
                </div>
              )}

              {contact.interests && contact.interests.length > 0 && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0">
                    <Tag className="w-4 h-4 text-foreground/70" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Interests</p>
                    <div className="flex flex-wrap gap-1.5">
                      {contact.interests.map(i => (
                        <span key={i} className="text-xs bg-secondary/80 text-foreground/80 px-2 py-0.5 rounded-full">{i}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conversation Starters */}
          <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Newspaper className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Conversation Starters</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Use recent {contact.company} news to reconnect naturally.</p>

            {newsStatus === "loading" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="w-4 h-4 animate-spin" /><span>Fetching latest news…</span>
              </div>
            )}
            {newsStatus === "empty" && <p className="text-sm text-muted-foreground italic">No recent {contact.company} news found.</p>}
            {newsStatus === "error" && <p className="text-sm text-amber-600 dark:text-amber-400 italic">Couldn't load news right now — please try again shortly.</p>}
            {newsStatus === "timeout" && <p className="text-sm text-amber-600 dark:text-amber-400 italic">News request timed out. {headlines.length > 0 ? "Showing the last results we had." : "Try again shortly."}</p>}
            {newsStatus === "config-missing" && <p className="text-sm text-muted-foreground italic">Company news isn't configured yet.</p>}
            {newsStatus === "stale" && <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">Showing cached results — couldn't refresh just now.</p>}

            {(newsStatus === "ok" || newsStatus === "stale" || (newsStatus === "timeout" && headlines.length > 0)) && headlines.length > 0 && (
              <ul className="space-y-3">
                {headlines.map((h, i) => (
                  <li key={i} className="group">
                    <a href={h.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-start gap-3 rounded-xl p-3 bg-background/60 hover:bg-primary/5 border border-transparent hover:border-primary/15 transition-all">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <ExternalLink className="w-2.5 h-2.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">{h.title}</p>
                        {(h.source || h.publishedAt) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {h.source}{h.source && h.publishedAt ? " · " : ""}
                            {h.publishedAt ? new Date(h.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                          </p>
                        )}
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-4">Updates every 6 hours · Google News</p>
          </div>

          {/* Notes & Links */}
          {(contact.notes || contact.linkedinUrl || contact.email || contact.phone) && (
            <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Notes & Links</h3>
              {contact.linkedinUrl && (
                <a href={contact.linkedinUrl.startsWith("http") ? contact.linkedinUrl : `https://${contact.linkedinUrl}`}
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 text-sm font-medium text-primary hover:underline" data-testid="link-linkedin">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Linkedin className="w-4 h-4 text-primary" />
                  </div>
                  View LinkedIn Profile
                </a>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`}
                  className="flex items-center gap-3 text-sm font-medium text-primary hover:underline" data-testid="link-email">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4 text-primary" />
                  </div>
                  {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`}
                  className="flex items-center gap-3 text-sm font-medium text-primary hover:underline" data-testid="link-phone">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4 text-primary" />
                  </div>
                  {contact.phone}
                </a>
              )}
              {contact.notes && (
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center shrink-0 mt-0.5">
                    <AlignLeft className="w-4 h-4 text-foreground/70" />
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
