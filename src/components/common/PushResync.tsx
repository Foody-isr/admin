'use client';

import { useEffect } from 'react';
import { syncSubscription } from '@/lib/push';

/**
 * Silent, app-wide self-heal for Web Push subscriptions. Mounted in the
 * authenticated restaurant layout so it runs on every app open. When
 * notification permission is already granted, it re-registers this device's
 * *current* push endpoint with the server — repairing the "iOS rotated the
 * subscription, the server is still pointing at a dead endpoint, pushes
 * silently stopped" failure mode without the user having to open Settings and
 * toggle anything.
 *
 * Also listens for the service worker's `foody-push-resync` message (fired
 * from the SW's `pushsubscriptionchange` handler) so a rotation that happens
 * while the app is open heals immediately rather than on next launch.
 *
 * Renders nothing. `syncSubscription` no-ops when push is unsupported,
 * permission isn't granted, or no service worker is registered (dev), and
 * never throws — so this is safe to mount unconditionally.
 */
export function PushResync({ restaurantId }: { restaurantId: number }) {
  useEffect(() => {
    if (!Number.isFinite(restaurantId) || restaurantId <= 0) return;

    // Fire-and-forget on mount.
    void syncSubscription(restaurantId);

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'foody-push-resync') {
        void syncSubscription(restaurantId);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [restaurantId]);

  return null;
}
