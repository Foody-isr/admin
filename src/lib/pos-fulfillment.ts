import type { POSFulfillment, POSFulfillmentMethod } from './api';

const presets: POSFulfillmentMethod[] = [
  { id: 'dine_in', name: '', order_type: 'dine_in' },
  { id: 'pickup', name: '', order_type: 'pickup' },
  { id: 'delivery', name: '', order_type: 'delivery' },
  { id: 'collect', name: '', order_type: 'pickup' },
];

/** Materialize a legacy catalogue while preserving its current default and enabled order. */
export function fulfillmentCatalog(value: POSFulfillment): POSFulfillmentMethod[] {
  if (value.methods) return value.methods.map(method => ({ ...method }));
  const active = [value.default, ...value.enabled.filter(id => id !== value.default)];
  return [...active.map(id => presets.find(method => method.id === id)).filter((method): method is POSFulfillmentMethod => !!method), ...presets.filter(method => !active.includes(method.id))].map(method => ({ ...method }));
}

/** One catalogue order controls POS choice order and the first enabled default. */
export function withFulfillmentCatalog(value: POSFulfillment, methods: POSFulfillmentMethod[], enabled: readonly string[] = value.enabled): POSFulfillment {
  const active = methods.filter(method => enabled.includes(method.id)).map(method => method.id);
  return { ...value, methods, enabled: active, default: active[0] ?? '' };
}

/** Check labels and selection before offering the policy for persistence. */
export function validFulfillment(value: POSFulfillment): boolean {
  const methods = fulfillmentCatalog(value);
  const ids = new Set(methods.map(method => method.id));
  const names = methods.filter(method => method.name).map(method => method.name.trim().toLowerCase());
  const active = methods.filter(method => value.enabled.includes(method.id));
  return ['never', 'start', 'checkout'].includes(value.prompt) && methods.length > 0 && methods.length <= 10 && ids.size === methods.length &&
    methods.every(method => (presets.some(preset=>preset.id===method.id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(method.id) && method.id!=='00000000-0000-0000-0000-000000000000') && ['dine_in', 'pickup', 'delivery'].includes(method.order_type) && method.name === method.name.trim() && Array.from(method.name).length <= 80 && !/[\u0000-\u001f\u007f-\u009f]/.test(method.name) && (presets.some(preset => preset.id === method.id) || !!method.name)) &&
    methods.every(method => ['show_customer_information','track_preparation','track_handoff'].every(key => { const value = (method as unknown as Record<string,unknown>)[key]; return value === undefined || typeof value === 'boolean'; })) &&
    new Set(names).size === names.length && value.enabled.length > 0 && new Set(value.enabled).size === value.enabled.length && value.enabled.every(id => ids.has(id)) && value.default === value.enabled[0] &&
    active.every((method, index) => method.id === value.enabled[index]);
}

/** Require every submitted fulfillment field to survive persistence, including additive fields from newer APIs. */
export function fulfillmentSaveConfirmed(expected: POSFulfillment | undefined, actual: POSFulfillment | undefined): boolean {
  if (expected === undefined) return true;
  const includes = (sent: unknown, saved: unknown): boolean => {
    if (sent === undefined) return true;
    if (Array.isArray(sent)) return Array.isArray(saved) && sent.length === saved.length && sent.every((value, index) => includes(value, saved[index]));
    if (sent !== null && typeof sent === 'object') return saved !== null && typeof saved === 'object' && !Array.isArray(saved) && Object.entries(sent).every(([key, value]) => includes(value, (saved as Record<string, unknown>)[key]));
    return sent === saved;
  };
  return includes(expected, actual);
}
