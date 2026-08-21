import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { fetchSettings, saveSettings } from "@/lib/api";
import { UserSettings } from "@/types/contact";

export const SETTINGS_KEY = ["settings"] as const;

const DEFAULT_SETTINGS: UserSettings = {
  autoDowngradeAfterMonths: 6,
  careerStatement: "",
  careerGoals: [],
  goalTags: [],
  hasSeenTutorial: true,
};

export function useSettings() {
  const queryClient = useQueryClient();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const { data: settings = DEFAULT_SETTINGS, isLoading } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => fetchSettings(getToken),
    enabled: isLoaded && isSignedIn,
    staleTime: 60_000,
    retry: (count, err: Error) => {
      if (err.message === "Unauthorized") return false;
      return count < 2;
    },
  });

  const updateSettings = useMutation({
    mutationFn: (data: Partial<UserSettings>) => saveSettings(getToken, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(SETTINGS_KEY, updated);
      // The server recalculates all non-overridden contacts synchronously as
      // part of PUT /settings, so by the time this resolves the DB is already
      // consistent. We simply refetch once — no hardcoded timeout, and the
      // mutation's isPending state IS the "recalculating" indicator. Any
      // recalculation error is returned on `updated.recalculation`.
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });

  return { settings, isLoading: !isLoaded || isLoading, updateSettings };
}
