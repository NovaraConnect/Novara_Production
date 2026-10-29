import { useLocation } from "wouter";
import { FlaskConical, X } from "lucide-react";

export function DemoBanner() {
  const [, setLocation] = useLocation();

  return (
    <div className="sticky top-0 z-50 bg-cooling text-[#2A1C00] px-4 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="w-4 h-4 shrink-0" />
        <span className="text-xs font-semibold truncate">
          Demo mode · Changes will not be saved
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => setLocation("/sign-up")}
          className="text-xs font-bold bg-[#2A1C00] text-cooling rounded-lg px-3 py-1.5 hover:bg-[#3A2800] transition-colors"
        >
          Get started free
        </button>
        <button
          onClick={() => setLocation("/")}
          aria-label="Exit demo"
          className="p-1 rounded-md hover:bg-[#2A1C00]/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
