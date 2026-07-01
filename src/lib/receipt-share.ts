// Pure helpers for sharing an order receipt with the customer via device
// deep-links (WhatsApp / email). Framework-free and side-effect-free so the
// order drawer stays thin and these stay trivially correct. The component
// resolves i18n strings and passes them in; nothing here imports React or i18n.

/** Base URL of the guest-facing foodyweb app, where the receipt page lives. */
export const WEB_BASE_URL =
  process.env.NEXT_PUBLIC_WEB_URL || 'https://app.foody-pos.co.il';

/** Public receipt page URL for an order, or '' when the order has no token. */
export function receiptShareUrl(token: string | undefined | null): string {
  return token ? `${WEB_BASE_URL}/receipt/${token}` : '';
}

/**
 * Fill the share-message template. Tokens: {name} {id} {total} {url}.
 * {name} is injected WITH a leading space (or '' when absent) so the greeting
 * reads cleanly with or without a customer name (template has "Bonjour{name},").
 * Trailing whitespace (e.g. when there is no url) is trimmed off.
 */
export function buildShareMessage(opts: {
  template: string;
  name?: string;
  id: number;
  total: number;
  url: string;
}): string {
  const rawName = (opts.name || '').trim();
  const namePart = rawName ? ` ${rawName}` : '';
  return opts.template
    .replace('{name}', namePart)
    .replace('{id}', String(opts.id))
    .replace('{total}', opts.total.toFixed(2))
    .replace('{url}', opts.url)
    .trim();
}

/** wa.me deep link, or '' when the phone has no usable digits. */
export function buildWhatsAppUrl(phone: string | undefined, text: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** mailto: link. `email` may be '' so the To field is left blank for staff to type. */
export function buildMailtoUrl(
  email: string | undefined,
  subject: string,
  body: string,
): string {
  const to = (email || '').trim();
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
