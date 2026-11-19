// The API encrypts the JWT signature and binds it to a host-only HttpOnly cookie.
// Public claims remain available for tenant selection and expiry checks.
const referenceFormat = /^fp1[sp]\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{1,32}\.[0-9a-f]+$/;

/** Recognizes the API's encrypted, cookie-bound session reference. */
export function isPortalSession(value: unknown): value is string {
  return typeof value === 'string' && referenceFormat.test(value);
}

/** Sends the HttpOnly binding exclusively to the selected API with its matching reference. */
export function portalRequest(api: string, url: string, options?: RequestInit): Promise<Response> {
  const authorization = new Headers(options?.headers).get('Authorization');
  if (!authorization?.startsWith('Bearer fp1')) return fetch(url, options);
  if (new URL(url).origin !== new URL(api).origin) throw new Error('Unexpected portal API origin');
  return fetch(url, { ...options, credentials: 'include', redirect: 'error', cache: 'no-store' });
}

/** Exchanges a completed sign-in for a protected session before writing browser storage. */
export async function bindPortalSession(api: string, token: string, remember: boolean): Promise<string> {
  const response = await fetch(api + '/api/v1/auth/portal-session', {
    method: 'POST', redirect: 'error', cache: 'no-store', credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ remember }),
  });
  if (!response.ok) throw new Error('Could not secure the browser session');
  const body = await response.json();
  if (!isPortalSession(body.session)) throw new Error('Invalid protected session');
  const status = await portalRequest(api, api + '/api/v1/auth/security', { headers: { Authorization: 'Bearer ' + body.session } });
  if (!status.ok) throw new Error('Browser session cookie unavailable');
  return body.session;
}

/** Expires the matching API cookie even when local logout triggers navigation. */
export async function endPortalSession(api: string, reference: string): Promise<void> {
  const response = await portalRequest(api, api + '/api/v1/auth/portal-session', {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + reference }, keepalive: true,
  });
  if (!response.ok && response.status !== 401) throw new Error('Could not clear the browser session cookie');
}
