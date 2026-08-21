import AsyncStorage from "@react-native-async-storage/async-storage";

import { GetToken } from "@/lib/api";
import { importContacts } from "@/lib/backendApi";
import { getContacts } from "@/lib/storage";
import { Contact } from "@/types/contact";

/**
 * One-time migration of on-device (AsyncStorage) contacts into the authenticated
 * backend. Non-destructive: local contacts are NEVER deleted here — they remain
 * as a backup. Idempotent: the server import dedups (ON CONFLICT DO NOTHING) and
 * a local flag prevents re-prompting once the user has imported.
 */
const MIGRATION_FLAG = "novara_migrated_v1";

export async function hasMigratedLocalContacts(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MIGRATION_FLAG)) === "true";
  } catch {
    return false;
  }
}

export async function markLocalContactsMigrated(): Promise<void> {
  try {
    await AsyncStorage.setItem(MIGRATION_FLAG, "true");
  } catch {
    // If the flag can't be written the worst case is a repeat prompt; the
    // import itself stays idempotent server-side, so no data is harmed.
  }
}

/** The local contacts currently on this device (import source / backup). */
export async function getLocalContacts(): Promise<Contact[]> {
  return getContacts();
}

/**
 * Import all local contacts into the backend, then mark migration done.
 * Only marks done AFTER a successful import, so a failure leaves the local data
 * and the pending state intact for a retry.
 */
export async function importLocalContactsToBackend(
  getToken: GetToken,
): Promise<{ imported: number; skipped: number }> {
  const local = await getContacts();
  const result = await importContacts(getToken, local);
  await markLocalContactsMigrated();
  return result;
}
