import { useState } from "react";
import { Link } from "wouter";
import { Search, SearchX, Loader2, Users, Plus } from "lucide-react";
import { computeStatus } from "@/lib/utils";
import { ContactCard } from "@/components/ContactCard";
import { BottomNav } from "@/components/BottomNav";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useContacts } from "@/hooks/useContacts";

type TempFilter = "All" | "Warm" | "Cooling" | "Cold";
type StatusFilter = "All" | "Connected" | "Pipeline";

export default function Contacts() {
  const { contacts, isLoading } = useContacts();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [tempFilter, setTempFilter] = useState<TempFilter>("All");

  const filteredContacts = contacts.filter((c) => {
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

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, company, role..."
            className="pl-9 bg-card border-border/50 rounded-xl h-10 shadow-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-contacts"
          />
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
          <Tabs value={tempFilter} onValueChange={(v) => setTempFilter(v as TempFilter)} className="w-full">
            <TabsList className="w-full justify-start gap-1 bg-transparent h-auto p-0">
              {(["All", "Warm", "Cooling", "Cold"] as const).map((s) => (
                <TabsTrigger
                  key={s}
                  value={s}
                  // Matches the All/Connected/Pipeline row above: unselected
                  // options sit in their own subtle pill instead of floating as
                  // bare text. Selected-state logic is untouched.
                  className="rounded-full px-4 py-1.5 text-sm bg-subtle text-muted-foreground transition-colors hover:bg-muted data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
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
