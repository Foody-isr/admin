import type { FullServiceSettings } from './api';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
  return actual !== undefined && confirmed(base, next, actual);
}
