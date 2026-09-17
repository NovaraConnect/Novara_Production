import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { fetchFeatures, readCachedFeatures } from "@/lib/api";

export const FEATURES_KEY = ["features"] as const;

/** Reads the deployment's optional-capability flags.
 *
 *  An unreachable API must not remove features from the screen. When the call
 *  fails, React Query keeps the last successful answer for this session, and
 *  `readCachedFeatures()` supplies it across reloads — so a feature the server
 *  has already said yes to stays put through an outage. Only a fresh install
 *  that has never once reached the API sees everything off.
 *
 *  Turning a feature off remotely still works: that is a reachable server
 *  answering `false`, which overwrites the cache like any other success. */
export function useFeatures() {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const { data } = useQuery({
    queryKey: FEATURES_KEY,
    queryFn: () => fetchFeatures(getToken),
    enabled: isLoaded && isSignedIn,
    staleTime: 5 * 60_000,
    initialData: readCachedFeatures() ?? undefined,
    retry: (count, err: Error) => {
      if (err.message === "Unauthorized") return false;
      return count < 2;
    },
  });

  return {
    aiEnrich: data?.aiEnrich ?? false,
    cardAiParse: data?.cardAiParse ?? false,
    linkedinAiParse: data?.linkedinAiParse ?? false,
    linkedinScreenshotImport: data?.linkedinScreenshotImport ?? false,
  };
}
