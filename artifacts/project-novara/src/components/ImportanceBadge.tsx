import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Level = "High" | "Medium" | "Low";

interface ImportanceBadgeProps {
  importance: Level;
  className?: string;
  label?: string;
}

/** Priority is semantic too: purple = High, blue = Medium, neutral = Low.
 *  Tokens live in index.css (--priority-*); this is the single mapping. */
export function priorityColors(level: Level) {
  return {
    High: "bg-priority-high-soft text-priority-high",
    Medium: "bg-priority-medium-soft text-priority-medium",
    Low: "bg-priority-low-soft text-priority-low",
  }[level];
}

export function ImportanceBadge({ importance, className, label }: ImportanceBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border-0 tracking-wide rounded-full px-2.5 py-0.5",
        priorityColors(importance),
        className
      )}
      data-testid={`importance-badge-${importance.toLowerCase()}`}
    >
      {label ?? `${importance} Priority`}
    </Badge>
  );
}
