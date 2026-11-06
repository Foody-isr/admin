import type { LoyaltyCheckoutView, LoyaltyCheckoutDetail, LoyaltyCheckoutPage, LoyaltyCloseInput, LoyaltyCloseResult } from './api';

/** Controlled build opt-in; customer enrollment and Wallets remain independent. */
export const loyaltyCheckoutEnabled = process.env.NEXT_PUBLIC_LOYALTY_CHECKOUT_RESOLUTION_ENABLED === 'true';

const hash = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** Reject incomplete financial projections rather than inventing amounts or states. */
export function parseLoyaltyCheckout(value: unknown, expectedOrder?: number): LoyaltyCheckoutView {
  if (!object(value) || !id(value.order_id) || (expectedOrder !== undefined && value.order_id !== expectedOrder) || typeof value.revision !== 'string' || !hash.test(value.revision)) throw new Error('loyalty_invalid_response');
  for (const key of ['checkout_state', 'reward_state', 'payment_state', 'fulfillment_state', 'next_step']) if (typeof value[key] !== 'string' || !value[key]) throw new Error('loyalty_invalid_response');
  if (value.expected_amount_minor != null && (!Number.isSafeInteger(value.expected_amount_minor) || Number(value.expected_amount_minor) < 0 || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))) throw new Error('loyalty_invalid_response');
  if (value.latest_request != null && (!object(value.latest_request) || typeof value.latest_request.request_id !== 'string' || !uuid.test(value.latest_request.request_id) || !['pending', 'completed'].includes(String(value.latest_request.status)) || typeof value.latest_request.updated_at !== 'string' || !Number.isFinite(Date.parse(value.latest_request.updated_at)))) throw new Error('loyalty_invalid_response');
  return value as unknown as LoyaltyCheckoutView;
}

/** Keep an older API read-only when it does not advertise close authority. */
export function parseLoyaltyCheckoutDetail(value: unknown, order: number): LoyaltyCheckoutDetail {
  const parsed = parseLoyaltyCheckout(value, order);
  if (!object(value) || (value.can_request_close !== undefined && typeof value.can_request_close !== 'boolean')) throw new Error('loyalty_invalid_response');
  return { ...parsed, can_request_close: value.can_request_close === true };
}

/** Validate the bounded keyset page and reject cursors that could repeat a page. */
export function parseLoyaltyCheckoutPage(value: unknown, after: number): LoyaltyCheckoutPage {
  if (!object(value) || !Array.isArray(value.items) || value.items.length > 50) throw new Error('loyalty_invalid_response');
  const items = value.items.map(item => parseLoyaltyCheckout(item));
  if (items.some((item, index) => item.order_id <= (index ? items[index - 1].order_id : after))) throw new Error('loyalty_invalid_response');
  const next = value.next_after ?? 0;
  if (next !== 0 && (!id(next) || !items.length || next !== items[items.length - 1].order_id)) throw new Error('loyalty_invalid_response');
  return { items, next_after: Number(next) };
}

/** A terminal or pending reply must refer to the exact submitted command. */
export function parseLoyaltyCloseResult(value: unknown, order: number, request: string): LoyaltyCloseResult {
  if (!object(value) || value.order_id !== order || value.request_id !== request || !(['closed', 'settled'].includes(String(value.state)) || value.status === 'pending')) throw new Error('loyalty_invalid_response');
  return value as unknown as LoyaltyCloseResult;
}

/** Match the server's UTF-8 byte limit and preserve the exact original reason. */
export function validLoyaltyCloseReason(value: string): boolean {
  const length = new TextEncoder().encode(value).length;
  return value === value.trim() && length >= 3 && length <= 300 && !/[\r\n\0]/.test(value);
}

/** Unknown steps are always review-only. */
export function canCloseLoyaltyCheckout(view: LoyaltyCheckoutView): boolean {
  return ['close_local', 'verify_and_close', 'verify_closure', 'complete_local'].includes(view.next_step);
}

export interface LoyaltyCommandScope { restaurant: number; actor: number; order: number }
type JournalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const journalKey = (scope: LoyaltyCommandScope) => `foody.loyalty-close.v1:${scope.restaurant}:${scope.actor}:${scope.order}`;
function validInput(input: unknown): input is LoyaltyCloseInput {
  return object(input) && typeof input.request_id === 'string' && uuid.test(input.request_id) && typeof input.expected_revision === 'string' && hash.test(input.expected_revision) && typeof input.reason === 'string' && validLoyaltyCloseReason(input.reason);
}
function validScope(scope: LoyaltyCommandScope) { return id(scope.restaurant) && id(scope.actor) && id(scope.order); }

/** Keep one original input per staff/restaurant/order session; corrupt storage blocks replacement. */
export function readLoyaltyCommand(storage: JournalStorage, scope: LoyaltyCommandScope): LoyaltyCloseInput | null {
  if (!validScope(scope)) throw new Error('loyalty_journal_unavailable');
  try {
    const raw = storage.getItem(journalKey(scope));
    if (raw === null) return null;
    const saved = JSON.parse(raw);
    if (!object(saved) || saved.restaurant !== scope.restaurant || saved.actor !== scope.actor || saved.order !== scope.order || !validInput(saved.input)) throw new Error();
    return saved.input;
  } catch { throw new Error('loyalty_journal_unavailable'); }
}

/** Persist and verify the exact body before the first financial command is sent. */
export function saveLoyaltyCommand(storage: JournalStorage, scope: LoyaltyCommandScope, input: LoyaltyCloseInput): LoyaltyCloseInput {
  if (!validInput(input)) throw new Error('loyalty_journal_unavailable');
  const previous = readLoyaltyCommand(storage, scope);
  if (previous && JSON.stringify(previous) !== JSON.stringify(input)) throw new Error('loyalty_journal_unavailable');
  try {
    storage.setItem(journalKey(scope), JSON.stringify({ ...scope, input }));
    const stored = readLoyaltyCommand(storage, scope);
    if (!stored || JSON.stringify(stored) !== JSON.stringify(input)) throw new Error();
    return stored;
  } catch { throw new Error('loyalty_journal_unavailable'); }
}

/** Clear only the acknowledged request, or a rejected first attempt proved absent by a fresh read. */
export function clearLoyaltyCommand(storage: JournalStorage, scope: LoyaltyCommandScope, request: string): void {
  const current = readLoyaltyCommand(storage, scope);
  if (current?.request_id !== request) throw new Error('loyalty_journal_unavailable');
  try {
    storage.removeItem(journalKey(scope));
    if (readLoyaltyCommand(storage, scope) !== null) throw new Error();
  } catch { throw new Error('loyalty_journal_unavailable'); }
}
