import { ChevronRight, type LucideIcon } from "lucide-react";

/** The "in" letters alone, in the app's primary blue, sized to sit in the
 *  same icon slot as the other import icons. Drawn inline and only used to
 *  label the feature. */
export function LinkedInGlyph() {
  return (
    <span
      className="w-6 h-6 flex items-center justify-center shrink-0 text-primary"
      aria-hidden="true"
    >
      <span className="text-[19px] font-bold leading-none tracking-tight">in</span>
    </span>
  );
}

/**
 * The shell around each "get a contact in without typing" option on Add
 * Contact — business card, LinkedIn profile, QR code, phone contacts.
 *
 * One set, matching the Add Contact design: a tinted rounded card with the
 * icon beside the title and a line of explanation under both. Cards with
 * buttons put them below; compact cards are the whole tap target and show a
 * chevron, which only appears where tapping the card does something.
 *
 * Presentation only. Each importer keeps its own behaviour and passes its
 * status UI and buttons as children. Pass `onClick` for an option that has no
 * button of its own, which makes the whole card the target.
 */
export function ImportOptionCard({
  icon: Icon,
  iconNode,
  title,
  description,
  onClick,
  disabled,
  testId,
  children,
}: {
  icon?: LucideIcon;
  /** For marks that are not Lucide icons — see LinkedInGlyph. */
  iconNode?: React.ReactNode;
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
  children?: React.ReactNode;
}) {
  const icon = iconNode ?? (Icon ? <Icon className="w-6 h-6 shrink-0 text-primary" aria-hidden="true" /> : null);

  const header = (
    <>
      <div className="flex items-center gap-3">
        {icon}
        <p className="min-w-0 flex-1 text-[15px] font-bold text-primary leading-snug">{title}</p>
        {onClick && <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground leading-snug">{description}</p>
    </>
  );

  // Kept compact so every option, through Enter Manually, fits on one phone
  // screen without scrolling.
  const shell = "mb-2 rounded-2xl border border-primary/15 bg-primary/[0.06] px-3 py-2.5 shadow-sm";

  // An option with no button of its own is one big target; one with buttons
  // keeps them as the targets, so the card stays a plain container.
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        data-testid={testId}
        className={`${shell} w-full text-left transition-colors hover:bg-primary/10 disabled:opacity-60`}
      >
        {header}
        {children}
      </button>
    );
  }

  return (
    <div className={shell}>
      {header}
      {children ? <div className="mt-2.5">{children}</div> : null}
    </div>
  );
}
