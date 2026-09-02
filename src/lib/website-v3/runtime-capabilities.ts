const REQUIRED_PROTOCOL = "foody.website-v3";
const REQUIRED_VERSION = 1;
const REQUIRED_PAGE_TYPES = ["landing", "content", "order", "catering"] as const;
const REQUIRED_SURFACES = ["page", "checkout"] as const;

export type WebsiteV3RuntimeCapabilities = {
  protocol: typeof REQUIRED_PROTOCOL;
  version: number;
  page_types: string[];
  surfaces: string[];
};

/** Ensures the selected public storefront can render every Website V3 draft the Admin can publish. */
export async function requireWebsiteV3RuntimeCapabilities(
  webOrigin: string,
  fetcher: typeof fetch = fetch,
): Promise<WebsiteV3RuntimeCapabilities> {
  const endpoint = new URL("/api/website-v3-capabilities", webOrigin);
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw incompatibleRuntimeError();
  }
  if (!response.ok) throw incompatibleRuntimeError();

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw incompatibleRuntimeError();
  }
  if (!isCompatible(payload)) throw incompatibleRuntimeError();
  return payload;
}

function isCompatible(value: unknown): value is WebsiteV3RuntimeCapabilities {
  if (!isRecord(value)) return false;
  if (value.protocol !== REQUIRED_PROTOCOL || value.version !== REQUIRED_VERSION) {
    return false;
  }
  const pageTypes = value.page_types;
  const surfaces = value.surfaces;
  if (!isStringArray(pageTypes) || !isStringArray(surfaces)) {
    return false;
  }
  return (
    REQUIRED_PAGE_TYPES.every((type) => pageTypes.includes(type)) &&
    REQUIRED_SURFACES.every((surface) => surfaces.includes(surface))
  );
}

function incompatibleRuntimeError(): Error {
  return new Error(
    "Le site public n’est pas compatible avec Website V3. La création et la publication sont suspendues pour éviter un site incomplet. Déployez d’abord la version compatible de Foody Web, puis réessayez.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
