import type { RestaurantSettings } from './api';

export type OrderingTestAccess = NonNullable<RestaurantSettings['ordering_test_access']>;
export type OrderingTestDraft = { enabled: boolean; ips: string; until: string };

/** Converts an absolute deadline to a browser-local datetime input value. */
export function localTestDeadline(raw?: string | null): string {
  if (!raw) return '';
  const date = new Date(raw), pad = (value: number) => String(value).padStart(2, '0');
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}

/** Builds an editable draft without inventing an active access policy. */
export function orderingTestDraft(policy?: OrderingTestAccess): OrderingTestDraft {
  return { enabled: !!policy?.enabled, ips: policy?.allowed_ips?.join('\n') ?? '', until: localTestDeadline(policy?.expires_at) };
}

/** Adds the detected IP, preserving other addresses and a future chosen deadline. */
export function orderingTestDraftWithCurrentIP(draft: OrderingTestDraft, ip: string, now = Date.now()): OrderingTestDraft {
  const ips = Array.from(new Set([...draft.ips.split(/[\s,;]+/).filter(Boolean), ip]));
  return {
    enabled: true,
    ips: ips.join('\n'),
    until: Date.parse(draft.until) > now ? draft.until : localTestDeadline(new Date(now + 3600000).toISOString()),
  };
}

/** Validates the deadline and list bounds before the server validates each IP. */
export function orderingTestPayload(draft: OrderingTestDraft, now = Date.now()): OrderingTestAccess {
  if (!draft.enabled) return { enabled: false, allowed_ips: [], expires_at: null };
  const deadline = Date.parse(draft.until);
  if (!Number.isFinite(deadline) || deadline <= now || deadline > now + 7 * 86400000 || localTestDeadline(new Date(deadline).toISOString()) !== draft.until) throw new Error('orderingTestAccessExpiryError');
  const ips = Array.from(new Set(draft.ips.split(/[\s,;]+/).filter(Boolean)));
  if (ips.length === 0 || ips.length > 32 || ips.some(ip => ip.length > 45 || ip.includes('/'))) throw new Error('orderingTestAccessIPsError');
  return { enabled: true, allowed_ips: ips, expires_at: new Date(deadline).toISOString() };
}
