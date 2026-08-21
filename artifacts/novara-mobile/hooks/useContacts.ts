import { useState, useEffect, useCallback } from "react";
import { Contact } from "@/types/contact";
import { getContacts, saveContacts, seedDataIfNeeded, addContact, updateContact, deleteContact, markContactedToday } from "@/lib/storage";

export function useContacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    await seedDataIfNeeded();
    const data = await getContacts();
    setContacts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    const data = await getContacts();
    setContacts(data);
  }, []);

  const create = useCallback(async (
    contact: Omit<Contact, "id" | "createdAt" | "lastInteractionDate" | "nextFollowUpDate">
  ) => {
    const newContact = await addContact(contact);
    setContacts((prev) => [...prev, newContact]);
    return newContact;
  }, []);

  const update = useCallback(async (id: string, updates: Partial<Contact>) => {
    const updated = await updateContact(id, updates);
    if (updated) {
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteContact(id);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const markContacted = useCallback(async (id: string) => {
    const updated = await markContactedToday(id);
    if (updated) {
      setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
    }
    return updated;
  }, []);

  return { contacts, loading, refresh, create, update, remove, markContacted };
}
