import { useId } from "react";

/**
 * The Novara mark: a bold white N on the same radial blue used by the app
 * icon, the launch screen and the favicon.
 *
 * Drawn inline rather than loaded from /icon-512.png so it stays crisp at
 * 26px, costs no request, and cannot fall out of step with the rest of the
 * brand — scripts/generate-icons.swift and public/favicon.svg draw exactly
 * these colours and this outline.
 *
 * The N is a path, not text, so it does not depend on a font being loaded.
 */
export function NovaraMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Two marks on one page would otherwise share a gradient id and the second
  // would reference the first's definition.
  const gradientId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 180"
      className={className}
      role="img"
      aria-label="Novara"
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="#1334A7" />
          <stop offset="100%" stopColor="#040E41" />
        </radialGradient>
      </defs>
      <rect width="180" height="180" rx="36" fill={`url(#${gradientId})`} />
      <path d="M62 118 V62 H74 L106 100 V62 H118 V118 H106 L74 80 V118 Z" fill="#ffffff" />
    </svg>
  );
}
