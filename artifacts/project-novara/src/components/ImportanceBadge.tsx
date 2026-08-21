import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Level = "High" | "Medium" | "Low";

interface ImportanceBadgeProps {
  importance: Level;
  className?: string;
  label?: string;
}

export function priorityColors(level: Level) {
  return {
    High: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
    Medium: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
    Low: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300",
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
