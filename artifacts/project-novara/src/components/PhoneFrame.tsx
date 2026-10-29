/**
 * A real app screenshot in an iPhone frame, for the public marketing pages
 * (/investors, /start). Screenshots live in public/screens/ at 720 × 1558
 * with a flat 9:41 status bar; the Dynamic Island is drawn here.
 *
 * `size="sm"` is for phones drawn small (around 200px wide or less): the
 * default 9px bezel looks heavy at that size, so it gets a thinner one.
 */
const FRAME = {
  md: { outer: "rounded-[2.6rem] p-[9px]", inner: "rounded-[2.05rem]" },
  sm: { outer: "rounded-[1.9rem] p-[5px]", inner: "rounded-[1.6rem]" },
};

export function PhoneFrame({
  src,
  alt,
  className = "",
  eager = false,
  size = "md",
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
  size?: keyof typeof FRAME;
}) {
  const f = FRAME[size];
  return (
    <div
      className={`relative ${f.outer} bg-[#0B0F17] shadow-[0_40px_80px_-24px_rgba(4,14,65,0.55),0_0_0_1px_rgba(255,255,255,0.08)_inset] ${className}`}
    >
      <div className={`relative overflow-hidden ${f.inner} bg-white`}>
        <img
          src={src}
          alt={alt}
          width={720}
          height={1558}
          loading={eager ? "eager" : "lazy"}
          className="block h-auto w-full"
        />
        {/* Dynamic Island: sits between the clock and the status icons. */}
        <div className="absolute left-1/2 top-[1.6%] h-[3.1%] w-[30%] -translate-x-1/2 rounded-full bg-[#0B0F17]" />
      </div>
    </div>
  );
}
