import type { LucideIcon } from "lucide-react";

/** The "in" letters alone, in the app's primary blue, sized to sit in the
 *  same icon slot as the other import icons. Drawn inline and only used to
 *  label the feature. */
export function LinkedInGlyph() {
  return (
    <span
      className="w-11 h-11 flex items-center justify-center shrink-0 text-primary"
      aria-hidden="true"
    >
      <span className="text-[24px] font-bold leading-none tracking-tight">in</span>
    </span>
  );
}

/**
 * The shell around each "get a contact in without typing" option on Add
 * Contact — business card, LinkedIn profile, QR code, phone contacts.
 *
 * One set, matching the Add Contact design: a tinted rounded card, an icon tile
 * on the left, the title and a line of explanation to its right. Cards with
 * buttons put them below the header; compact cards are the whole tap target.
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
  const tile =
    iconNode ??
    (Icon ? (
      <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0" aria-hidden="true">
        <Icon className="w-5 h-5 text-primary" />
      </span>
    ) : null);

  const header = (
    <div className="flex items-center gap-3">
      {tile}
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-primary leading-snug">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
      </div>
    </div>
  );

  const shell = "mb-3 rounded-2xl border border-primary/15 bg-primary/[0.06] p-4 shadow-sm";

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
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
