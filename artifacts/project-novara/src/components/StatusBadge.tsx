import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RelationshipStatus } from "@/lib/utils";

interface StatusBadgeProps {
  // The caller computes the status from a contact via computeStatus(contact).
  // StatusBadge no longer accepts a raw date string.
  status: RelationshipStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium border-0 tracking-wide rounded-full px-2.5 py-0.5",
        status === "Warm" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
        status === "Cooling" && "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
        status === "Cold" && "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
        status === "Dormant" && "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300",
        className
      )}
      data-testid={`status-badge-${status.toLowerCase()}`}
    >
      {status}
    </Badge>
  );
}
