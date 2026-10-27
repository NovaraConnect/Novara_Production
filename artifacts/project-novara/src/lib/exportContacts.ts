import type { Contact } from "@/types/contact";
import { computeStatus, localDateString } from "@/lib/utils";
import { isNativeShell } from "@/lib/installPrompt";
import { canShareNativeFile, shareNativeFile } from "@/lib/nativeBridge";

const COLUMNS: [string, (c: Contact) => string | undefined][] = [
  ["First name", (c) => c.firstName],
  ["Last name", (c) => c.lastName],
  ["Company", (c) => c.company],
  ["Role", (c) => c.role],
  ["Email", (c) => c.email],
  ["Phone", (c) => c.phone],
  ["LinkedIn", (c) => c.linkedinUrl],
  ["Where you met", (c) => c.metAt],
  ["List", (c) => (c.connectionStatus === "pipeline" ? "Pipeline" : "Connected")],
  ["Warmth", (c) => computeStatus(c)],
  ["Priority", (c) => c.currentPriority ?? c.importance],
  ["Next follow-up", (c) => c.nextFollowUpDate],
  ["Last interaction", (c) => c.lastInteractionDate],
  ["Industry", (c) => c.industry],
  ["Interests", (c) => c.interests?.join("; ")],
  ["Notes", (c) => c.notes],
];

function cell(value: string | undefined): string {
  const v = value ?? "";
  // Quote everything that could break a row; a leading = + - @ is prefixed so
  // spreadsheet apps show it as text instead of running it as a formula.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function contactsToCsv(contacts: Contact[]): string {
  const rows = [COLUMNS.map(([h]) => h), ...contacts.map((c) => COLUMNS.map(([, get]) => get(c) ?? ""))];
  // BOM so Excel opens accented names (L'Oréal) as UTF-8.
  return "\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

/** Whether Export Data can work here. Inside the iPhone app it needs a build
 *  with the native share sheet; app versions before that cannot save files. */
export function canExportContacts(): boolean {
  return !isNativeShell() || canShareNativeFile();
}

/**
 * Hands the user a CSV of their contacts: the iOS share sheet in the iPhone
 * app (Save to Files, Mail, AirDrop), the browser's share sheet where it takes
 * files, otherwise a normal download. Returns false if the user cancelled.
 */
export async function exportContacts(contacts: Contact[]): Promise<boolean> {
  const name = `novara-contacts-${localDateString()}.csv`;
  const csv = contactsToCsv(contacts);
  if (canShareNativeFile()) return shareNativeFile(name, csv);

  const file = new File([csv], name, { type: "text/csv" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Novara contacts" });
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      throw err;
    }
  }

  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
