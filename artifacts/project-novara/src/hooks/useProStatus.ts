import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { fetchProStatus, type ProStatus } from "@/lib/api";

export const PRO_STATUS_KEY = ["entitlements", "me"] as const;

/** The server's Pro status for the signed-in user.
 *
 *  `isKnown` is false only while the first answer is pending. An error counts
 *  as known-and-not-Pro here, which is the safe default: the server enforces the
 *  Free limit either way, so this only controls what the screen shows. */
export function useProStatus(): {
  status: ProStatus | undefined;
  isKnown: boolean;
  isPro: boolean;
  refetch: () => Promise<unknown>;
} {
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const query = useQuery({
    queryKey: PRO_STATUS_KEY,
    queryFn: () => fetchProStatus(getToken),
    enabled: isLoaded && isSignedIn,
    staleTime: 60_000,
    retry: (count, err: Error) => {
      if (err.message === "Unauthorized") return false;
      return count < 2;
    },
  });

  return {
    status: query.data,
    isKnown: query.data !== undefined || query.isError,
    isPro: query.data?.pro === true,
    refetch: query.refetch,
  };
}
