import { pageKey, sectionKey, type DraftStatePayload } from "./types";

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equal(value, right[index]));
  }
  if (!isFields(left) || !isFields(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && equal(left[key], right[key]));
}

/** A changed field could not be reapplied without overwriting another edit. */
export class WebsiteDraftMergeConflict extends Error {}

function mergeFields(base: Fields, local: Fields, remote: Fields): Fields {
  const keys = new Set([...Object.keys(remote), ...Object.keys(local)]);
  return Object.fromEntries(
    Array.from(keys, (key) => [
      key,
      mergeValue(base[key], local[key], remote[key]),
    ]).filter(([, value]) => value !== undefined),
  );
}

function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (equal(local, base)) return remote;
  if (equal(remote, base) || equal(local, remote)) return local;
  if ((base === undefined || isFields(base)) && isFields(local) && isFields(remote)) {
    return mergeFields(base ?? {}, local, remote);
  }
  // Keep nested arrays and deletions atomic. There is no stable identity for
  // arbitrary list entries in section content and site configuration.
  throw new WebsiteDraftMergeConflict();
}

function mergeEntities<T extends Fields>(
  base: T[],
  local: T[],
  remote: T[],
  keyOf: (value: T) => string,
): T[] {
  const baseByKey = new Map(base.map((value) => [keyOf(value), value]));
  const localByKey = new Map(local.map((value) => [keyOf(value), value]));
  const remoteByKey = new Map(remote.map((value) => [keyOf(value), value]));
  const keys = new Set([...Array.from(remoteByKey.keys()), ...Array.from(localByKey.keys())]);
  const merged: T[] = [];
  for (const key of Array.from(keys)) {
    const value = mergeValue(baseByKey.get(key), localByKey.get(key), remoteByKey.get(key));
    if (value !== undefined) merged.push(value as T);
  }
  return merged;
}

/** Reapplies local-only edits to the current server snapshot by stable entity identity. */
export function rebaseWebsiteDraft(
  base: DraftStatePayload,
  local: DraftStatePayload,
  remote: DraftStatePayload,
): DraftStatePayload {
  const merged = {
    config: mergeFields(base.config, local.config, remote.config),
    pages: mergeEntities(base.pages, local.pages, remote.pages, pageKey),
    sections: mergeEntities(base.sections, local.sections, remote.sections, sectionKey),
    deleted_page_ids: mergeValue(base.deleted_page_ids, local.deleted_page_ids, remote.deleted_page_ids) as number[],
    deleted_section_ids: mergeValue(base.deleted_section_ids, local.deleted_section_ids, remote.deleted_section_ids) as number[],
  };
  return equal(merged, remote) ? remote : merged;
}
