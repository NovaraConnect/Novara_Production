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
        // Colours come from the semantic tokens — see statusColor() in
        // lib/utils.ts and the --warm/--cooling/--cold/--dormant tokens.
        status === "Warm" && "bg-warm-soft text-warm",
        status === "Cooling" && "bg-cooling-soft text-cooling",
        status === "Cold" && "bg-cold-soft text-cold",
        status === "Dormant" && "bg-dormant-soft text-dormant",
        className
      )}
      data-testid={`status-badge-${status.toLowerCase()}`}
    >
      {status}
    </Badge>
  );
}
