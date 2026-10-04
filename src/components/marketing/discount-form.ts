import type { Discount, DiscountInput } from '@/lib/api';

export type DiscountDraft = {
  code: string; name: string; description: string; type: Discount['type']; value: string;
  scope: Discount['scope']; selections: Record<Discount['scope'], number[]>;
  minimum: string; totalCap: string; customerCap: string;
  start: string; end: string; hasEnd: boolean; active: boolean;
};
export type DiscountField = keyof Omit<DiscountDraft, 'selections'> | 'scopeIds';
export type DiscountIssue = { field: DiscountField; key: string };

/** Preserve optional bounds, historical numeric values and inactive scope selections. */
export function discountDraft(discount: Discount | undefined, today: string): DiscountDraft {
  const selections = { whole_sale: [], category: [], specific_item: [] } as Record<Discount['scope'], number[]>;
  if (discount) selections[discount.scope] = [...(discount.scope_ids ?? [])];
  return {
    code: discount?.code ?? '', name: discount?.name ?? '', description: discount?.description ?? '',
    type: discount?.type ?? 'fixed', value: discount ? String(discount.value) : '',
    scope: discount?.scope ?? 'whole_sale', selections,
    minimum: discount ? String(discount.min_purchase) : '',
    totalCap: discount?.total_cap == null ? '' : String(discount.total_cap),
    customerCap: discount?.per_customer_cap == null ? '' : String(discount.per_customer_cap),
    start: discount ? discount.starts_at?.slice(0, 10) ?? '' : today,
    end: discount?.ends_at?.slice(0, 10) ?? '', hasEnd: !!discount?.ends_at, active: discount?.is_active ?? true,
  };
}

/** Check calendar dates without converting them to a browser-local instant. */
export function validDiscountDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Build the complete replacement payload required by the existing discount API. */
export function discountInput(draft: DiscountDraft, original?: Discount): { input: DiscountInput; issue?: never } | { issue: DiscountIssue; input?: never } {
  const fail = (field: DiscountField, key: string) => ({ issue: { field, key } });
  if (!draft.code.trim()) return fail('code', 'discountCodeRequired');
  const value = Number(draft.value);
  if (draft.type !== 'free_delivery' && (!draft.value.trim() || !Number.isFinite(value) || value <= 0 || (draft.type === 'percent' && value > 100))) return fail('value', draft.type === 'percent' ? 'discountPercentInvalid' : 'discountFixedInvalid');
  // Selecting free delivery preserves the other draft controls for switching back.
  // An existing free-delivery record retains its historical (unused) fields.
  const scope = draft.type === 'free_delivery' && original?.type !== 'free_delivery' ? 'whole_sale' : draft.scope;
  const ids = scope === 'whole_sale' && draft.type === 'free_delivery' && original?.type !== 'free_delivery' ? [] : draft.selections[scope];
  if (scope !== 'whole_sale' && ids.length === 0) return fail('scopeIds', 'discountScopeRequired');
  const minimum = draft.minimum.trim() ? Number(draft.minimum) : 0;
  if (!Number.isFinite(minimum) || (minimum < 0 && draft.minimum !== String(original?.min_purchase))) return fail('minimum', 'discountMinimumInvalid');
  const total = draft.totalCap.trim() ? Number(draft.totalCap) : null;
  const customer = draft.customerCap.trim() ? Number(draft.customerCap) : null;
  for (const [field, number, previous] of [['totalCap', total, original?.total_cap], ['customerCap', customer, original?.per_customer_cap]] as const) {
    if (number !== null && (!Number.isSafeInteger(number) || (number < 1 && draft[field] !== String(previous)))) return fail(field, 'discountCapInvalid');
  }
  if (draft.start && !validDiscountDay(draft.start)) return fail('start', 'discountDateInvalid');
  if (draft.hasEnd && !validDiscountDay(draft.end)) return fail('end', 'discountDateInvalid');
  if (draft.hasEnd && draft.start && draft.end < draft.start) return fail('end', 'discountDateOrder');
  return { input: {
    code: draft.code.trim().toUpperCase(), name: draft.name, description: draft.description, type: draft.type,
    value: Number.isFinite(value) ? value : original?.value ?? 0,
    scope, scope_ids: [...ids], min_purchase: minimum, total_cap: total, per_customer_cap: customer,
    starts_at: draft.start || null, ends_at: draft.hasEnd ? draft.end : null, is_active: draft.active,
  } };
}

/** Compare editable values after a failed response without confusing a reused code with the submitted draft. */
export function discountSignature(value: DiscountInput): string {
  return JSON.stringify({ code: value.code.trim().toUpperCase(), name: value.name, description: value.description, type: value.type, value: value.value, scope: value.scope, scope_ids: [...(value.scope_ids ?? [])].sort((a,b) => a-b), min_purchase: value.min_purchase, total_cap: value.total_cap, per_customer_cap: value.per_customer_cap, starts_at: value.starts_at, ends_at: value.ends_at, is_active: value.is_active });
}

/** Reject incomplete or cross-restaurant records before editing or reconciling a mutation. */
export function checkedDiscount(value: Discount, restaurantId: number, expectedId?: number): Discount {
  if (!value || !Number.isSafeInteger(value.id) || value.id < 1 || (expectedId != null && value.id !== expectedId) || value.restaurant_id !== restaurantId
    || !['code', 'name', 'description'].every(key => typeof value[key as keyof Discount] === 'string')
    || !['fixed', 'percent', 'free_delivery'].includes(value.type) || !['whole_sale', 'category', 'specific_item'].includes(value.scope)
    || !Number.isFinite(value.value) || !Number.isFinite(value.min_purchase) || !Number.isSafeInteger(value.redemption_count)
    || (value.scope_ids != null && (!Array.isArray(value.scope_ids) || value.scope_ids.some(id => !Number.isSafeInteger(id) || id < 1)))
    || [value.total_cap, value.per_customer_cap].some(cap => cap !== null && !Number.isSafeInteger(cap))
    || [value.starts_at, value.ends_at].some(date => date !== null && (typeof date !== 'string' || !validDiscountDay(date)))
    || typeof value.is_active !== 'boolean') throw new Error('Incomplete discount response');
  return { ...value, scope_ids: value.scope_ids ?? [] };
}
