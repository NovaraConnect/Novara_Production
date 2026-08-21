/**
 * TanStack Query client for React Native / Expo
 *
 * Install:
 *   npx expo install @tanstack/react-query
 *
 * Usage in App.tsx (or _layout.tsx for Expo Router):
 *
 *   import { QueryClientProvider } from "@tanstack/react-query";
 *   import { queryClient } from "./migration/queryClient";
 *
 *   export default function RootLayout() {
 *     return (
 *       <QueryClientProvider client={queryClient}>
 *         <YourNavigator />
 *       </QueryClientProvider>
 *     );
 *   }
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error: Error) => {
        if (error.message === "Unauthorized") return false;
        return count < 2;
      },
    },
  },
});

/**
 * Call this when the user signs out to clear all cached data
 * and prevent data leaking across sessions.
 *
 * Usage with Clerk in your root navigator:
 *
 *   const { userId } = useAuth();
 *   const prevUserIdRef = useRef<string | null | undefined>(undefined);
 *
 *   useEffect(() => {
 *     if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
 *       clearQueryCache();
 *     }
 *     prevUserIdRef.current = userId ?? null;
 *   }, [userId]);
 */
export function clearQueryCache() {
  queryClient.clear();
}
