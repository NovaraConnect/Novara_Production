import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { fetchHealthTrend } from "@/lib/api";

/** Network Health from about a month ago, or null until there is a month of
 *  history. Asking also records today's score on the server. */
export function useHealthTrend() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { data } = useQuery({
    queryKey: ["health-trend"],
    queryFn: () => fetchHealthTrend(getToken),
    enabled: isLoaded && isSignedIn,
    staleTime: 60 * 60_000,
  });
  return data ?? null;
}
