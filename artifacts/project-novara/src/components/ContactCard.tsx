import { Contact } from "@/types/contact";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { ImportanceBadge } from "./ImportanceBadge";
import { formatDate, computeStatus, getDaysPastDue, statusBorderColor } from "@/lib/utils";
import { CalendarDays, MapPin, FileText, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { ContactAvatar } from "./ContactAvatar";
import { useCompanyNews } from "@/hooks/useCompanyNews";

interface ContactCardProps {
  contact: Contact;
  showOverdueBadge?: boolean;
  overdaysPast?: number;
}

export function ContactCard({ contact, showOverdueBadge, overdaysPast }: ContactCardProps) {
  const status = computeStatus(contact);
  const showNews = status === "Cold" || status === "Cooling" || status === "Dormant";
  const { headlines } = useCompanyNews(
    showNews ? contact.company : null,
    contact.industry,
    contact.role,
  );
  const basePriority = contact.basePriority ?? contact.importance;
  const currentPriority = contact.currentPriority ?? basePriority;
  const priorityBoosted = !contact.priorityOverride && currentPriority !== basePriority;
  const isUp = priorityBoosted && ((currentPriority === "High" && basePriority !== "High") || (currentPriority === "Medium" && basePriority === "Low"));
  const isDown = priorityBoosted && ((currentPriority === "Low" && basePriority !== "Low") || (currentPriority === "Medium" && basePriority === "High"));
  const daysPast = overdaysPast ?? getDaysPastDue(contact);
  const newsLine = showNews && headlines && headlines.length > 0 ? headlines[0].title : null;
  return (
    <Link href={`/contacts/${contact.id}`}>
      {/* The coloured edge used to be applied by the Dashboard's overdue list,
          which meant the same contact had an accent there and none in
          Contacts. It belongs to the card: status is a property of the
          contact, not of the list it happens to be in. */}
      <Card className={`overflow-hidden border-card-border border-l-4 ${statusBorderColor(status)} transition-colors duration-200 bg-card hover:bg-elevated cursor-pointer`}>
        <CardContent className="flex items-center gap-3 p-4">
          <ContactAvatar firstName={contact.firstName} lastName={contact.lastName} photo={contact.photo} size={48} className="self-start" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="truncate font-semibold text-foreground">{contact.firstName} {contact.lastName}</h3>
                {isUp && <TrendingUp className="h-3.5 w-3.5 flex-shrink-0 text-warm" />}
                {isDown && <TrendingDown className="h-3.5 w-3.5 flex-shrink-0 text-cold" />}
              </div>
              <StatusBadge status={status} className="shrink-0 text-[11px]" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm text-muted-foreground">
                {contact.role}{contact.role && contact.company ? " · " : ""}{contact.company}
              </p>
              <ImportanceBadge importance={currentPriority} className="shrink-0 text-[11px]" />
            </div>
            {showOverdueBadge && daysPast > 0 && (
              <span className="mt-1 inline-flex items-center rounded-full border border-overdue/20 bg-overdue-soft px-2 py-0.5 text-xs font-medium text-overdue">
                Overdue by {daysPast} day{daysPast !== 1 ? "s" : ""}
              </span>
            )}
            <div className="mt-1.5 flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
              <span className="flex shrink-0 items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {formatDate(contact.nextFollowUpDate)}
              </span>
              {contact.metAt && (
                <span className="flex min-w-0 items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contact.metAt}</span>
                </span>
              )}
            </div>
            {/* One line of context: fresh company news for a contact who is
                cooling off (a reason to reach out), otherwise their notes. */}
            {(newsLine || contact.notes) && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <FileText className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="line-clamp-2">{newsLine ?? contact.notes}</span>
              </p>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    </Link>
  );
}