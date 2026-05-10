'use client';

import { useEffect } from 'react';

/**
 * Registers the foodyadmin service worker on app boot. The SW handles Web
 * Push events (see public/sw.js); without it, push subscription on the
 * client would fail because there's no `registration.pushManager`.
 *
 * Skipped on the dev server unless explicitly enabled — Next.js HMR can
 * conflict with an active SW and the cached SW often sticks around past
 * code changes, leading to confusing stale-script bugs during development.
 * Enable for local push testing with `NEXT_PUBLIC_ENABLE_SW=1`.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev && process.env.NEXT_PUBLIC_ENABLE_SW !== '1') return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        // Don't crash the app if registration fails — push is opt-in and the
        // rest of the app must work without it. Log so we can spot recurring
        // issues in real user sessions.
        // eslint-disable-next-line no-console
        console.warn('[sw] registration failed:', err);
      });
  }, []);

  return null;
}
