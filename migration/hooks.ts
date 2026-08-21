/**
 * TanStack Query hooks for React Native / Expo
 *
 * Dependencies:
 *   @tanstack/react-query
 *   @clerk/clerk-expo  (for useAuth)
 *
 * Usage:
 *   Wrap your app in <QueryClientProvider client={queryClient}> (see queryClient.ts)
 *   then call these hooks inside screens/components.
 *
 * Note: All hooks call useAuth() internally so they must be used inside
 *       a ClerkProvider tree.
 */

import { useQuery, useMutation, useQueryClient, QueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";
import type { Contact, UserSettings } from "./types";
import {
  fetchContacts,
  createContact,
  updateContact as apiUpdateContact,
  deleteContact as apiDeleteContact,
  markContactedToday as apiMarkContacted,
  importContacts,
  fetchSettings,
  saveSettings,
  getCompanyNews,
} from "./api";

// ── Query keys ────────────────────────────────────────────────────────────────

export const CONTACTS_KEY = ["contacts"] as const;
export const SETTINGS_KEY = ["settings"] as const;
export const COMPANY_NEWS_KEY = (company: string) => ["company-news", company] as const;

// ── useContacts ───────────────────────────────────────────────────────────────

export function useContacts() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: contacts = [], isLoading, error } = useQuery({
    queryKey: CONTACTS_KEY,
    queryFn: () => fetchContacts(getToken),
    staleTime: 30_000,
    retry: (count, err: Error) => {
      if (err.message === "Unauthorized") return false;
      return count < 2;
    },
  });

  const addContact = useMutation({
    mutationFn: (data: Parameters<typeof createContact>[0]) =>
      createContact(data, getToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const updateContact = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Contact> }) =>
      apiUpdateContact(id, data, getToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const removeContact = useMutation({
    mutationFn: (id: string) => apiDeleteContact(id, getToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const markContacted = useMutation({
    mutationFn: (id: string) => apiMarkContacted(id, getToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  const importFromStorage = useMutation({
    mutationFn: (contacts: object[]) => importContacts(contacts, getToken),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONTACTS_KEY }),
  });

  return {
    contacts,
    isLoading,
    error,
    addContact,
    updateContact,
    removeContact,
    markContacted,
    importFromStorage,
  };
}

// ── useSettings ───────────────────────────────────────────────────────────────

export function useSettings() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => fetchSettings(getToken),
    staleTime: 60_000,
    retry: (count, err: Error) => {
      if (err.message === "Unauthorized") return false;
      return count < 2;
    },
  });

  const updateSettings = useMutation({
    mutationFn: (data: Partial<UserSettings>) => saveSettings(data, getToken),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(SETTINGS_KEY, updated);
      queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
      const careerProfileChanged =
        variables.careerGoals !== undefined ||
        variables.goalTags !== undefined ||
        variables.careerStatement !== undefined;
      if (careerProfileChanged) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: CONTACTS_KEY });
        }, 1500);
      }
    },
  });

  return { settings, isLoading, error, updateSettings };
}

// ── useCompanyNews ────────────────────────────────────────────────────────────

export function useCompanyNews(company: string | undefined) {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: COMPANY_NEWS_KEY(company ?? ""),
    queryFn: () => getCompanyNews(company!, getToken),
    enabled: !!company && company.length > 0,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — mirrors the web app's localStorage TTL
    retry: 1,
  });
}

// ── Cache invalidation on sign-in/out ─────────────────────────────────────────
// Call this in your root navigator when the Clerk userId changes.
// Example:
//   const { userId } = useAuth();
//   useEffect(() => { if (!userId) queryClient.clear(); }, [userId]);
export function clearCacheOnSignOut(queryClient: QueryClient, userId: string | null | undefined) {
  if (!userId) {
    queryClient.clear();
  }
}
