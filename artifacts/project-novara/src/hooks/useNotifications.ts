import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/react";
import { API_BASE } from "@/lib/apiBase";
import { apiFetch } from "@/lib/api";

export interface NotificationSettings {
  pushEnabled: boolean;
  notifyDueToday: boolean;
  notifyOverdue: boolean;
  notifyStatusChange: boolean;
  notifyWeeklyDigest: boolean;
  reminderTime: string;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  pushEnabled: false,
  notifyDueToday: true,
  notifyOverdue: true,
  notifyStatusChange: true,
  notifyWeeklyDigest: false,
  reminderTime: "09:00",
};

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export type PermissionState = "default" | "granted" | "denied" | "unsupported";

function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  if (typeof e === "object" && e !== null) {
    try { return JSON.stringify(e); } catch { /* noop */ }
  }
  return String(e);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timed out: ${label} (${ms}ms)`)), ms)),
  ]);
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function useNotifications() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [permission, setPermission] = useState<PermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSupported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    if (!isSupported) {
      setPermission("unsupported");
      setLoading(false);
      return;
    }
    setPermission(Notification.permission as PermissionState);

    async function init() {
      try {
        const [settingsRes, reg] = await Promise.all([
          apiFetch(getToken, "/api/notifications/settings"),
          navigator.serviceWorker.ready,
        ]);

        if (settingsRes.ok) {
          const data = (await settingsRes.json()) as NotificationSettings;
          setSettings(data);
        }

        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch {
        // Non-fatal — user just won't have current state
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, [getToken, isLoaded, isSignedIn, isSupported]);

  const requestAndSubscribe = useCallback(async (): Promise<boolean> => {
    setError(null);

    // ── Synchronous guards (no await — the user gesture is still intact) ──────
    if (!isSupported) {
      setError("Push notifications aren't supported in this browser.");
      return false;
    }

    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (iOS && !isStandaloneDisplay()) {
      setError("On iPhone, install Novara to your Home Screen first, then enable notifications from the installed app.");
      return false;
    }

    // ── CRITICAL for iOS: call requestPermission() synchronously inside the tap
    //    handler, BEFORE any await, so the user-gesture context is preserved.
    let permPromise: Promise<NotificationPermission>;
    try {
      permPromise = Notification.requestPermission();
    } catch (e) {
      setError(describeError(e));
      return false;
    }

    try {
      const perm = await permPromise;
      setPermission(perm as PermissionState);
      if (perm !== "granted") return false;

      // Service worker readiness (timeboxed so a stuck registration surfaces).
      const reg = await withTimeout(navigator.serviceWorker.ready, 10000, "serviceWorker.ready");

      // VAPID public key.
      const keyRes = await fetch(`${API_BASE}/api/notifications/vapid-public-key`);
      if (!keyRes.ok) throw new Error("Push not configured on server");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const saveRes = await apiFetch(getToken, "/api/notifications/subscribe", {
        method: "POST",
        json: sub.toJSON(),
      });
      if (!saveRes.ok) throw new Error("Failed to save subscription");

      setIsSubscribed(true);
      setSettings((s) => ({ ...s, pushEnabled: true }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable notifications");
      return false;
    }
  }, [getToken, isSupported]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await apiFetch(getToken, "/api/notifications/subscribe", {
          method: "DELETE",
          json: { endpoint },
        });
      }
      setIsSubscribed(false);
      setSettings((s) => ({ ...s, pushEnabled: false }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disable notifications");
    }
  }, [getToken]);

  const updateSettings = useCallback(
    async (partial: Partial<NotificationSettings>): Promise<void> => {
      setError(null);
      const optimistic = { ...settings, ...partial };
      setSettings(optimistic);
      try {
        const res = await apiFetch(getToken, "/api/notifications/settings", {
          method: "PUT",
          json: partial,
        });
        if (!res.ok) throw new Error("Failed to save");
        const updated = (await res.json()) as NotificationSettings;
        setSettings(updated);
      } catch (err) {
        setSettings(settings); // rollback
        setError(err instanceof Error ? err.message : "Failed to save settings");
      }
    },
    [getToken, settings],
  );

  const sendTest = useCallback(async (): Promise<void> => {
    setError(null);
    const res = await apiFetch(getToken, "/api/notifications/test", { method: "POST" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to send test");
    }
  }, [getToken]);

  return {
    isSupported,
    permission,
    isSubscribed,
    settings,
    loading,
    error,
    requestAndSubscribe,
    unsubscribe,
    updateSettings,
    sendTest,
  };
}
