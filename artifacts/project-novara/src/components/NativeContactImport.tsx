import { useState } from "react";
import { ContactRound, Loader2, Lock, ShieldCheck, UserRound } from "lucide-react";
import { ImportOptionCard, ImportPrimaryButton, InfoRow } from "@/components/ImportOptionCard";
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
export type PossibleDuplicate = { id: string; name: string };

export function NativeContactImport({
  onExtracted,
}: {
  /** `duplicate` is an existing contact this one may repeat; the page shows
   *  the warning next to the form the details land in. */
  onExtracted: (data: ScannedContact & { linkedinUrl?: string; photo?: string }, duplicate: PossibleDuplicate | null) => void;
}) {
  const { contacts } = useContacts();
  const [busy, setBusy] = useState(false);

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
    onExtracted(
      fields,
      existing ? { id: existing.id, name: `${existing.firstName} ${existing.lastName}`.trim() } : null,
    );
    haptic("success");
    toast.success("Contact imported — review the details before saving");
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
    <ImportOptionCard
      icon={ContactRound}
      title="Import from your contacts"
      description="Choose someone from your iPhone contacts. Novara only sees the one you select."
      info={
        <>
          <InfoRow icon={Lock} title="Your contacts stay private">
            Apple's own picker opens. Novara only receives the contact you choose.
          </InfoRow>
          <InfoRow icon={ShieldCheck} title="Nothing else is read">
            Novara doesn't read, store or sync the rest of your address book.
          </InfoRow>
        </>
      }
    >
      <ImportPrimaryButton onClick={handlePick} disabled={busy} data-testid="button-import-contact">
        {busy ? <Loader2 className="animate-spin" /> : <UserRound />}
        Choose a Contact
      </ImportPrimaryButton>
    </ImportOptionCard>
  );
}
