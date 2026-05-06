// foodyadmin/src/lib/push.ts
//
// Client-side helpers for the foodyadmin Web Push subscription flow.
// The service worker (public/sw.js) shows the actual notifications; this
// module just owns the subscribe / unsubscribe handshake with both the
// browser's PushManager and our server.
//
// iOS Safari only delivers Web Push to PWAs added to the home screen — the
// `getEnvironment` helper exposes that distinction so the UI can guide the
// user to "Add to Home Screen" before offering the toggle.

import { getToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export type PushPermissionState = 'unsupported' | 'denied' | 'default' | 'granted';

export interface PushEnvironment {
  /** True when the browser exposes both the Notification API and PushManager. */
  supported: boolean;
  /** True when the page is running as an installed PWA (standalone display). */
  isStandalone: boolean;
  /** True when the device is iOS and Safari is the host. */
  isIOS: boolean;
  /** Current Notification permission state, or "unsupported". */
  permission: PushPermissionState;
}

/** Inspect the runtime environment to decide whether push is reachable here. */
export function getEnvironment(): PushEnvironment {
  if (typeof window === 'undefined') {
    return { supported: false, isStandalone: false, isIOS: false, permission: 'unsupported' };
  }
  const supported =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // iOS detection — UA-based because there's no DOM API for it. Catches
  // iPhone, iPad (iPadOS reports MacIntel + touch), iPod.
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && 'ontouchend' in document);

  // PWA-installed detection. The matchMedia route is what Apple recommends;
  // navigator.standalone is iOS-specific legacy.
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // @ts-expect-error — iOS Safari only
    window.navigator.standalone === true;

  const permission: PushPermissionState = supported
    ? (Notification.permission as PushPermissionState)
    : 'unsupported';

  return { supported, isStandalone, isIOS, permission };
}

/** Convert a URL-safe base64 VAPID key to the Uint8Array PushManager wants.
 *  Backed by an explicit ArrayBuffer (not ArrayBufferLike) so the result is
 *  assignable to BufferSource without TypeScript widening complaints. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function authedFetch(path: string, restaurantId: number, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Restaurant-ID': String(restaurantId),
      ...(init?.headers as Record<string, string>),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `push api ${res.status}`);
  }
  return res;
}

interface VapidKeyResponse {
  public_key: string;
}

/** Fetch the server's VAPID public key (cached, but cheap so we don't bother). */
async function fetchVapidPublicKey(restaurantId: number): Promise<string> {
  const res = await authedFetch('/api/v1/admin/push/vapid-public-key', restaurantId);
  const data = (await res.json()) as VapidKeyResponse;
  return data.public_key;
}

/** Lookup an existing push subscription if any. Returns null when none exists. */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!getEnvironment().supported) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * Subscribe this device to push for the given restaurant. Caller is
 * responsible for ensuring permission was granted (this throws otherwise).
 * The returned subscription is also persisted server-side; if the server
 * call fails the subscription is rolled back so we don't drift.
 */
export async function subscribe(restaurantId: number): Promise<PushSubscription> {
  if (!getEnvironment().supported) {
    throw new Error('Push not supported in this browser');
  }
  if (Notification.permission !== 'granted') {
    const next = await Notification.requestPermission();
    if (next !== 'granted') {
      throw new Error('Notification permission denied');
    }
  }

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;

  const publicKey = await fetchVapidPublicKey(restaurantId);
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  try {
    const json = sub.toJSON();
    await authedFetch('/api/v1/admin/push/subscribe', restaurantId, {
      method: 'POST',
      body: JSON.stringify({
        endpoint: sub.endpoint,
        p256dh_key: json.keys?.p256dh ?? '',
        auth_key: json.keys?.auth ?? '',
      }),
    });
  } catch (err) {
    // Server rejected — undo the local subscribe so we stay in sync.
    await sub.unsubscribe().catch(() => {});
    throw err;
  }
  return sub;
}

/** Unsubscribe this device — both locally and server-side. Idempotent. */
export async function unsubscribe(restaurantId: number): Promise<void> {
  if (!getEnvironment().supported) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  // Tell the server first; if that fails we still want to honor the user's
  // request locally so we don't keep receiving pushes.
  try {
    await authedFetch('/api/v1/admin/push/unsubscribe', restaurantId, {
      method: 'POST',
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[push] server unsubscribe failed (continuing locally):', err);
  }
  await sub.unsubscribe();
}

export interface TestSendResult {
  /** Number of subscriptions for the calling user that received the push. */
  sent: number;
  /** Total subscriptions on file for the calling user (includes any that
   *  failed silently — useful for "0 of 2" diagnostics). */
  subscriptions_count: number;
}

/**
 * Send a sample push to every subscription belonging to the current user
 * for this restaurant. Server-side endpoint; the round-trip means a few
 * seconds may pass before the OS actually shows the notification.
 */
export async function sendTestPush(restaurantId: number): Promise<TestSendResult> {
  const res = await authedFetch('/api/v1/admin/push/test', restaurantId, {
    method: 'POST',
  });
  return (await res.json()) as TestSendResult;
}
