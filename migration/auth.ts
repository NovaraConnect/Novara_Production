/**
 * Clerk auth for React Native / Expo
 *
 * Install:
 *   npx expo install @clerk/clerk-expo expo-secure-store
 *
 * Environment variable (in .env):
 *   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
 *
 * This file exports:
 *   1. tokenCache  — SecureStore-backed token cache (required by Clerk Expo)
 *   2. ClerkProviderWrapper — drop-in root provider
 *   3. useNovaraAuth — convenience hook combining Clerk's useAuth + useUser
 *   4. AuthGuard — component that redirects unauthenticated users
 */

import * as SecureStore from "expo-secure-store";
import { ClerkProvider, useAuth, useUser } from "@clerk/clerk-expo";

// ── SecureStore token cache ───────────────────────────────────────────────────

export const tokenCache = {
  async getToken(key: string) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore write failures — Clerk will re-authenticate
    }
  },
  async clearToken(key: string) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};

// ── Root provider ─────────────────────────────────────────────────────────────

const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in .env");
}

interface ClerkProviderWrapperProps {
  children: React.ReactNode;
}

export function ClerkProviderWrapper({ children }: ClerkProviderWrapperProps) {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache}>
      {children}
    </ClerkProvider>
  );
}

// ── Convenience auth hook ─────────────────────────────────────────────────────

export function useNovaraAuth() {
  const { isSignedIn, userId, getToken, signOut } = useAuth();
  const { user } = useUser();

  return {
    isSignedIn,
    userId,
    getToken,
    signOut,
    email: user?.primaryEmailAddress?.emailAddress,
    fullName: user
      ? [user.firstName, user.lastName].filter(Boolean).join(" ")
      : null,
    imageUrl: user?.imageUrl,
  };
}

// ── Auth guard ────────────────────────────────────────────────────────────────
// Example usage with Expo Router:
//
//   export default function ProtectedLayout() {
//     return (
//       <AuthGuard fallback={<Redirect href="/sign-in" />}>
//         <Stack />
//       </AuthGuard>
//     );
//   }

import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
}

export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isSignedIn } = useAuth();
  const { isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#2941a3" />
      </View>
    );
  }

  if (!isSignedIn) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
