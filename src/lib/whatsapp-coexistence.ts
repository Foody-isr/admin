/** The coexistence completion event may omit phone_number_id; the API resolves it securely. */
export interface CoexistenceIdentity { waba_id: string; phone_number_id?: string }
export type CoexistenceEvent = { kind: 'finished'; identity: CoexistenceIdentity } | { kind: 'cancelled' | 'failed' };

/** Accept only documented Facebook origins and the Business App onboarding completion event. */
export function parseCoexistenceEvent(origin: string, payload: unknown): CoexistenceEvent | null {
  if (!['https://www.facebook.com', 'https://web.facebook.com', 'https://business.facebook.com', 'https://facebook.com'].includes(origin)) return null;
  try {
    const event = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!event || typeof event !== 'object' || event.type !== 'WA_EMBEDDED_SIGNUP') return null;
    if (event.event === 'CANCEL') return { kind: 'cancelled' };
    if (event.event === 'ERROR') return { kind: 'failed' };
    if (event.event !== 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') return null;
    const waba = event.data?.waba_id, phone = event.data?.phone_number_id;
    const valid = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,63}$/.test(value);
    if (!valid(waba) || (phone != null && !valid(phone))) return null;
    return { kind: 'finished', identity: { waba_id: waba, ...(phone ? { phone_number_id: phone } : {}) } };
  } catch { return null; }
}

/** Extract the authorization code only; browser access tokens are never accepted or persisted. */
export function coexistenceCode(response: unknown): string | null {
  if (!response || typeof response !== 'object' || !('authResponse' in response)) return null;
  const auth = response.authResponse;
  if (!auth || typeof auth !== 'object' || !('code' in auth)) return null;
  return typeof auth.code === 'string' && auth.code.length > 0 && auth.code.length <= 8192 ? auth.code : null;
}

/** Consumes the SDK code once; optional session hints never delay its server-side exchange. */
export class CoexistenceAttempt {
  private code: string | null = null;
  private identity: CoexistenceIdentity | null = null;
  private stopped = false;
  constructor(readonly state: string) {}
  /** Discard credentials and ignore callbacks after cancellation, unmount or submission. */
  cancel() { this.stopped = true; this.code = null; this.identity = null; }
  /** Accept the current SDK callback's single-use authorization code. */
  acceptCode(code: string) { if (!this.stopped) this.code = code; }
  /** Accept a verified session completion identity for this attempt. */
  acceptIdentity(identity: CoexistenceIdentity) { if (!this.stopped) this.identity = identity; }
  /** Exchange promptly even when Meta omits or delays the session completion message. */
  take(): ({ state: string; code: string } & Partial<CoexistenceIdentity>) | null {
    if (this.stopped || !this.code) return null;
    const input = { state: this.state, code: this.code, ...this.identity };
    this.cancel(); return input;
  }
}
