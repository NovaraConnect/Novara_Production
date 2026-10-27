import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Splits "--MM-DD" into its parts ("" where unset). */
export function parseBirthday(value: string | undefined | null): { month: string; day: string } {
  const m = value ? /^--(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return { month: "", day: "" };
  return { month: String(Number(m[1])), day: String(Number(m[2])) };
}

/** "October 27". Novara keeps the month and day only. */
export function formatBirthday(value: string | undefined | null): string | null {
  const { month, day } = parseBirthday(value);
  if (!month || !day) return null;
  const name = new Date(2000, Number(month) - 1, 1).toLocaleString("en-US", { month: "long" });
  return `${name} ${day}`;
}

const selectClass =
  "h-12 min-w-0 rounded-xl border border-input bg-input-background px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Birthday as a month and a day; Novara doesn't ask for the year. Emits
 * "--MM-DD", or "" until both are picked. Native selects, so the iPhone
 * shows its own wheel picker.
 */
export function BirthdayInput({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  // Partial picks (month chosen, day not yet) live here until complete.
  const [parts, setParts] = useState(() => parseBirthday(value));
  useEffect(() => {
    if (value) setParts(parseBirthday(value));
  }, [value]);

  const emit = (next: { month: string; day: string }) => {
    const maxForMonth = next.month ? DAYS_IN_MONTH[Number(next.month) - 1] : 31;
    if (Number(next.day) > maxForMonth) next = { ...next, day: "" };
    setParts(next);
    if (!next.month || !next.day) {
      onChange("");
      return;
    }
    const mm = next.month.padStart(2, "0");
    const dd = next.day.padStart(2, "0");
    onChange(`--${mm}-${dd}`);
  };

  const maxDay = parts.month ? DAYS_IN_MONTH[Number(parts.month) - 1] : 31;

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <select
        aria-label="Birthday month"
        className={selectClass}
        value={parts.month}
        onChange={(e) => emit({ ...parts, month: e.target.value })}
        data-testid="input-birthday-month"
      >
        <option value="">Month</option>
        {MONTHS.map((m, i) => (
          <option key={m} value={String(i + 1)}>{m}</option>
        ))}
      </select>
      <select
        aria-label="Birthday day"
        className={selectClass}
        value={parts.day}
        onChange={(e) => emit({ ...parts, day: e.target.value })}
        data-testid="input-birthday-day"
      >
        <option value="">Day</option>
        {Array.from({ length: maxDay }, (_, i) => (
          <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
        ))}
      </select>
    </div>
  );
}
