import { Link } from "wouter";
import { CalendarDays, ChevronRight } from "lucide-react";
import { ContactAvatar } from "@/components/ContactAvatar";
import { StatusBadge } from "@/components/StatusBadge";
import { computeStatus, describeFollowUp, formatDate, cn } from "@/lib/utils";
import type { Contact } from "@/types/contact";

/** A Dashboard list of follow-ups: the first three, each with when it is due,
 *  and "View all" to Contacts. Renders nothing when the list is empty. */
export function FollowUpCard({
  title,
  icon,
  contacts,
  tone,
  contactHref = (c) => `/contacts/${c.id}`,
  viewAllHref = "/contacts",
  id,
}: {
  title: string;
  icon: React.ReactNode;
  contacts: Contact[];
  tone?: "overdue";
  /** Where a row opens. The demo points rows at /try/contacts/:id. */
  contactHref?: (contact: Contact) => string;
  viewAllHref?: string;
  id?: string;
}) {
  if (contacts.length === 0) return null;
  return (
    <section
      id={id}
      className={cn("surface-card px-4 pt-4 pb-1 mb-4", tone === "overdue" && "border-overdue/25")}
      aria-label={title}
    >
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <h2 className="flex-1 text-[15px] font-semibold text-foreground">
          {title}
          {tone === "overdue" && (
            <span className="ml-2 rounded-full bg-overdue-soft px-2 py-0.5 align-middle text-xs font-semibold text-overdue">
              {contacts.length}
            </span>
          )}
        </h2>
        <Link href={viewAllHref} className="flex items-center gap-0.5 text-sm font-medium text-foreground">
          View all
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="divide-y divide-border/60">
        {contacts.slice(0, 3).map(contact => {
          const due = describeFollowUp(contact);
          return (
            <Link key={contact.id} href={contactHref(contact)} className="flex items-center gap-3 py-3">
              <ContactAvatar firstName={contact.firstName} lastName={contact.lastName} photo={contact.photo} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-[15px] font-semibold text-foreground">
                    {contact.firstName} {contact.lastName}
                  </p>
                  <StatusBadge status={computeStatus(contact)} className="shrink-0 text-[11px]" />
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {contact.role}{contact.role && contact.company ? " · " : ""}{contact.company}
                </p>
                <p className={cn("mt-1 flex items-center gap-1 text-xs", due.overdue ? "text-overdue" : "text-muted-foreground")}>
                  <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
                  {due.label} · {formatDate(contact.nextFollowUpDate)}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
