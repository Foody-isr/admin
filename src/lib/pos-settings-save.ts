import type { FullServiceSettings } from './api';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const seating = ['disabled', 'coversOnly', 'optionalSeats', 'requiredSeats'];
const sorting = ['course', 'seat', 'entry'];
const strings = (value: unknown, nonempty = false) => Array.isArray(value) && (!nonempty || value.length > 0) && value.every(row => typeof row === 'string');
function checkBehavior(value: unknown): boolean {
  return value == null || object(value) && ['allow_hold_fire', 'collapse_sent', 'open_checks_enabled', 'open_checks_home', 'predefined_tickets'].every(key => typeof value[key] === 'boolean');
}

/** Reject incomplete shared policy responses without materializing inherited check behavior. */
export function isCompletePOSSettings(value: unknown): value is FullServiceSettings {
  if (!object(value) || !seating.includes(String(value.seating_mode)) || !sorting.includes(String(value.sort_cart)) ||
    ['send_and_stay', 'coursing_enabled', 'show_held_on_kds'].some(key => typeof value[key] !== 'boolean') ||
    !strings(value.courses, true) || !strings(value.comp_reasons) || !strings(value.void_reasons) || !checkBehavior(value.check_behavior)) return false;
  if (value.modes == null) return true;
  if (!Array.isArray(value.modes)) return false;
  const ids = new Set<string>();
  return value.modes.every(mode => {
    if (!object(mode) || typeof mode.id !== 'string' || !mode.id || ids.has(mode.id) || typeof mode.name !== 'string' ||
      !strings(mode.device_ids) || !seating.includes(String(mode.seating_mode)) || !sorting.includes(String(mode.sort_cart)) ||
      !['tall', 'wide'].includes(String(mode.tile_size)) || ['send_and_stay', 'coursing_enabled', 'auto_progression'].some(key => typeof mode[key] !== 'boolean') ||
      !checkBehavior(mode.check_behavior)) return false;
    ids.add(mode.id);
    return true;
  });
}

function equal(left: unknown, right: unknown): boolean {
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((value, index) => equal(value, right[index]));
  if (object(left)) return object(right) && Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([key, value]) => Object.hasOwn(right, key) && equal(value, right[key]));
  return left === right;
}

function confirmed(base: unknown, next: unknown, actual: unknown, key = ''): boolean {
  if (equal(base, next)) return true;
  if (key === 'modes' && (base === undefined || Array.isArray(base)) && Array.isArray(next) && Array.isArray(actual)) {
    const index = (rows: unknown[]) => {
      const modes = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        if (!object(row) || typeof row.id !== 'string' || !row.id || modes.has(row.id)) return null;
        modes.set(row.id, row);
      }
      return modes;
    };
    const before = index(base ?? []), after = index(next), saved = index(actual);
    if (!before || !after || !saved) return false;
    if (Array.from(before.keys()).some(id => !after.has(id) && saved.has(id))) return false;
    return Array.from(after.entries()).every(([id, value]) => confirmed(before.get(id), value, saved.get(id)));
  }
  if (object(next) && (object(base) || base === undefined) && object(actual)) {
    return Array.from(new Set([...Object.keys(base ?? {}), ...Object.keys(next)])).every(field => confirmed(base?.[field], next[field], actual[field], field));
  }
  return equal(next, actual);
}

/** Confirm edited leaves while allowing the server to preserve concurrent edits to other modes or fields. */
export function posSettingsSaveConfirmed(base: FullServiceSettings, next: FullServiceSettings, actual: FullServiceSettings | undefined): boolean {
  return isCompletePOSSettings(actual) && confirmed(base, next, actual);
}
