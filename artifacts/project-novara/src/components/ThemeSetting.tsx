// ============================================================================
// The Appearance control on Settings.
//
// Renders nothing when the choice cannot be honoured — inside build 7 and
// earlier the native shell is pinned to dark by Info.plist, so offering a
// Light option there would produce a light page under a light-on-light status
// bar. canOfferThemeChoice() is the predicate; see lib/nativeBridge.ts.
// ============================================================================
import { Monitor, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { haptic } from "@/lib/nativeBridge";
import type { ThemeChoice } from "@/lib/theme";

const OPTIONS: ReadonlyArray<{
  value: ThemeChoice;
  label: string;
  Icon: typeof Monitor;
}> = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export default function ThemeSetting() {
  const { choice, resolved, canChoose, setChoice } = useTheme();

  if (!canChoose) return null;

  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
        Appearance
      </p>
      <div className="surface-card p-4">
        <div
          role="radiogroup"
          aria-label="Appearance"
          className="grid grid-cols-3 gap-2"
        >
          {OPTIONS.map(({ value, label, Icon }) => {
            const selected = choice === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => {
                  if (selected) return;
                  haptic("selection");
                  setChoice(value);
                }}
                className={[
                  "flex flex-col items-center gap-2 rounded-xl border px-3 py-3",
                  "transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-subtle text-muted-foreground hover:bg-muted",
                ].join(" ")}
              >
                <Icon
                  className={`w-5 h-5 ${selected ? "text-primary" : "text-muted-foreground"}`}
                />
                <span className="text-xs font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          {choice === "system"
            ? `Following your device — currently ${resolved}.`
            : `Always ${choice}, whatever your device is set to.`}
        </p>
      </div>
    </section>
  );
}
