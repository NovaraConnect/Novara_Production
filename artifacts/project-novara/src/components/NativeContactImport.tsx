import { useState } from "react";
import { useLocation } from "wouter";
import { ContactRound } from "lucide-react";
import { ImportOptionCard } from "@/components/ImportOptionCard";
import { toast } from "sonner";
import { useContacts } from "@/hooks/useContacts";
import { findDuplicateContact } from "@/lib/contactDuplicates";
import {
  canPickNativeContact,
  pickNativeContact,
  openNativeSettings,
  haptic,
  type NativeContactPayload,
} from "@/lib/nativeBridge";
import type { ScannedContact } from "@/lib/businessCardParse";

/**
 * "Import from Contacts" — the iOS app only.
 *
 * Sits alongside the card scanner and the QR scanner as a fourth way to get
 * someone into Novara without typing, and uses the same contract as the others:
 * it PREFILLS the form below and the user reviews and saves. It never writes a
 * contact by itself, which is what keeps the contact limit, the priority
 * suggestion and the duplicate check in play.
 *
 * Privacy: the picker is Apple's own and runs outside Novara's process, so the
 * address book is never read — only the one contact the user taps comes back,
 * and iOS shows no permission prompt for that. See
 * ios/App/App/Native/NovaraContactImport.swift.
 *
 * Renders nothing outside the app, and nothing in an older app build that has
 * the web view but not the picker.
 */
export function NativeContactImport({
  onExtracted,
}: {
  onExtracted: (data: ScannedContact & { linkedinUrl?: string }) => void;
}) {
  const [, setLocation] = useLocation();
  const { contacts } = useContacts();
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null);

  if (!canPickNativeContact()) return null;

  const apply = (payload: NativeContactPayload) => {
    const { cancelled, ...fields } = payload;
    if (cancelled) return;

    const hasAnything = Object.values(fields).some((value) => !!value);
    if (!hasAnything) {
      toast.error("That contact had nothing Novara could use — please type the details in.");
      return;
    }

    const existing = findDuplicateContact(contacts, fields);
    setDuplicate(
      existing
        ? { id: existing.id, name: `${existing.firstName} ${existing.lastName}`.trim() }
        : null,
    );

    onExtracted(fields);
    haptic("success");
    toast.success("Contact imported — review the fields below before saving");
  };

  const handlePick = async () => {
    setBusy(true);
    try {
      apply(await pickNativeContact());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't open your contacts. Please type the details in.";
      // The only error that is actionable is a denied permission, and the
      // native layer words that one itself.
      toast.error(message, {
        action: message.toLowerCase().includes("settings")
          ? { label: "Settings", onClick: () => openNativeSettings() }
          : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* The whole card opens the picker, like the QR option. The duplicate
          notice sits beside it rather than inside, since it has a button. */}
      <ImportOptionCard
        icon={ContactRound}
        title="Import from Contacts"
        description="Choose someone from your iPhone contacts."
        onClick={handlePick}
        disabled={busy}
        testId="button-import-contact"
      />

      {duplicate && (
        <div className="-mt-1 mb-3 rounded-xl border border-cooling/25 bg-cooling-soft p-3">
          <p className="text-xs font-semibold text-cooling">
            You may already have {duplicate.name}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-cooling/85">
            Saving will create a second contact. Open the existing one instead?
          </p>
          <button
            type="button"
            onClick={() => setLocation(`/contacts/${duplicate.id}`)}
            className="mt-2 text-xs font-semibold text-cooling underline"
          >
            Open {duplicate.name}
          </button>
        </div>
      )}
    </>
  );
}
