const PRODUCTION_ADMIN_HOST = "admin.foody-pos.co.il";
const DEVELOPMENT_ADMIN_HOST = "dev-admin.foody-pos.co.il";
const PRODUCTION_WEB_ORIGIN = "https://app.foody-pos.co.il";
const DEVELOPMENT_WEB_ORIGIN = "https://dev-app.foody-pos.co.il";

/**
 * Resolves the guest-web origin that must render a Website V3 preview.
 *
 * An explicit deployment value wins. Otherwise the admin hostname determines
 * the matching environment, preventing a dev builder from silently embedding
 * the production storefront when its public environment variable is missing.
 */
export function resolveWebsiteV3PreviewOrigin(
  configuredOrigin: string | undefined,
  adminOrigin: string | undefined,
): string {
  const configured = httpOrigin(configuredOrigin);
  if (configured) return configured;

  const admin = httpURL(adminOrigin);
  if (!admin) return DEVELOPMENT_WEB_ORIGIN;

  if (admin.hostname === PRODUCTION_ADMIN_HOST) {
    return PRODUCTION_WEB_ORIGIN;
  }
  if (admin.hostname === DEVELOPMENT_ADMIN_HOST) {
    return DEVELOPMENT_WEB_ORIGIN;
  }
  if (isLocalHostname(admin.hostname)) {
    return `${admin.protocol}//${admin.hostname}:3000`;
  }

  // Preview deployments belong to the development data plane unless they
  // explicitly declare another guest-web origin.
  return DEVELOPMENT_WEB_ORIGIN;
}

function httpOrigin(value: string | undefined): string | null {
  return httpURL(value)?.origin ?? null;
}

function httpURL(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}
