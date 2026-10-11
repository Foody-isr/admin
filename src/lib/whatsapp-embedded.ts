export interface WhatsAppSignupIdentity {
  waba_id: string;
  phone_number_id: string;
}
export type WhatsAppSignupEvent = { kind: 'finished'; identity: WhatsAppSignupIdentity } | { kind: 'cancelled' | 'failed' };

/** Accept Embedded Signup messages only from HTTPS Facebook origins with a valid payload. */
export function parseWhatsAppSignupEvent(origin: string, payload: unknown): WhatsAppSignupEvent | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.port || !(url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))) return null;
    const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
    if (!data || typeof data !== 'object' || data.type !== 'WA_EMBEDDED_SIGNUP') return null;
    if (data.event === 'CANCEL') return { kind: 'cancelled' };
    if (data.event === 'ERROR') return { kind: 'failed' };
    if (data.event !== 'FINISH') return null;
    const waba = data.data?.waba_id, phone = data.data?.phone_number_id;
    if (typeof waba !== 'string' || typeof phone !== 'string' || !waba.trim() || !phone.trim() || waba.length > 128 || phone.length > 128) return null;
    return { kind: 'finished', identity: { waba_id: waba.trim(), phone_number_id: phone.trim() } };
  } catch { return null; }
}

/** Normalize owner-entered international numbers without inferring a country code. */
export function normalizeWhatsAppPhone(value: string): string | null {
  const normalized = value.replace(/[\s().-]/g, '');
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
}
