import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import {
  fetchContacts,
  createContact,
  updateContact as apiUpdateContact,
  deleteContact as apiDeleteContact,
  markContactedToday as apiMarkContacted,
  importContactsFromLocalStorage,
} from "@/lib/api";
import { Contact } from "@/types/contact";

export const CONTACTS_KEY = ["contacts"] as const;

export function useContacts() {
  const queryClient = useQueryClient();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const { data: contacts = [], isLoading, error } = useQuery({
    queryKey: CONTACTS_KEY,
    queryFn: () => fetchContacts(getToken),
    enabled: isLoaded && isSignedIn,
    staleTime: 30_000,
    retry: (count, err: Error) => {
      if (err.message === "Unauthorized") return false;
      return count < 2;
    },
  });

  const addContact = useMutation({
    mutationFn: (data: Parameters<typeof createContact>[1]) =>
      createContact(getToken, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const updateContact = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      apiUpdateContact(getToken, id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const removeContact = useMutation({
    mutationFn: (id: string) => apiDeleteContact(getToken, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const markContacted = useMutation({
    mutationFn: (id: string) => apiMarkContacted(getToken, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const importFromStorage = useMutation({
    mutationFn: (contacts: object[]) => importContactsFromLocalStorage(getToken, contacts),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  return {
    contacts,
    isLoading: !isLoaded || isLoading,
    error,
    addContact,
    updateContact,
    removeContact,
    markContacted,
    importFromStorage,
  };
}
