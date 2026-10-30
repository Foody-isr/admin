import { readLifecycleV2Scope, type LifecycleV2HandoffAction, type LifecycleV2Scope, type OrderLifecycleV2 } from './lifecycle-v2';

export interface LifecycleIntentContext { api_origin: string; restaurant_id: number; actor_id: number }
export interface LifecycleCommand { request_id: string; scope: LifecycleV2Scope; expected_revision: string; action: LifecycleV2HandoffAction | 'close_check'; unit_keys: string[] }
export interface LifecycleIntent { version: 1; context: LifecycleIntentContext; created_at: number; command: LifecycleCommand }
export interface LifecycleJournalStorage { readonly length: number; key(index: number): string | null; getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const prefix = 'foody-lifecycle-intent-v2:';
function exactKeys(value: unknown, keys: string[]): boolean { return !!value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(keys.sort()); }
function scopeKey(context: LifecycleIntentContext, scope: LifecycleV2Scope): string { return prefix + encodeURIComponent(JSON.stringify([context.api_origin, context.restaurant_id, context.actor_id, scope.kind, scope.id])) + ':'; }
function valid(value: unknown, context: LifecycleIntentContext, scope: LifecycleV2Scope): value is LifecycleIntent {
  if (!value || typeof value !== 'object') return false;
  const item = value as LifecycleIntent;
  const c = item.command;
  return exactKeys(item, ['version','context','created_at','command']) && exactKeys(item.context,['api_origin','restaurant_id','actor_id']) && typeof item.context.api_origin === 'string' && Number.isSafeInteger(item.context.restaurant_id) && item.context.restaurant_id > 0 && Number.isSafeInteger(item.context.actor_id) && item.context.actor_id > 0 && exactKeys(c,['request_id','scope','expected_revision','action','unit_keys']) && exactKeys(c.scope,['kind','id']) && item.version === 1 && Number.isSafeInteger(item.created_at) && item.created_at > 0 && JSON.stringify(item.context) === JSON.stringify(context) && !!c && uuid.test(c.request_id) && c.request_id !== '00000000-0000-0000-0000-000000000000' && c.scope?.kind === scope.kind && c.scope.id === scope.id && /^[a-f0-9]{64}$/.test(c.expected_revision) && ['serve', 'pickup', 'hand_to_courier', 'deliver', 'close_check'].includes(c.action) && Array.isArray(c.unit_keys) && c.unit_keys.length <= 2000 && new Set(c.unit_keys).size === c.unit_keys.length && c.unit_keys.every(key => typeof key === 'string' && !!key && key.length <= 80) && (c.action === 'close_check' ? c.unit_keys.length === 0 : c.unit_keys.length > 0);
}

/** Legacy screens need no v2 actor check when this browser has no lifecycle journal. */
export function hasLifecycleIntents(storage: LifecycleJournalStorage): boolean {
  for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(prefix)) return true;
  return false;
}

/** Read only this actor/resource's intents; malformed persistence blocks new work. */
export function readLifecycleIntents(storage: LifecycleJournalStorage, context: LifecycleIntentContext, scope: LifecycleV2Scope): LifecycleIntent[] {
  const start = scopeKey(context, scope);
  const result: LifecycleIntent[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(start)) continue;
    const raw = storage.getItem(key);
    let value: unknown;
    try { value = raw === null ? null : JSON.parse(raw); } catch { throw new Error('lifecycleJournalUnavailable'); }
    if (!valid(value, context, scope) || key !== start + value.command.request_id) throw new Error('lifecycleJournalUnavailable');
    result.push(value);
  }
  return result.sort((a, b) => a.created_at - b.created_at || a.command.request_id.localeCompare(b.command.request_id));
}

/** Persist the immutable intent before dispatch; no credential or customer data is stored. */
export function persistLifecycleIntent(storage: LifecycleJournalStorage, intent: LifecycleIntent): void {
  if (!valid(intent, intent.context, intent.command.scope)) throw new Error('lifecycleJournalUnavailable');
  const key = scopeKey(intent.context, intent.command.scope) + intent.command.request_id;
  if (storage.getItem(key) !== null) throw new Error('lifecycleJournalUnavailable');
  const raw = JSON.stringify(intent);
  storage.setItem(key, raw);
  if (storage.getItem(key) !== raw) throw new Error('lifecycleJournalUnavailable');
}

/** Only confirmed or explicitly rejected operations may remove their exact local intent. */
export function removeLifecycleIntent(storage: LifecycleJournalStorage, intent: LifecycleIntent): void {
  const key = scopeKey(intent.context, intent.command.scope) + intent.command.request_id;
  const current = storage.getItem(key);
  if (current === null) return;
  if (current !== JSON.stringify(intent)) throw new Error('lifecycleJournalUnavailable');
  storage.removeItem(key);
}

export type LifecycleOperationRead = { kind: 'unconfirmed' } | { kind: 'confirmed'; value: OrderLifecycleV2 } | { kind: 'unavailable' };
/** A missing operation is unconfirmed, never a failed command or a new UUID. */
export function readLifecycleOperationResult(value: unknown, command: LifecycleCommand): LifecycleOperationRead {
  if (!value || typeof value !== 'object') return { kind: 'unavailable' };
  const result = value as Record<string, unknown>;
  const scope = result.scope as LifecycleV2Scope | undefined;
  if (result.schema_version !== 2 || result.request_id !== command.request_id || scope?.kind !== command.scope.kind || scope.id !== command.scope.id) return { kind: 'unavailable' };
  if (result.state === 'unconfirmed') return { kind: 'unconfirmed' };
  if (result.state !== 'confirmed' || typeof result.revision !== 'string' || !/^[a-f0-9]{64}$/.test(result.revision) || result.event_ids !== undefined && (!Array.isArray(result.event_ids) || !result.event_ids.every(id => typeof id === 'string' && uuid.test(id)) || new Set(result.event_ids).size !== result.event_ids.length)) return { kind: 'unavailable' };
  const read = readLifecycleV2Scope(result.lifecycle_v2, command.scope);
  return read.kind === 'available' && read.value.revision === result.revision ? { kind: 'confirmed', value: read.value } : { kind: 'unavailable' };
}
