import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

/**
 * The shell around each "get a contact in without typing" option on Add
 * Contact — business card, LinkedIn screenshot, QR code.
 *
 * The three used to look like three different features: two tinted panels
 * with uppercase labels and a bare outline button with no card at all. They
 * now share the row pattern the rest of the app already uses (icon tile,
 * title, one line of explanation, chevron), so Add Contact reads as one set
 * of choices rather than a pile of controls.
 *
 * Presentation only — every scanner keeps its own behaviour and passes its
 * status UI and buttons as children.
 */
export function ImportOptionCard({
  icon: Icon,
  iconNode,
  title,
  description,
  children,
}: {
  /** Lucide icon for the tile. Ignored when `iconNode` is given. */
  icon?: LucideIcon;
  /** For brand marks that are not Lucide icons (the LinkedIn "in"). */
  iconNode?: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 bg-card border border-border/50 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 p-4 pb-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          {iconNode ?? (Icon ? <Icon className="w-5 h-5 text-primary" /> : null)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
        {/* Affordance only: the buttons below are the real targets, so this is
            hidden from screen readers rather than announced as a control. */}
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0 mt-0.5" aria-hidden="true" />
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}
