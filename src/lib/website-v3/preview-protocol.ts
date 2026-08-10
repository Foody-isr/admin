import type { DraftStatePayload } from "@/lib/website-v3/types";

export const WEBSITE_V3_STATE = "foody.website-v3.state" as const;
export const WEBSITE_V3_APPLIED = "foody.website-v3.applied" as const;
export const WEBSITE_V3_READY = "foody.website-v3.ready" as const;
export const WEBSITE_V3_NAVIGATE = "foody.website-v3.navigate" as const;

export type WebsiteV3StateMessage = {
  type: typeof WEBSITE_V3_STATE;
  revision: number;
  contentRevision: number;
  restaurantId: number;
  activePageKey: string;
  device: "desktop" | "mobile";
  state: DraftStatePayload;
};

export type WebsiteV3AppliedMessage = {
  type: typeof WEBSITE_V3_APPLIED;
  revision: number;
  contentRevision: number;
  activePageKey: string;
  device: "desktop" | "mobile";
};

export type WebsiteV3ReadyMessage = {
  type: typeof WEBSITE_V3_READY;
};

export type WebsiteV3NavigateMessage = {
  type: typeof WEBSITE_V3_NAVIGATE;
  pageKey: string;
};

/** Injects eligibility into a preview copy, hiding Stories while it is unknown. */
export function withWebsiteV3PreviewNavigationState(
  state: DraftStatePayload,
  storiesNavigationAvailable: boolean | undefined,
): DraftStatePayload {
  return {
    ...state,
    config: {
      ...state.config,
      stories_navigation_available: storiesNavigationAvailable === true,
    },
  };
}

/** Narrows untrusted data to the Website V3 state wire envelope. */
export function isWebsiteV3StateMessage(
  data: unknown,
): data is WebsiteV3StateMessage {
  if (!hasExactKeys(data, [
    "type",
    "revision",
    "contentRevision",
    "restaurantId",
    "activePageKey",
    "device",
    "state",
  ])) {
    return false;
  }

  return (
    data.type === WEBSITE_V3_STATE &&
    isRevision(data.revision) &&
    isRevision(data.contentRevision) &&
    isPositiveInteger(data.restaurantId) &&
    isNonEmptyString(data.activePageKey) &&
    (data.device === "desktop" || data.device === "mobile") &&
    isDraftStatePayload(data.state)
  );
}

/** Narrows untrusted data to the exact Website V3 applied wire shape. */
export function isWebsiteV3AppliedMessage(
  data: unknown,
): data is WebsiteV3AppliedMessage {
  return (
    hasExactKeys(data, [
      "type",
      "revision",
      "contentRevision",
      "activePageKey",
      "device",
    ]) &&
    data.type === WEBSITE_V3_APPLIED &&
    isRevision(data.revision) &&
    isRevision(data.contentRevision) &&
    isNonEmptyString(data.activePageKey) &&
    (data.device === "desktop" || data.device === "mobile")
  );
}

/** Narrows untrusted data to the exact Website V3 ready wire shape. */
export function isWebsiteV3ReadyMessage(
  data: unknown,
): data is WebsiteV3ReadyMessage {
  return hasExactKeys(data, ["type"]) && data.type === WEBSITE_V3_READY;
}

/** Narrows a preview navigation request to its exact wire shape. */
export function isWebsiteV3NavigateMessage(
  data: unknown,
): data is WebsiteV3NavigateMessage {
  return (
    hasExactKeys(data, ["type", "pageKey"]) &&
    data.type === WEBSITE_V3_NAVIGATE &&
    isNonEmptyString(data.pageKey)
  );
}

function isDraftStatePayload(value: unknown): value is DraftStatePayload {
  if (!isRecord(value) || !isRecord(value.config)) return false;
  if (value.pages !== undefined && !Array.isArray(value.pages)) return false;
  if (!Array.isArray(value.sections)) return false;
  if (!isIntegerArray(value.deleted_section_ids)) return false;
  return (
    value.deleted_page_ids === undefined ||
    isIntegerArray(value.deleted_page_ids)
  );
}

function hasExactKeys<T extends string>(
  value: unknown,
  keys: readonly T[],
): value is Record<T, unknown> {
  if (!isRecord(value)) return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isRevision(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(Number.isInteger);
}
