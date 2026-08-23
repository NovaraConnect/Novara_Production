import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { fetchFeatures } from "@/lib/api";

export const FEATURES_KEY = ["features"] as const;

/** Reads the deployment's optional-capability flags. Defaults everything off
 *  while loading or on error, so gated UI stays hidden unless explicitly on. */
export function useFeatures() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const { data } = useQuery({
    queryKey: FEATURES_KEY,
    queryFn: () => fetchFeatures(getToken),
    enabled: isLoaded && isSignedIn,
    staleTime: 5 * 60_000,
  });

  return {
    aiEnrich: data?.aiEnrich ?? false,
    cardAiParse: data?.cardAiParse ?? false,
  };
}
