import { cn } from "@/lib/utils";

/**
 * A contact's round avatar: their photo when one has been added, otherwise
 * first and last initials. Every contact gets the same quiet grey so the
 * colour in a list belongs to status, not to names.
 */
export function ContactAvatar({
  firstName,
  lastName,
  photo,
  size = 44,
  className,
}: {
  firstName: string;
  lastName?: string;
  photo?: string;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size };
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        className={cn("shrink-0 rounded-full object-cover bg-muted", className)}
        style={style}
      />
    );
  }
  const initials = `${firstName.trim().charAt(0)}${(lastName ?? "").trim().charAt(0)}`.toUpperCase() || "?";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground",
        className,
      )}
      style={{ ...style, fontSize: Math.round(size * 0.34) }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
