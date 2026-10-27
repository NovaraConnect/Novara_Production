import { cn } from "@/lib/utils";

/** The ring's colour follows the same bands as a contact's status, so a
 *  healthy network reads green and a neglected one reads warm. */
function bandClass(score: number) {
  if (score >= 70) return "stroke-warm";
  if (score >= 40) return "stroke-cooling";
  return "stroke-cold";
}

/** Network Health as a progress ring with the score in the middle. */
export function ScoreRing({ score, size = 96 }: { score: number; size?: number }) {
  const stroke = Math.round(size * 0.1);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${clamped} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-muted" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className={cn(bandClass(clamped), "transition-[stroke-dasharray] duration-700 ease-out")}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(clamped / 100) * circumference} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground font-sans font-semibold tabular-nums"
        style={{ fontSize: size * 0.3, letterSpacing: "-0.02em" }}
      >
        {clamped}
      </text>
    </svg>
  );
}
