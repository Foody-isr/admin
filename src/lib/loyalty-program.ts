import type { LoyaltyProgram, LoyaltyProgramInput, LoyaltyProgramState, LoyaltyRules } from './api';

export const loyaltyLanguages = ['en', 'fr', 'he'] as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const whole = (value: unknown, min = 0) => Number.isSafeInteger(value) && Number(value) >= min;
const text = (value: unknown, limit: number, multiline = false): value is string => typeof value === 'string' && !!value && value.trim() === value && Array.from(value).length <= limit && !(multiline ? /[\x00-\x08\x0b-\x1f\x7f-\x9f]/ : /[\x00-\x1f\x7f-\x9f]/).test(value);
const currency = (value: unknown) => ['ILS', 'EUR', 'USD', 'GBP'].includes(String(value));

function rulesValid(r: unknown): r is LoyaltyRules {
  if (!object(r) || !currency(r.currency) || !whole(r.minimum_purchase_minor) || !whole(r.reward_threshold, 1) || !whole(r.reward_validity_days) || r.reward_validity_days > 3650 || !text(r.terms_version, 80)) return false;
  if (r.mode === 'points' ? !whole(r.spend_step_minor, 1) || !whole(r.units_per_step, 1) : r.mode !== 'visits' || r.spend_step_minor !== 0 || r.units_per_step !== 1) return false;
  return r.reward_type === 'fixed' ? whole(r.reward_amount_minor, 1) && r.reward_item_id == null && r.reward_variant_id == null : r.reward_type === 'item' && r.reward_amount_minor === 0 && whole(r.reward_item_id, 1) && (r.reward_variant_id == null || whole(r.reward_variant_id, 1));
}

/** Reject incomplete version/money contracts; legacy empty translations remain editable. */
export function checkedLoyaltyProgram(value: unknown): LoyaltyProgram {
  if (!object(value) || !uuid.test(value.id) || !uuid.test(value.version_id) || !whole(value.revision, 1) || typeof value.enabled !== 'boolean' || !rulesValid(value.rules) || !object(value.content) || typeof value.updated_at !== 'string' || !Number.isFinite(Date.parse(value.updated_at))) throw new Error('loyalty_program_invalid');
  for (const lang of loyaltyLanguages) if (!object(value.content[lang]) || typeof value.content[lang].name !== 'string' || typeof value.content[lang].terms !== 'string') throw new Error('loyalty_program_invalid');
  return value as LoyaltyProgram;
}

/** Missing server authority stays read-only and never falls back to a role name. */
export function checkedLoyaltyProgramState(value: unknown): LoyaltyProgramState {
  if (!object(value) || !currency(value.restaurant_currency) || typeof value.identity_locked !== 'boolean' || (value.can_manage_program !== undefined && typeof value.can_manage_program !== 'boolean') || value.program === undefined) throw new Error('loyalty_program_invalid');
  return { program: value.program === null ? null : checkedLoyaltyProgram(value.program), restaurant_currency: value.restaurant_currency, identity_locked: value.identity_locked, can_manage_program: value.can_manage_program === true };
}

/** Money input uses decimal strings so an exact cent is never a float approximation. */
export function loyaltyMinor(value: string): number {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) throw new Error('loyalty_program_invalid');
  const [whole, decimal = ''] = value.replace(',', '.').split('.');
  const minor = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor)) throw new Error('loyalty_program_invalid');
  return minor;
}
const major = (value: number) => (value / 100).toFixed(2);
const integer = (value: string, min = 0) => { if (!/^\d+$/.test(value) || !whole(Number(value), min)) throw new Error('loyalty_program_invalid'); return Number(value); };
export interface LoyaltyProgramDraft { mode: 'points' | 'visits'; enabled: boolean; threshold: string; minimum: string; step: string; units: string; reward: 'fixed' | 'item'; amount: string; item: string; variant: string; validity: string; termsVersion: string; content: LoyaltyProgram['content'] }

/** A new program has no invented earning threshold, benefit value or legal terms. */
export function loyaltyProgramDraft(p: Pick<LoyaltyProgram, 'rules' | 'enabled' | 'content'> | null): LoyaltyProgramDraft {
  return { mode: p?.rules.mode ?? 'points', enabled: p?.enabled ?? false, threshold: p ? String(p.rules.reward_threshold) : '', minimum: p ? major(p.rules.minimum_purchase_minor) : '0', step: p ? major(p.rules.spend_step_minor) : '', units: p ? String(p.rules.units_per_step) : '1', reward: p?.rules.reward_type ?? 'fixed', amount: p ? major(p.rules.reward_amount_minor) : '', item: p?.rules.reward_item_id ? String(p.rules.reward_item_id) : '', variant: p?.rules.reward_variant_id ? String(p.rules.reward_variant_id) : '', validity: p ? String(p.rules.reward_validity_days) : '0', termsVersion: p?.rules.terms_version ?? '', content: p ? structuredClone(p.content) : { en: { name: '', terms: '' }, fr: { name: '', terms: '' }, he: { name: '', terms: '' } } };
}

/** Convert the displayed draft into the complete, explicitly reviewed server contract. */
export function loyaltyProgramPayload(d: LoyaltyProgramDraft, code: string, revision: number, request: string, programID: string | null = null): LoyaltyProgramInput {
  const r: LoyaltyRules = { mode: d.mode, currency: code, spend_step_minor: d.mode === 'points' ? loyaltyMinor(d.step) : 0, units_per_step: d.mode === 'points' ? integer(d.units, 1) : 1, minimum_purchase_minor: loyaltyMinor(d.minimum), reward_threshold: integer(d.threshold, 1), reward_type: d.reward, reward_amount_minor: d.reward === 'fixed' ? loyaltyMinor(d.amount) : 0, reward_validity_days: integer(d.validity), terms_version: d.termsVersion, ...(d.reward === 'item' ? { reward_item_id: integer(d.item, 1), ...(d.variant ? { reward_variant_id: integer(d.variant, 1) } : {}) } : {}) };
  const input = { program_id: programID, request_id: request, expected_revision: revision, enabled: d.enabled, rules: r, content: structuredClone(d.content) };
  if (!validInput(input)) throw new Error('loyalty_program_invalid');
  return input;
}
function validInput(i: unknown): i is LoyaltyProgramInput {
  return object(i) && uuid.test(i.request_id) && whole(i.expected_revision) && (i.expected_revision === 0 ? i.program_id === null : typeof i.program_id === 'string' && uuid.test(i.program_id)) && typeof i.enabled === 'boolean' && rulesValid(i.rules) && object(i.content) && loyaltyLanguages.every(lang => object(i.content[lang]) && text(i.content[lang].name, 100) && text(i.content[lang].terms, 4000, true));
}
const canonical = (value: any): string => object(value) ? JSON.stringify(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key])])) : JSON.stringify(value);

/** An acknowledgement must match the exact submitted version, rules and enabled state. */
export function checkedProgramAck(value: unknown, saved: PendingLoyaltyProgram): LoyaltyProgram {
  if (!object(value)) throw new Error('loyalty_program_invalid');
  const p = checkedLoyaltyProgram(value.program), input = saved.input;
  if (p.revision !== input.expected_revision + 1 || saved.program_id !== null && p.id !== saved.program_id || p.enabled !== input.enabled || canonical(p.rules) !== canonical(input.rules) || canonical(p.content) !== canonical(input.content)) throw new Error('loyalty_program_invalid');
  return p;
}

export interface PendingLoyaltyProgram { restaurant: number; actor: number; program_id: string | null; input: LoyaltyProgramInput }
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (rid: number, actor: number) => `foody.loyalty-program.v1:${rid}:${actor}`;
/** A corrupt or unavailable scoped journal blocks replacement rather than losing an intent. */
export function readProgramIntent(store: Store, rid: number, actor: number): PendingLoyaltyProgram | null {
  try { if (!whole(rid, 1) || !whole(actor, 1)) throw new Error(); const raw = store.getItem(key(rid, actor)); if (raw === null) return null; const v = JSON.parse(raw); if (!object(v) || v.restaurant !== rid || v.actor !== actor || v.program_id !== null && !uuid.test(v.program_id) || !validInput(v.input) || v.program_id !== v.input.program_id) throw new Error(); return v as PendingLoyaltyProgram; } catch { throw new Error('loyalty_program_storage'); }
}
/** Write and read back the original configuration before its first transmission. */
export function storeProgramIntent(store: Store, saved: PendingLoyaltyProgram): PendingLoyaltyProgram {
  try { const prior = readProgramIntent(store, saved.restaurant, saved.actor); if (prior && canonical(prior) !== canonical(saved)) throw new Error(); store.setItem(key(saved.restaurant, saved.actor), JSON.stringify(saved)); const checked = readProgramIntent(store, saved.restaurant, saved.actor); if (!checked || canonical(checked) !== canonical(saved)) throw new Error(); return checked; } catch { throw new Error('loyalty_program_storage'); }
}
/** Remove only an acknowledged or definitively rejected request after explicit review. */
export function clearProgramIntent(store: Store, saved: PendingLoyaltyProgram): void {
  try { if (readProgramIntent(store, saved.restaurant, saved.actor)?.input.request_id !== saved.input.request_id) throw new Error(); store.removeItem(key(saved.restaurant, saved.actor)); if (readProgramIntent(store, saved.restaurant, saved.actor) !== null) throw new Error(); } catch { throw new Error('loyalty_program_storage'); }
}
