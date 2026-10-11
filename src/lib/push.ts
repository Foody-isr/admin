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

// A browser has one subscription. Serialize manual changes and background repair
// so a slow repair cannot recreate a row after a confirmed local disable.
let subscriptionWork: Promise<unknown> = Promise.resolve();
let localStopRequested = false;
function serializeSubscription<T>(work: () => Promise<T>): Promise<T> {
  const result = subscriptionWork.then(work, work);
  subscriptionWork = result.catch(() => undefined);
  return result;
}

/** Browser failures with stable codes for translated, endpoint-free UI messages. */
export class PushClientError extends Error {
  constructor(public code: 'unsupported' | 'permissionDenied' | 'workerUnavailable' | 'noSubscription' | 'localStopFailed') {
    super(code);
    this.name = 'PushClientError';
  }
}

/** Keep the two unsubscribe receipts separate when only one side succeeds. */
export class PushUnsubscribeError extends Error {
  constructor(public serverRemoved: boolean, public browserRemoved: boolean) {
    super('Push unsubscribe incomplete');
    this.name = 'PushUnsubscribeError';
  }
}


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
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Constant-time-irrelevant byte equality between two BufferSources — used to
 *  detect VAPID key rotation between an existing browser subscription and
 *  the server's current key. */
function buffersEqual(
  a: ArrayBuffer | ArrayBufferView | null,
  b: ArrayBuffer | ArrayBufferView,
): boolean {
  if (!a) return false;
  const av = a instanceof ArrayBuffer ? new Uint8Array(a) : new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const bv = b instanceof ArrayBuffer ? new Uint8Array(b) : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  if (av.byteLength !== bv.byteLength) return false;
  for (let i = 0; i < av.byteLength; i++) if (av[i] !== bv[i]) return false;
  return true;
}

/**
 * Subscribe this device to push for the given restaurant. Caller is
 * responsible for ensuring permission was granted (this throws otherwise).
 * The returned subscription is also persisted server-side via an idempotent
 * upsert.
 *
 * Two recovery paths covered:
 *   1. Server lost the row (or never had it because an earlier POST failed
 *      after the local sub was created): we always re-POST on every
 *      subscribe call, which the server upserts on the unique endpoint.
 *   2. VAPID key rotated since the browser last subscribed: we compare the
 *      stored applicationServerKey against the server's current public key
 *      and force a clean unsubscribe + resubscribe when they differ —
 *      otherwise the stored endpoint would be unreachable.
 */
export async function subscribe(restaurantId: number): Promise<PushSubscription> {
  if (!getEnvironment().supported) {
    throw new PushClientError('unsupported');
  }
  if (Notification.permission !== 'granted') {
    const next = await Notification.requestPermission();
    if (next !== 'granted') {
      throw new PushClientError('permissionDenied');
    }
  }

  return serializeSubscription(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg?.active) throw new PushClientError('workerUnavailable');
    const sub = await persistSubscription(restaurantId, reg);
    localStopRequested = false;
    return sub;
  });
}

/**
 * Ensure a valid browser subscription exists (creating or repairing one if the
 * VAPID key rotated) and upsert it server-side. Shared by `subscribe` (which
 * first requests permission) and `syncSubscription` (which assumes permission
 * was already granted). Idempotent on the unique endpoint column.
 */
async function persistSubscription(
  restaurantId: number,
  reg: ServiceWorkerRegistration,
): Promise<PushSubscription> {
  const publicKey = await fetchVapidPublicKey(restaurantId);
  const appServerKey = urlBase64ToUint8Array(publicKey);

  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const existingKey = sub.options.applicationServerKey;
    if (!buffersEqual(existingKey, appServerKey)) {
      await stopLocalSubscription(reg, sub);
      sub = null;
    }
  }
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: appServerKey,
    });
  }

  const json = sub.toJSON();
  await authedFetch('/api/v1/admin/push/subscribe', restaurantId, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: sub.endpoint,
      p256dh_key: json.keys?.p256dh ?? '',
      auth_key: json.keys?.auth ?? '',
    }),
  });
  return sub;
}

/**
 * Background self-heal, safe to call on every app open. When the user has
 * already granted permission, re-registers this device's *current* endpoint
 * with the server. This fixes the silent-death failure mode where iOS rotates
 * a PWA's push subscription (on OS update, app offload, or periodic refresh):
 * the browser gets a fresh endpoint but the old one — the only one the server
 * knows — goes stale, so pushes stop until the user manually re-enables. A
 * quiet re-sync keeps the server pointed at the live endpoint.
 *
 * No-ops (returns false) when push isn't supported, permission isn't granted,
 * or no service worker is registered (e.g. dev without NEXT_PUBLIC_ENABLE_SW).
 * Uses `getRegistration()` rather than `serviceWorker.ready` so it can't hang
 * forever when no SW exists. Never throws — failures are logged, not fatal.
 */
export async function syncSubscription(restaurantId: number): Promise<boolean> {
  return serializeSubscription(async () => {
    try {
      const env = getEnvironment();
      if (localStopRequested || !env.supported || env.permission !== 'granted') return false;
      const reg = await navigator.serviceWorker.getRegistration();
      // Permission alone is not consent to re-enable a subscription the user
      // deliberately removed. Repair only a currently subscribed browser.
      if (!reg?.active || !await reg.pushManager.getSubscription()) return false;
      await persistSubscription(restaurantId, reg);
      return true;
    } catch {
      // Background repair cannot report an endpoint or credentials in logs.
      // eslint-disable-next-line no-console
      console.warn('[push] background re-sync failed');
      return false;
    }
  });
}

async function stopLocalSubscription(reg: ServiceWorkerRegistration, sub: PushSubscription): Promise<void> {
  const stopped = await sub.unsubscribe();
  if (!stopped && (await reg.pushManager.getSubscription())?.endpoint === sub.endpoint) {
    throw new PushClientError('localStopFailed');
  }
}

/** Finish only the local phase after a server removal has been acknowledged. */
export async function unsubscribeLocally(): Promise<void> {
  localStopRequested = true;
  return serializeSubscription(async () => {
    if (!getEnvironment().supported) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (reg && sub) await stopLocalSubscription(reg, sub);
  });
}

/** Stop delivery locally even if the server is unavailable, reporting each phase. */
export async function unsubscribe(restaurantId: number): Promise<void> {
  localStopRequested = true;
  return serializeSubscription(async () => {
    if (!getEnvironment().supported) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!reg || !sub) return;
    let serverRemoved = false;
    let browserRemoved = false;
    try {
      await authedFetch('/api/v1/admin/push/unsubscribe', restaurantId, {
        method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      serverRemoved = true;
    } catch { /* The local stop must still be attempted; the receipt below reports failure. */ }
    try {
      await stopLocalSubscription(reg, sub);
      browserRemoved = true;
    } catch { /* Report this phase separately so a retry does not repeat the server write. */ }
    if (!serverRemoved || !browserRemoved) throw new PushUnsubscribeError(serverRemoved, browserRemoved);
  });
}

export interface TestSendResult {
  /** Number of subscriptions that received the push (of those tested). */
  sent: number;
  /** How many subscriptions were tested. When scoped to this device it's
   *  0 or 1; useful for "0 of N" diagnostics. */
  subscriptions_count: number;
  /** False only when the test was scoped to this device's endpoint and the
   *  server had no row for it — i.e. "you're not subscribed on this device". */
  current_device_known: boolean;
}

/**
 * Send a sample push to *this device's* subscription for the given restaurant.
 * We pass the current browser endpoint so the result reflects the phone/computer
 * the user is actually holding — an aggregate across every device the user ever
 * registered would report "sent" even when this device gets nothing. The server
 * round-trip means a few seconds may pass before the OS shows the notification.
 */
export async function sendTestPush(restaurantId: number): Promise<TestSendResult> {
  const sub = await getCurrentSubscription();
  if (!sub?.endpoint) throw new PushClientError('noSubscription');
  const res = await authedFetch('/api/v1/admin/push/test', restaurantId, {
    method: 'POST',
    body: JSON.stringify({ endpoint: sub.endpoint }),
  });
  return (await res.json()) as TestSendResult;
}

/** One push-subscribed device belonging to the current user, as shown in the
 *  settings "your devices" list. The raw endpoint is never exposed — only a
 *  short tail so the client can flag which row is the current device. */
export interface PushDevice {
  id: number;
  label: string;
  endpoint_tail: string;
  created_at: string;
  last_used_at: string;
}

/** List the current user's push-subscribed devices for this restaurant. */
export async function listDevices(restaurantId: number): Promise<PushDevice[]> {
  const res = await authedFetch('/api/v1/admin/push/devices', restaurantId);
  const data = (await res.json()) as { devices?: PushDevice[] };
  return data.devices ?? [];
}

/** Remove one server row, optionally stopping this browser in the same serialized operation. */
export async function removeDevice(restaurantId: number, id: number, stopBrowser = false): Promise<void> {
  if (stopBrowser) localStopRequested = true;
  await serializeSubscription(async () => {
    await authedFetch(`/api/v1/admin/push/devices/${id}`, restaurantId, { method: 'DELETE' });
    if (!stopBrowser) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (reg && sub) await stopLocalSubscription(reg, sub);
    } catch {
      throw new PushUnsubscribeError(true, false);
    }
  });
}

/** Per-event opt-ins persisted on staff_notification_preferences. Shared
 *  between Web Push and the (parked) native iOS push pipeline; each event
 *  here gates one notification kind across both channels. */
export interface NotificationPreferences {
  new_order_enabled: boolean;
  order_canceled_enabled: boolean;
  low_stock_enabled: boolean;
  big_order_enabled: boolean;
  payment_failure_enabled: boolean;
  big_order_threshold: number;
}

export type NotificationPreferencesUpdate = Partial<
  Pick<
    NotificationPreferences,
    'new_order_enabled'
    | 'order_canceled_enabled'
    | 'low_stock_enabled'
    | 'big_order_enabled'
    | 'payment_failure_enabled'
    | 'big_order_threshold'
  >
>;

/** Fetch the calling user's notification preferences for the active restaurant.
 *  Server creates default-true rows on first read so the UI never gets a 404. */
export async function getNotificationPreferences(
  restaurantId: number,
): Promise<NotificationPreferences> {
  const res = await authedFetch('/api/v1/notification-preferences', restaurantId);
  return (await res.json()) as NotificationPreferences;
}

/** Partial update via pointer-style payload — only fields explicitly provided
 *  are written. Returns the refreshed preferences row. */
export async function updateNotificationPreferences(
  restaurantId: number,
  update: NotificationPreferencesUpdate,
): Promise<NotificationPreferences> {
  const res = await authedFetch('/api/v1/notification-preferences', restaurantId, {
    method: 'PUT',
    body: JSON.stringify(update),
  });
  return (await res.json()) as NotificationPreferences;
}
