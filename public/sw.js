// Foody Admin service worker — v3.
// Intentionally minimal: only handles Web Push events. No caching / offline
// support yet (that's a separate concern; conflating them makes both harder
// to debug). Bump the version string on any structural change so clients
// upgrade.
const SW_VERSION = 'foody-admin-sw-v3';

self.addEventListener('install', () => {
  // Activate immediately on first install / update so push events flow as
  // soon as the user accepts notifications. No precaching.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Web Push handler. Server sends an encrypted payload via the Web Push
// protocol; the browser wakes the SW, hands us the data, and we display the
// notification. If parsing fails we still show a generic notification so the
// user gets _something_ rather than the browser's default "[site] sent a
// notification" placeholder.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'Foody Admin', body: event.data?.text?.() ?? '' };
  }

  const title = data.title || 'Foody Admin';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icons/icon-192.png',
    badge: data.badge || '/icons/icon-192.png',
    tag: data.tag,
    renotify: Boolean(data.tag) && Boolean(data.renotify),
    data: {
      url: data.url || '/',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Subscription rotation. iOS (and desktop browsers) fire this when the push
// service invalidates and reissues our subscription — on OS update, PWA
// offload under storage pressure, or periodic key refresh. If we don't
// re-subscribe here the server's stored endpoint goes stale and pushes
// silently stop until the user manually re-enables. We re-subscribe with the
// same VAPID key, then ping any open client so the app re-registers the fresh
// endpoint with the server. The SW itself can't make that authenticated call:
// the JWT lives in the app's localStorage, which is unreachable from here — so
// the app's on-open re-sync (see lib/push.ts::syncSubscription) is the backstop
// when no client is open to receive the ping.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const appServerKey =
          event.oldSubscription?.options?.applicationServerKey ||
          event.newSubscription?.options?.applicationServerKey;
        let sub =
          event.newSubscription ||
          (await self.registration.pushManager.getSubscription());
        if (!sub && appServerKey) {
          sub = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey,
          });
        }
        const clients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });
        for (const client of clients) {
          client.postMessage({ type: 'foody-push-resync' });
        }
      } catch (_) {
        // Best-effort — the app's on-open re-sync repairs it next launch.
      }
    })(),
  );
});

// Notification click — focus an existing tab on the target URL when
// possible, otherwise open a new one. Same-origin only.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const target = new URL(targetUrl, self.location.origin);

      // Try to focus an existing tab on the same origin first; navigate it
      // to the target URL if it's not already there.
      for (const client of all) {
        if (new URL(client.url).origin === target.origin) {
          await client.focus();
          if (new URL(client.url).pathname !== target.pathname) {
            await client.navigate(target.href).catch(() => {});
          }
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});

// Optional: respond to a "ping" message so the client can verify the SW is
// alive after registration. Useful for debug pages.
self.addEventListener('message', (event) => {
  if (event.data === 'ping') {
    event.source?.postMessage({ pong: true, version: SW_VERSION });
  }
});
