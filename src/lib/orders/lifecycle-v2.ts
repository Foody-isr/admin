// Mirror of the additive lifecycle-v2 API contract. Facts do not authorize a
// payment and never replace an Order, bill or table-session identity.

export const lifecycleV2ActionKeys = ['edit', 'accept', 'send_to_kitchen', 'mark_ready', 'fire_course', 'collect_payment', 'cancel', 'adjust_weight', 'close_check', 'release_table', 'serve', 'pickup', 'hand_to_courier', 'deliver'] as const;
export type LifecycleV2ActionKey = typeof lifecycleV2ActionKeys[number];
export type LifecycleV2HandoffAction = 'serve' | 'pickup' | 'hand_to_courier' | 'deliver';
export type LifecycleV2Scope = { kind: 'order' | 'check' | 'financial_check' | 'table_session'; id: string };
export type LifecycleV2Evidence = { source: string; state: string; at?: string };
export type LifecycleV2Axis<State extends string> = { state: State; evidence: LifecycleV2Evidence[] };
export type LifecycleV2TrackingMode = 'tracked' | 'not_tracked' | 'mixed' | 'unknown';
export type LifecycleV2PreparationState = 'not_sent' | 'held' | 'in_progress' | 'partially_ready' | 'ready' | 'not_tracked' | 'mixed' | 'unknown';
export type LifecycleV2HandoffState = 'pending' | 'in_transit' | 'partially_complete' | 'complete' | 'not_tracked' | 'mixed' | 'unknown';
export interface LifecycleV2Money {
  availability: 'known' | 'partial' | 'unknown'; currency: string | null; minor_unit_exponent: number | null;
  total_minor: number | null; captured_minor: number | null; refunded_minor: number | null;
  net_received_minor: number | null; balance_due_minor: number | null;
}
export interface LifecycleV2Unit {
  key: string; order_id: number; order_item_id: number; name: string; details: string[]; quantity: 1;
  preparation_state: 'not_sent' | 'held' | 'in_progress' | 'ready' | 'not_tracked' | 'unknown';
  handoff_state: 'pending' | 'with_courier' | 'served' | 'picked_up' | 'delivered' | 'not_tracked' | 'unknown';
  available_actions: LifecycleV2ActionKey[];
}
export interface OrderLifecycleV2 {
  schema_version: 2; scope: LifecycleV2Scope;
  identities: { order_ids: number[]; check_id?: string; root_check_ids?: string[]; financial_check_ids?: string[]; financial_component_ids?: string[]; session_id?: string; open_ticket_id?: string };
  revision: string;
  commercial: LifecycleV2Axis<'open' | 'closed' | 'cancelled' | 'mixed' | 'unknown'> & { editable: boolean; closed_at: string | null };
  payment: LifecycleV2Axis<'unpaid' | 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'partially_refunded' | 'refunded' | 'mixed' | 'unknown'> & { amounts: LifecycleV2Money };
  preparation: LifecycleV2Axis<LifecycleV2PreparationState> & { quantities: { total: number; not_sent: number; held: number; in_progress: number; ready: number; not_tracked: number; unknown: number } };
  handoff: LifecycleV2Axis<LifecycleV2HandoffState> & { tracking: LifecycleV2TrackingMode; quantities: { total: number; pending: number; with_courier: number; served: number; picked_up: number; delivered: number; not_tracked: number; unknown: number } };
  tracking: { state: 'snapshot' | 'mixed' | 'unknown'; preparation: LifecycleV2TrackingMode; handoff: LifecycleV2TrackingMode; captured_at: string | null };
  units?: LifecycleV2Unit[]; actions?: { key: LifecycleV2ActionKey; allowed: boolean; reason: string }[];
}
export type OrderLifecycleV2Read = { kind: 'legacy' } | { kind: 'unavailable' } | { kind: 'available'; value: OrderLifecycleV2 };

const preparationStates = ['not_sent', 'held', 'in_progress', 'partially_ready', 'ready', 'not_tracked', 'mixed', 'unknown'];
const handoffStates = ['pending', 'in_transit', 'partially_complete', 'complete', 'not_tracked', 'mixed', 'unknown'];
const trackingModes = ['tracked', 'not_tracked', 'mixed', 'unknown'];
const monetaryKeys = ['total_minor', 'captured_minor', 'refunded_minor', 'net_received_minor', 'balance_due_minor'] as const;
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function member(value: unknown, values: readonly string[]): value is string { return typeof value === 'string' && values.includes(value); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0; }
function nonnegative(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function date(value: unknown): boolean { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
function nullableDate(value: unknown): boolean { return value === null || date(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function unique(value: readonly unknown[]): boolean { return new Set(value).size === value.length; }
function axis(value: unknown, states: readonly string[]): value is Record<string, unknown> {
  return record(value) && member(value.state, states) && Array.isArray(value.evidence) && value.evidence.every(item => record(item) && typeof item.source === 'string' && typeof item.state === 'string' && (item.at === undefined || date(item.at)));
}
function quantities(value: unknown, keys: readonly string[]): value is Record<string, number> {
  if (!record(value) || !['total', ...keys].every(key => nonnegative(value[key]))) return false;
  const sum = keys.reduce((total, key) => total + (value[key] as number), 0);
  return Number.isSafeInteger(sum) && sum === value.total;
}
function money(value: unknown): value is LifecycleV2Money {
  if (!record(value) || !member(value.availability, ['known', 'partial', 'unknown']) ||
    !(value.currency === null || typeof value.currency === 'string' && /^[A-Z]{3}$/.test(value.currency)) ||
    !(value.minor_unit_exponent === null || nonnegative(value.minor_unit_exponent) && value.minor_unit_exponent <= 3) ||
    !monetaryKeys.every(key => value[key] === null || nonnegative(value[key]))) return false;
  return value.availability !== 'known' || value.currency !== null && value.minor_unit_exponent !== null && monetaryKeys.every(key => value[key] !== null);
}

/** Validate exactly the resource reviewed by staff; no inferred parent summary. */
export function readLifecycleV2Scope(value: unknown, expected: LifecycleV2Scope, publicView = false): OrderLifecycleV2Read {
  if (value === undefined) return { kind: 'legacy' };
  const unavailable: OrderLifecycleV2Read = { kind: 'unavailable' };
  if (!record(value) || value.schema_version !== 2 || !record(value.scope) || value.scope.kind !== expected.kind || value.scope.id !== expected.id || !expected.id ||
    !member(expected.kind, ['order', 'check', 'financial_check', 'table_session']) || !record(value.identities) || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)) return unavailable;
  const ids = value.identities.order_ids;
  if (!Array.isArray(ids) || !ids.every(positive) || !unique(ids) || expected.kind === 'order' && (ids.length !== 1 || String(ids[0]) !== expected.id)) return unavailable;
  if (publicView && (expected.kind !== 'order' || Object.keys(value.identities).some(key => key !== 'order_ids') || Object.keys(value).some(key => !['schema_version', 'scope', 'identities', 'revision', 'commercial', 'payment', 'preparation', 'handoff', 'tracking'].includes(key)))) return unavailable;
  for (const key of ['check_id', 'session_id', 'open_ticket_id']) if (value.identities[key] !== undefined && (typeof value.identities[key] !== 'string' || !value.identities[key])) return unavailable;
  for (const key of ['root_check_ids', 'financial_check_ids', 'financial_component_ids']) if (value.identities[key] !== undefined && (!strings(value.identities[key]) || !unique(value.identities[key] as string[]) || (value.identities[key] as string[]).some(id => !id))) return unavailable;
  if (!axis(value.commercial, ['open', 'closed', 'cancelled', 'mixed', 'unknown']) || typeof value.commercial.editable !== 'boolean' || !nullableDate(value.commercial.closed_at) ||
    !axis(value.payment, ['unpaid', 'pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'mixed', 'unknown']) || !money(value.payment.amounts) ||
    !axis(value.preparation, preparationStates) || !quantities(value.preparation.quantities, ['not_sent', 'held', 'in_progress', 'ready', 'not_tracked', 'unknown']) ||
    !axis(value.handoff, handoffStates) || !member(value.handoff.tracking, trackingModes) || !quantities(value.handoff.quantities, ['pending', 'with_courier', 'served', 'picked_up', 'delivered', 'not_tracked', 'unknown']) ||
    value.preparation.quantities.total !== value.handoff.quantities.total || !record(value.tracking) || !member(value.tracking.state, ['snapshot', 'mixed', 'unknown']) ||
    !member(value.tracking.preparation, trackingModes) || !member(value.tracking.handoff, trackingModes) || !nullableDate(value.tracking.captured_at)) return unavailable;
  if (value.actions !== undefined && (!Array.isArray(value.actions) || !value.actions.every(action => record(action) && member(action.key, lifecycleV2ActionKeys) && typeof action.allowed === 'boolean' && typeof action.reason === 'string') || !unique(value.actions.map(action => action.key)))) return unavailable;
  if (value.units !== undefined) {
    if (!Array.isArray(value.units) || value.units.length !== value.preparation.quantities.total || !value.units.every(unit => record(unit) && typeof unit.key === 'string' && !!unit.key && unit.key.length <= 80 && positive(unit.order_id) && ids.includes(unit.order_id) && positive(unit.order_item_id) && typeof unit.name === 'string' && strings(unit.details) && unit.quantity === 1 && member(unit.preparation_state, ['not_sent', 'held', 'in_progress', 'ready', 'not_tracked', 'unknown']) && member(unit.handoff_state, ['pending', 'with_courier', 'served', 'picked_up', 'delivered', 'not_tracked', 'unknown']) && strings(unit.available_actions) && unique(unit.available_actions) && unit.available_actions.every(action => member(action, lifecycleV2ActionKeys))) || !unique(value.units.map(unit => unit.key))) return unavailable;
  }
  return { kind: 'available', value: value as unknown as OrderLifecycleV2 };
}

/** V2 is separate from v1; only an absent v2 may use the compatibility path. */
export function readOrderLifecycleV2(value: unknown, orderId: string | number, publicView = false): OrderLifecycleV2Read {
  return readLifecycleV2Scope(value, { kind: 'order', id: String(orderId) }, publicView);
}

/** A missing or denied advertised action never grants permission from old status. */
export function lifecycleV2Allows(read: OrderLifecycleV2Read | undefined, action: LifecycleV2ActionKey): boolean {
  return read?.kind === 'available' && read.value.actions?.some(item => item.key === action && item.allowed) === true;
}

/** Review exact eligible physical keys, without deduplicating or changing food state. */
export function reviewHandoffSelection(read: OrderLifecycleV2Read, action: LifecycleV2HandoffAction, selected: readonly string[]): string[] | null {
  if (read.kind !== 'available' || !lifecycleV2Allows(read, action) || !selected.length || selected.length > 2000 || !unique(selected)) return null;
  const units = new Map((read.value.units ?? []).map(unit => [unit.key, unit]));
  return selected.every(key => units.get(key)?.available_actions.includes(action)) ? [...selected] : null;
}

/** Format recorded minor units with the supplied exponent, preserving exact cents. */
export function formatLifecycleV2Money(amounts: LifecycleV2Money, key: typeof monetaryKeys[number], locale: string): string | undefined {
  const value = amounts[key];
  if (value === null || !nonnegative(value) || !amounts.currency || amounts.minor_unit_exponent === null) return undefined;
  const exponent = amounts.minor_unit_exponent;
  if (!nonnegative(exponent) || exponent > 3) return undefined;
  try {
    const divisor = BigInt(10 ** exponent);
    const integer = BigInt(value) / divisor;
    const remainder = Number(BigInt(value) % divisor);
    const fraction = exponent ? new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: exponent }).format(remainder) : '';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: amounts.currency, minimumFractionDigits: exponent, maximumFractionDigits: exponent }).formatToParts(integer).map(part => part.type === 'fraction' ? fraction : part.value).join('');
  } catch { return undefined; }
}
