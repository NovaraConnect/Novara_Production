import { Link } from "wouter";
import { Download, FlaskConical, X } from "lucide-react";
import { NovaraMark } from "@/components/NovaraMark";
import { APP_STORE_URL } from "@/lib/appStore";

/** Top of every demo screen: says it is sample data, and the way out. */
export function DemoBanner() {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-cooling/25 bg-cooling-soft px-4 py-2.5 text-foreground backdrop-blur-md">
      <div className="flex min-w-0 items-center gap-2">
        <FlaskConical className="h-4 w-4 shrink-0 text-cooling" />
        <span className="truncate text-xs font-semibold">Demo · sample contacts, nothing is saved</span>
      </div>
      <Link
        href="/start"
        aria-label="Exit demo"
        className="shrink-0 rounded-md p-1 transition-colors hover:bg-cooling/15"
      >
        <X className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** Bottom of every demo screen, where the app's tab bar would be: the one
 *  thing to do after trying it. */
export function DemoGetAppBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[430px] items-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <NovaraMark size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight text-foreground">Use it for real</p>
          <p className="truncate text-xs text-muted-foreground">7 days free on iPhone</p>
        </div>
        <a
          href={APP_STORE_URL}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Download className="h-4 w-4" /> Get the app
        </a>
      </div>
    </div>
  );
}
