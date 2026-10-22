import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { fetchEntitlement } from "@/lib/universityApi";
import { useFeatures } from "@/hooks/useFeatures";

export const ENTITLEMENT_KEY = ["entitlement", "university"] as const;

/** The signed-in user's university access. Asks the server only when the
 *  server flag is on, so with the feature off this makes no request at all. */
export function useUniversityEntitlement() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { universityAccess } = useFeatures();
  const { data, isLoading, error } = useQuery({
    queryKey: ENTITLEMENT_KEY,
    queryFn: () => fetchEntitlement(getToken),
    enabled: isLoaded && !!isSignedIn && universityAccess,
    staleTime: 60_000,
  });
  return { active: data?.active ?? false, entitlement: data, isLoading, error };
}
