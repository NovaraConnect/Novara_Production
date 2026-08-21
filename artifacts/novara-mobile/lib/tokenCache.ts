import * as SecureStore from "expo-secure-store";

/**
 * Clerk token cache backed by the native secure store (iOS Keychain /
 * Android Keystore) via expo-secure-store. Keeps the Clerk session token out
 * of AsyncStorage/plaintext. Shape matches Clerk's TokenCache
 * (getToken / saveToken / clearToken).
 */
export const tokenCache = {
  async getToken(key: string): Promise<string | null | undefined> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // SecureStore unavailable (e.g. web) — fail closed to "signed out".
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // A failed save just means the user re-authenticates next launch.
    }
  },
  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // no-op
    }
  },
};
