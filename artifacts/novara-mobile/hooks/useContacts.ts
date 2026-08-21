import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useEffect, useState } from "react";

import {
  createContact,
  deleteContact,
  fetchContacts,
  markContactedToday,
  updateContact,
  type NewContactInput,
} from "@/lib/backendApi";
import { Contact } from "@/types/contact";

/**
 * Contacts backed by the authenticated backend. Same public shape as before, so
 * screens are unchanged. Data is per-user (scoped by the Clerk session token);
 * the old on-device AsyncStorage store is no longer the source of truth — it is
 * kept only as a one-time import source (see lib/localImport.ts).
 */
export function useContacts() {
  const { getToken } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContacts(await fetchContacts(getToken));
    } catch {
      // Network/auth error: keep whatever is already shown rather than wiping it.
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    try {
      setContacts(await fetchContacts(getToken));
    } catch {
      // ignore transient refresh failures
    }
  }, [getToken]);

  const create = useCallback(
    async (data: NewContactInput) => {
      const created = await createContact(getToken, data);
      setContacts((prev) => [...prev, created]);
      return created;
    },
    [getToken],
  );

  const update = useCallback(
    async (id: string, updates: Partial<Contact>) => {
      const updated = await updateContact(getToken, id, updates);
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    [getToken],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteContact(getToken, id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    },
    [getToken],
  );

  const markContacted = useCallback(
    async (id: string) => {
      const updated = await markContactedToday(getToken, id);
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
      return updated;
    },
    [getToken],
  );

  return { contacts, loading, refresh, create, update, remove, markContacted };
}
