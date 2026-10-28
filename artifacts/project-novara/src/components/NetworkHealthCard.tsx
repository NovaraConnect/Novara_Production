import { Link } from "wouter";
import { ChevronRight, Info, TrendingDown, TrendingUp } from "lucide-react";
import { ScoreRing } from "@/components/ScoreRing";
import { cn } from "@/lib/utils";

export type StatusCounts = { Warm: number; Cooling: number; Cold: number; Dormant: number };

/** The Dashboard's Network Health card: the score ring, the change since last
 *  month when there is one, and the four status counts. Shared with the
 *  public demo (/try) so the two never drift apart. */
export function NetworkHealthCard({
  score,
  change,
  stats,
  href,
}: {
  score: number;
  /** Points since last month; null hides the line. */
  change: number | null;
  stats: StatusCounts;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="surface-card block p-4 mb-4 transition-colors hover:bg-elevated"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
          Network Health
          <Info
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-label="Share of your connected contacts still inside their follow-up window"
          />
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="flex items-center gap-4 pb-5">
        <ScoreRing score={score} />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">out of 100</p>
          {/* Shown once there is a month of history to compare with. */}
          {change !== null && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums",
                  change > 0 && "bg-warm-soft text-warm",
                  change < 0 && "bg-cold-soft text-cold",
                  change === 0 && "bg-muted text-muted-foreground",
                )}
              >
                {change > 0 && <TrendingUp className="h-3 w-3" aria-hidden="true" />}
                {change < 0 && <TrendingDown className="h-3 w-3" aria-hidden="true" />}
                {change > 0 ? `+${change}` : change === 0 ? "No change" : `−${-change}`}
              </span>
              vs last month
            </p>
          )}
        </div>
      </div>
      {/* Four tinted wells rather than pastel blocks: the semantic hue is
          carried by the number and a translucent wash, so the tiles read
          as one module instead of four competing swatches. */}
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-xl border border-warm/15 bg-warm-soft p-2">
          <div className="text-lg font-bold tabular-nums text-warm">{stats.Warm}</div>
          <div className="text-xs text-warm">Warm</div>
        </div>
        <div className="rounded-xl border border-cooling/15 bg-cooling-soft p-2">
          <div className="text-lg font-bold tabular-nums text-cooling">{stats.Cooling}</div>
          <div className="text-xs text-cooling">Cooling</div>
        </div>
        <div className="rounded-xl border border-cold/15 bg-cold-soft p-2">
          <div className="text-lg font-bold tabular-nums text-cold">{stats.Cold}</div>
          <div className="text-xs text-cold">Cold</div>
        </div>
        <div className="rounded-xl border border-dormant/15 bg-dormant-soft p-2">
          <div className="text-lg font-bold tabular-nums text-dormant">{stats.Dormant || 0}</div>
          <div className="text-xs text-dormant">Dormant</div>
        </div>
      </div>
    </Link>
  );
}
