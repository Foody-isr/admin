/** Select the API and guest site from a recognized deployed Admin hostname. */
export function adminRuntimeOrigins(hostname: string | undefined, api: string, web: string) {
  if (hostname === 'admin.foody-pos.co.il') {
    return { api: 'https://api.foody-pos.co.il', web: 'https://app.foody-pos.co.il' };
  }
  if (hostname === 'dev-admin.foody-pos.co.il') {
    return { api: 'https://dev-api.foody-pos.co.il', web: 'https://dev-app.foody-pos.co.il' };
  }
  return { api, web };
}

const origins = adminRuntimeOrigins(
  typeof window === 'undefined' ? undefined : window.location.hostname,
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il',
);

/** API origin for this deployment, including an immutable preview promoted to production. */
export const RUNTIME_API_URL = origins.api;
/** Guest-site origin paired with the current Admin environment. */
export const RUNTIME_WEB_URL = origins.web;
