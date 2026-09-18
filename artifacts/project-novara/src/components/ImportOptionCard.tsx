import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

/** LinkedIn's own mark, so the import option is recognisable at a glance.
 *  Drawn inline rather than loaded, and only used to label the feature. */
export function LinkedInGlyph() {
  return (
    <span
      className="w-7 h-7 rounded-md bg-[#0A66C2] text-white flex items-center justify-center shrink-0"
      aria-hidden="true"
    >
      <span className="text-[13px] font-bold leading-none tracking-tight">in</span>
    </span>
  );
}

/**
 * The shell around each "get a contact in without typing" option on Add
 * Contact — business card, LinkedIn screenshot, QR code.
 *
 * The three used to look like three different features: two tinted panels
 * with uppercase labels and a bare outline button with no card at all. They
 * are now one set — tinted card, coloured title beside its icon, a line of
 * explanation across the full width, chevron on the right.
 *
 * Presentation only. Each scanner keeps its own behaviour and passes its
 * status UI and buttons as children. Pass `onClick` for an option that has no
 * button of its own, which makes the whole card the target.
 */
export function ImportOptionCard({
  icon: Icon,
  iconNode,
  title,
  description,
  onClick,
  children,
}: {
  icon?: LucideIcon;
  /** For marks that are not Lucide icons — see LinkedInGlyph. */
  iconNode?: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const header = (
    <>
      <div className="flex items-center gap-2.5">
        {iconNode ?? (Icon ? <Icon className="w-6 h-6 text-primary shrink-0" /> : null)}
        <p className="flex-1 text-[15px] font-bold text-primary">{title}</p>
        <ChevronRight className="w-4 h-4 text-primary/60 shrink-0" aria-hidden="true" />
      </div>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
    </>
  );

  const shell = "mb-3 rounded-2xl border border-primary/20 bg-primary/[0.07] p-4";

  // An option with no button of its own is one big target; one with buttons
  // keeps them as the targets, so the card stays a plain container.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${shell} w-full text-left transition-colors hover:bg-primary/12`}>
        {header}
        {children}
      </button>
    );
  }

  return (
    <div className={shell}>
      {header}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
