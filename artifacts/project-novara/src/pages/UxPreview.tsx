// Local-only preview: the Add Contact import cards without signing in.
// Not committed — PR #25 contains only the components themselves.
import { BusinessCardScanner } from "@/components/BusinessCardScanner";
import { LinkedInScreenshotImport } from "@/components/LinkedInScreenshotImport";
import { QRScanner } from "@/components/QRScanner";
import { toast } from "sonner";

export default function UxPreview() {
  const noop = () => toast.success("Preview only — nothing is saved here");
  return (
    <div className="mobile-container min-h-[100dvh] flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border/50 pt-safe pb-4 px-6 flex items-center gap-3">
        <span className="text-muted-foreground">←</span>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">Add Contact</h1>
      </header>
      <main className="flex-1 px-4 py-4">
        <BusinessCardScanner onExtracted={noop} />
        <LinkedInScreenshotImport onExtracted={noop} />
        <QRScanner onExtracted={noop} />
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-6 mb-2">
          Or enter manually
        </p>
        <p className="text-xs text-muted-foreground">
          The form continues below on the real screen.
        </p>
      </main>
    </div>
  );
}
