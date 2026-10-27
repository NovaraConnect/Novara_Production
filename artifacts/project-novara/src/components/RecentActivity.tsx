import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, FileText } from "lucide-react";
import type { Contact } from "@/types/contact";
import { computeStatus } from "@/lib/utils";
import { useCompanyNews } from "@/hooks/useCompanyNews";

const MAX_ROWS = 3;

/**
 * Dashboard "Recent Activity": the latest news about the companies of
 * contacts who are cooling off, as a reason to get back in touch.
 *
 * It asks for exactly the news ContactCard already asks for (same contacts,
 * same company/industry/role cache key), so it adds no requests against the
 * daily news quota. Renders nothing until at least one company has news.
 */
export function RecentActivity({ contacts }: { contacts: Contact[] }) {
  const seen = new Set<string>();
  const candidates = contacts.filter((c) => {
    if (!c.company?.trim() || computeStatus(c) === "Warm") return false;
    const key = c.company.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_ROWS);

  const [withNews, setWithNews] = useState<Record<string, boolean>>({});
  const report = useCallback((id: string, has: boolean) => {
    setWithNews((prev) => (prev[id] === has ? prev : { ...prev, [id]: has }));
  }, []);

  if (candidates.length === 0) return null;
  const anyNews = candidates.some((c) => withNews[c.id]);

  return (
    <section className={anyNews ? "surface-card px-4 pt-4 pb-1" : "hidden"} aria-label="Recent Activity">
      <div className="flex items-center gap-2 mb-1">
        <FileText className="h-4 w-4 text-foreground" aria-hidden="true" />
        <h2 className="flex-1 text-[15px] font-semibold text-foreground">Recent Activity</h2>
      </div>
      <div className="divide-y divide-border/60">
        {candidates.map((c) => (
          <ActivityRow key={c.id} contact={c} onResult={report} />
        ))}
      </div>
    </section>
  );
}

function ActivityRow({ contact, onResult }: { contact: Contact; onResult: (id: string, has: boolean) => void }) {
  const { headlines } = useCompanyNews(contact.company, contact.industry, contact.role);
  const count = headlines?.length ?? 0;
  useEffect(() => onResult(contact.id, count > 0), [contact.id, count, onResult]);
  if (count === 0) return null;

  const newest = headlines!.reduce((a, b) => (a.publishedAt > b.publishedAt ? a : b));
  const published = new Date(newest.publishedAt);
  const fresh = Date.now() - published.getTime() < 24 * 60 * 60 * 1000;

  return (
    <Link href={`/contacts/${contact.id}`} className="flex items-center gap-3 py-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-bold text-primary"
        aria-hidden="true"
      >
        {contact.company.trim().charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-foreground">{contact.company}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {count} relevant news article{count === 1 ? "" : "s"}
          {fresh && <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="New" />}
        </p>
      </div>
      {!isNaN(published.getTime()) && (
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatDistanceToNowStrict(published, { addSuffix: true })}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}
