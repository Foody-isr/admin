import { parsePhoneNumberFromString } from 'libphonenumber-js/core';
import metadata from 'libphonenumber-js/metadata.max.json';

/** Validate the whole input and return E.164, without asserting WhatsApp registration. */
export function normalizeCustomerPhone(value: string, callingCode = '+972'): string | null {
  const input = value.trim();
  if (!input || input.length > 80 || !/^[+0-9\s().-]+$/.test(input)) return null;
  let compact = input.replace(/[\s().-]/g, '');
  if (compact.startsWith('00')) compact = '+' + compact.slice(2);
  else if (compact.startsWith('972')) compact = '+' + compact;
  if (!/^\+?\d+$/.test(compact)) return null;
  const phone = parsePhoneNumberFromString(compact, {
    defaultCallingCode: callingCode.replace(/^\+/, ''),
    extract: false,
  }, metadata);
  return phone?.isValid() && !phone.ext ? phone.number : null;
}
