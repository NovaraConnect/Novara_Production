import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

// Bump this whenever a change needs to force every client to pick up a new
// service worker (this line's own content changes the SW file's hash, which
// browsers use to detect updates). Combined with precacheAndRoute's
// content-hashed asset revisions and cleanupOutdatedCaches() below, this
// guarantees stale pages (e.g. an old cached "/install" landing screen)
// cannot be served forever once a new version is deployed.
const SW_CACHE_VERSION = "2026-07-16.1";
void SW_CACHE_VERSION;

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json() as PushPayload;
  } catch {
    payload = { title: "Novara", body: event.data.text() };
  }

  const {
    title,
    body,
    icon = "/icon-192.png",
    badge = "/icon-192.png",
    tag = "novara",
    url = "/dashboard",
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data: { url },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const targetPath = (event.notification.data as { url?: string })?.url ?? "/dashboard";
  const scopeUrl = self.registration.scope;
  const targetUrl = new URL(targetPath, scopeUrl).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (clients) => {
        const existing = clients.find((c) => c.url.startsWith(scopeUrl)) as
          | WindowClient
          | undefined;
        if (existing) {
          await existing.navigate(targetUrl);
          await existing.focus();
        } else {
          await self.clients.openWindow(targetUrl);
        }
      }),
  );
});
