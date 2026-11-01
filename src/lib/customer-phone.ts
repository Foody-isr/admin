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

/** Validate contact drafts in display order, comparing their normalized numbers. */
export function validateCustomerPhones(phones: readonly { phone: string }[]) {
  const normalized = phones.map(contact => normalizeCustomerPhone(contact.phone));
  const issues = phones.map((contact, index) => {
    if (!contact.phone.trim()) return index === 0 ? 'customerPrimaryPhoneRequired' : 'customerAdditionalPhoneRequired';
    if (!normalized[index]) return 'customerPhoneInvalidHelp';
    if (normalized.indexOf(normalized[index]) !== index) return 'customerPhoneDuplicateHelp';
    return null;
  });
  return { normalized, issues, firstIssue: issues.findIndex(issue => issue !== null) };
}
