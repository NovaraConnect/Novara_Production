import { Contact } from "@/types/contact";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { ImportanceBadge } from "./ImportanceBadge";
import { formatDate, computeStatus, getDaysPastDue } from "@/lib/utils";
import { CalendarDays, MapPin, Newspaper, TrendingUp, TrendingDown } from "lucide-react";
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
  return (
    <Link href={`/contacts/${contact.id}`}>
      <Card className="overflow-hidden border-border/50 shadow-sm hover:shadow-md transition-all duration-200 bg-card hover:-translate-y-0.5 cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-foreground truncate">{contact.firstName} {contact.lastName}</h3>
                {isUp && <TrendingUp className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />}
                {isDown && <TrendingDown className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />}
              </div>
              <p className="text-sm text-muted-foreground truncate">{contact.role}{contact.company ? ` · ${contact.company}` : ""}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={status} />
              <ImportanceBadge importance={currentPriority} />
            </div>
          </div>
          {showOverdueBadge && daysPast > 0 && (
            <div className="mb-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
                Overdue by {daysPast} day{daysPast !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Follow-up: {formatDate(contact.nextFollowUpDate)}
            </span>
            {contact.metAt && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {contact.metAt}
              </span>
            )}
          </div>
          {showNews && headlines && headlines.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Newspaper className="h-3 w-3" />
                <span>Latest from {contact.company}</span>
              </div>
              <p className="text-xs text-foreground/80 line-clamp-2">{headlines[0].title}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}