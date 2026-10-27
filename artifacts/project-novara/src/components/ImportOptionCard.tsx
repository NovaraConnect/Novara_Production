import type { LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The "in" letters alone, in the call-to-action blue, sized to sit in the
 *  same icon tile as the other import icons. Drawn inline and only used to
 *  label the feature, never LinkedIn's logo or brand colour. */
export function LinkedInGlyph() {
  return (
    <span className="flex h-8 w-8 items-center justify-center text-cta" aria-hidden="true">
      <span className="text-[30px] font-bold leading-none tracking-tight">in</span>
    </span>
  );
}

/**
 * One way to get a contact in without typing, shown as its own tab on Add
 * Contact: an icon tile, a title and a line of explanation, centred, then the
 * buttons, then an optional panel of tips or privacy notes.
 *
 * Presentation only. Each importer keeps its own behaviour and passes its
 * buttons and status UI as children.
 */
export function ImportOptionCard({
  icon: Icon,
  iconNode,
  title,
  description,
  info,
  children,
}: {
  icon?: LucideIcon;
  /** For marks that are not Lucide icons — see LinkedInGlyph. */
  iconNode?: React.ReactNode;
  title: string;
  description: string;
  /** InfoRow items for the panel under the buttons. */
  info?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col items-center pt-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-cta/15 bg-cta/10">
        {iconNode ?? (Icon ? <Icon className="h-8 w-8 text-cta" strokeWidth={1.75} aria-hidden="true" /> : null)}
      </div>
      <h2 className="mt-5 font-serif text-[22px] font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-2 max-w-[300px] text-sm leading-relaxed text-muted-foreground">{description}</p>
      {children ? <div className="mt-7 w-full space-y-3 text-left">{children}</div> : null}
      {info ? (
        <div className="mt-6 w-full space-y-4 rounded-2xl border border-border/50 bg-muted/50 p-4 text-left">
          {info}
        </div>
      ) : null}
    </section>
  );
}

/** One line of the info panel: an icon, a bold title and a short explanation,
 *  or a list passed as children. */
export function InfoRow({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-cta" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-serif text-[15px] font-semibold text-foreground">{title}</p>
        <div className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

/** An import tab's action button, outlined in the call-to-action blue. */
export function ImportPrimaryButton({ className, ...props }: ButtonProps) {
  return <Button type="button" variant="cta" className={cn("h-12 w-full gap-2 rounded-xl text-[15px]", className)} {...props} />;
}

/** The alternative action under it. Styled the same, so every action on Add
 *  Contact looks alike; kept separate so the two can diverge again. */
export const ImportSecondaryButton = ImportPrimaryButton;
