import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Search, SearchX, Loader2, Users, Plus, ListFilter, Check } from "lucide-react";
import { computeStatus, cn } from "@/lib/utils";
import { ContactCard } from "@/components/ContactCard";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useContacts } from "@/hooks/useContacts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Contact } from "@/types/contact";

type TempFilter = "All" | "Warm" | "Cooling" | "Cold" | "Dormant";
type StatusFilter = "All" | "Connected" | "Pipeline";
type SortOrder = "followUp" | "priority" | "name" | "recent";

const SORT_LABELS: Record<SortOrder, string> = {
  followUp: "Next follow-up",
  priority: "Priority",
  name: "Name (A–Z)",
  recent: "Recently added",
};

const PRIORITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

// The API already returns contacts by next follow-up date, so that order is
// kept as-is; the others re-sort a copy.
function sortContacts(list: Contact[], order: SortOrder): Contact[] {
  if (order === "followUp") return list;
  const sorted = [...list];
  if (order === "priority") {
    sorted.sort((a, b) => (PRIORITY_RANK[a.currentPriority ?? a.importance] ?? 1) - (PRIORITY_RANK[b.currentPriority ?? b.importance] ?? 1));
  } else if (order === "name") {
    sorted.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
  } else {
    sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  }
  return sorted;
}

/** Warmth chips carry their status colour even when not selected, as in the
 *  design; the selected chip is solid primary like the status toggle above. */
const TEMP_CHIP: Record<TempFilter, string> = {
  All: "bg-subtle text-muted-foreground",
  Warm: "bg-warm-soft text-warm",
  Cooling: "bg-cooling-soft text-cooling",
  Cold: "bg-cold-soft text-cold",
  Dormant: "bg-dormant-soft text-dormant",
};

export default function Contacts() {
  const { contacts, isLoading } = useContacts();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [tempFilter, setTempFilter] = useState<TempFilter>("All");
  const [sortOrder, setSortOrder] = useState<SortOrder>("followUp");
  const searchRef = useRef<HTMLInputElement>(null);

  // The Dashboard's search button links to /contacts#search.
  useEffect(() => {
    if (window.location.hash === "#search") searchRef.current?.focus();
  }, []);

  const filteredContacts = sortContacts(contacts, sortOrder).filter((c) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        c.firstName.toLowerCase().includes(q) ||
        c.lastName.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        (c.role ?? "").toLowerCase().includes(q) ||
        (c.metAt ?? "").toLowerCase().includes(q);
      if (!matchesSearch) return false;
    }
    if (statusFilter === "Connected" && c.connectionStatus !== "connected") return false;
    if (statusFilter === "Pipeline" && c.connectionStatus !== "pipeline") return false;
    if (tempFilter !== "All") {
      const temp = computeStatus(c);
      if (temp !== tempFilter) return false;
    }
    return true;
  });

  const connectedCount = contacts.filter(c => c.connectionStatus === "connected").length;
  const pipelineCount = contacts.filter(c => c.connectionStatus === "pipeline").length;

  return (
    <div className="mobile-container pb-24 flex flex-col min-h-[100dvh]">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6">
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground mb-4">Contacts</h1>

        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search by name, company, role..."
              className="pl-9 bg-card border-border/50 rounded-xl h-11 shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-contacts"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Sort contacts (${SORT_LABELS[sortOrder]})`}
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-card shadow-sm transition-colors hover:bg-elevated",
                sortOrder === "followUp" ? "border-border/50 text-foreground" : "border-primary/40 text-primary",
              )}
            >
              <ListFilter className="h-[18px] w-[18px]" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              {(Object.keys(SORT_LABELS) as SortOrder[]).map((order) => (
                <DropdownMenuItem key={order} onSelect={() => setSortOrder(order)} className="justify-between">
                  {SORT_LABELS[order]}
                  {sortOrder === order && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Status toggle: Connected | Pipeline */}
        <div className="flex gap-2 mb-3">
          {(["All", "Connected", "Pipeline"] as StatusFilter[]).map((s) => {
            const count = s === "Connected" ? connectedCount : s === "Pipeline" ? pipelineCount : contacts.length;
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setTempFilter("All"); }}
                className={[
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all",
                  isActive
                    ? s === "Pipeline"
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                {s}
                <span className={[
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-primary-foreground/15 text-primary-foreground" : "bg-subtle text-muted-foreground",
                ].join(" ")}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Temperature filter — only shown when not in Pipeline view */}
        {statusFilter !== "Pipeline" && (
          <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-0.5 [scrollbar-width:none]" role="radiogroup" aria-label="Warmth">
            {(["All", "Warm", "Cooling", "Cold", "Dormant"] as const).map((t) => {
              const selected = tempFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setTempFilter(t)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    selected ? "bg-primary text-primary-foreground shadow-sm" : TEMP_CHIP[t],
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading contacts…</span>
          </div>
        ) : contacts.length === 0 && !searchQuery && statusFilter === "All" && tempFilter === "All" ? (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-5">
            <div className="w-16 h-16 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center">
              <Users className="w-7 h-7 text-primary/30" />
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">No contacts yet</p>
              <p className="text-sm text-muted-foreground">Start building your network</p>
            </div>
            <Link href="/add">
              <Button className="rounded-xl">
                <Plus className="w-4 h-4 mr-2" />
                Add your first contact
              </Button>
            </Link>
          </div>
        ) : filteredContacts.length === 0 ? (
          /* Deliberately compact: this is a filter dead-end, not onboarding,
             so it gets an icon, a heading and one line of guidance — and no
             call to action competing with the filters above. */
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-subtle border border-border/60">
              <SearchX className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">No matches</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Try a different search, or clear your filters.
              </p>
            </div>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <ContactCard key={contact.id} contact={contact} />
          ))
        )}
      </main>

      <BottomNav />
    </div>
  );
}
