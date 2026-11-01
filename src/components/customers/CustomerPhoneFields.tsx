'use client';

import { useRef, useState } from 'react';
import { Button, Field, Input } from '@/components/ds';
import { normalizeCustomerPhone, validateCustomerPhones } from '@/lib/customer-phone';
import { useI18n } from '@/lib/i18n';

/** A local contact draft retains its original identity until the profile is saved. */
export interface CustomerPhoneDraft {
  id: string;
  originalPhone?: string;
  phone: string;
  isWhatsApp: boolean;
}

/** Edit contact numbers and choose one WhatsApp recipient in the customer form. */
export function CustomerPhoneFields({ value, onChange, attempted, disabled }: {
  value: CustomerPhoneDraft[];
  onChange: (value: CustomerPhoneDraft[]) => void;
  attempted: boolean;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const nextId = useRef(0);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const { normalized, issues } = validateCustomerPhones(value);
  return <fieldset className="min-w-0 space-y-4 border-t border-[var(--line)] pt-4" disabled={disabled}>
    <legend className="px-1 text-sm font-semibold">{t('customerContactPhones')}</legend>
    <p className="text-sm text-[var(--fg-muted)]">{t('customerWhatsAppPhoneHint')}</p>
    {value.map((contact, index) => {
      const showError = attempted || touched.has(contact.id) || (!!contact.originalPhone && !normalizeCustomerPhone(contact.originalPhone));
      const error = showError && issues[index] ? t(issues[index]) : '';
      return <div key={contact.id} className="space-y-2" data-customer-phone={index}>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><Field label={t(index === 0 ? 'customerPrimaryPhone' : 'customerAdditionalPhone')}>
          <Input type="tel" dir="ltr" autoComplete="tel" value={contact.phone}
            id={`customer-phone-${contact.id}`}
            aria-invalid={!!error} aria-describedby={`customer-phone-help-${index}`}
            className={error ? 'border-[var(--danger-500)] hover:border-[var(--danger-500)] focus:border-[var(--danger-500)]' : undefined}
            onBlur={() => setTouched(current => new Set(current).add(contact.id))}
            onChange={event => onChange(value.map((row, i) => i === index ? { ...row, phone: event.target.value } : row))}/>
        </Field></div>
        {index > 0 && <Button type="button" variant="ghost" aria-label={`${t('removeCustomerPhone')} ${index + 1}`} onClick={() => {
          const next = value.filter((_, i) => i !== index);
          if (contact.isWhatsApp) next[0] = { ...next[0], isWhatsApp: true };
          onChange(next);
        }}>{t('removeCustomerPhone')}</Button>}
      </div>
      <p id={`customer-phone-help-${index}`} role={error ? 'alert' : undefined} className={`text-sm ${error ? 'text-[var(--danger-500)]' : 'text-[var(--fg-muted)]'}`}>
        {error || (normalized[index] ? <>{t('customerPhoneAfter')}: <bdi dir="ltr">{normalized[index]}</bdi></> : t('customerPhoneFormatHint'))}
      </p>
      <label className="selection-row flex min-h-11 items-center justify-between gap-4 text-sm">
        <span>{t('customerUseForWhatsApp')}</span>
        <input type="radio" name="customer-whatsapp-phone" checked={contact.isWhatsApp}
          onChange={() => onChange(value.map((row, i) => ({ ...row, isWhatsApp: i === index })))} />
      </label>
    </div>;
    })}
    {value.length < 10 && <Button type="button" variant="secondary" onClick={() => onChange([...value, { id: `new-${nextId.current++}`, phone: '', isWhatsApp: false }])}>{t('addCustomerPhone')}</Button>}
    {value.length > 1 && <p className="text-sm text-[var(--fg-muted)]">{t('customerRemovePhoneHint')}</p>}
  </fieldset>;
}
