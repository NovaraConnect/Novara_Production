import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { fetchProStatus, reportLocalStoreKitEntitlement, type GetAuthToken, type ProStatus } from "@/lib/api";
import { getLocalStoreKitEntitlement } from "@/lib/nativeBridge";
import { useFeatures } from "@/hooks/useFeatures";

export const PRO_STATUS_KEY = ["entitlements", "me"] as const;

/**
 * Reads the server's Pro status.
 *
 * Local testing only: when the API says it accepts simulator StoreKit reports
 * AND this is a StoreKit Test build, the simulator's current StoreKit
 * subscription is sent to the API first (in place of the RevenueCat webhook,
 * which never fires for Xcode test purchases). Everywhere else this is just
 * the status read.
 */
export async function readProStatus(getToken: GetAuthToken, localStoreKitTest: boolean): Promise<ProStatus> {
  if (localStoreKitTest) {
    const entitlement = await getLocalStoreKitEntitlement().catch(() => null);
    if (entitlement) await reportLocalStoreKitEntitlement(getToken, entitlement).catch(() => undefined);
  }
  return fetchProStatus(getToken);
}

/** The server's Pro status for the signed-in user.
 *
 *  `isKnown` is false only while the first answer is pending. An error counts
 *  as known-and-not-Pro here, which is the safe default: the server enforces
 *  every rule either way, so this only controls what the screen shows. */
export function useProStatus(): {
  status: ProStatus | undefined;
  isKnown: boolean;
  isPro: boolean;
  refetch: () => Promise<unknown>;
} {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { localStoreKitTest } = useFeatures();

  const query = useQuery({
    queryKey: PRO_STATUS_KEY,
    queryFn: () => readProStatus(getToken, localStoreKitTest),
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
