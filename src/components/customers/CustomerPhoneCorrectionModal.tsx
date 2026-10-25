'use client';

import { useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { Button, Field, Input } from '@/components/ds';
import { correctCustomerPhones } from '@/lib/api';
import { normalizeCustomerPhone } from '@/lib/customer-phone';
import { useI18n } from '@/lib/i18n';
import { useCustomerFormSession, type CustomerEditorTarget } from './CustomerForms';

/** Review and atomically save a phone correction for one or several customers. */
export function CustomerPhoneCorrectionModal({ restaurantId, rows, onClose, onSaved }: {
  restaurantId: number;
  rows: CustomerEditorTarget[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [values, setValues] = useState(() => rows.map(row => normalizeCustomerPhone(row.phone) ?? row.phone));
  const [attempted, setAttempted] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const session = useCustomerFormSession(JSON.stringify(values), onClose);
  const normalized = values.map(value => normalizeCustomerPhone(value));
  const duplicate = normalized.some((phone, index) => phone && normalized.indexOf(phone) !== index);
  const save = () => {
    setAttempted(true);
    if (normalized.some(phone => !phone) || duplicate) return;
    void session.run(async () => {
      try {
        await correctCustomerPhones(restaurantId, rows.map((row, index) => ({ phone: row.phone, replacement: normalized[index]! })));
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        const key = code === 'customer_phone_conflict' ? 'customerPhoneConflict'
          : code === 'customer_phone_not_found' ? 'customerPhoneNotFound'
          : code === 'invalid_customer_phone' ? 'invalidCustomerPhone' : 'customerPhoneSaveFailed';
        throw new Error(t(key));
      }
    }, onSaved);
  };
  return <>
    <Modal title={t('correctCustomerPhones')} size="lg" initialFocusRef={first} onClose={session.close} closeDisabled={session.busy}
      footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved ? 'close' : 'cancel')}</Button>
        <Button form="customer-phones-form" type="submit" disabled={session.busy || !session.canManage}>{t(session.busy ? 'saving' : session.saved ? 'retry' : 'save')}</Button>
      </div></div>}>
      <p className="mb-4 text-sm leading-6 text-[var(--fg-muted)]">{t('customerPhoneCorrectionHint')}</p>
      <form id="customer-phones-form" onSubmit={event => { event.preventDefault(); save(); }}>
        <fieldset disabled={session.frozen} className="space-y-5">
          {rows.map((row, index) => <section key={row.phone} className="space-y-2 border-b border-[var(--line)] pb-4">
            <p className="text-sm font-semibold" dir="auto">{row.name || row.phone}</p>
            <p className="text-sm text-[var(--fg-muted)]">{t('customerPhoneBefore')}: <bdi dir="ltr">{row.phone}</bdi></p>
            <Field label={t('phoneNumber')}>
              <Input ref={index === 0 ? first : undefined} type="tel" autoComplete="tel" dir="ltr" value={values[index]}
                aria-invalid={attempted && !normalized[index]} aria-describedby={`phone-preview-${index}`}
                onChange={event => setValues(current => current.map((value, i) => i === index ? event.target.value : value))} />
            </Field>
            <p id={`phone-preview-${index}`} role={attempted && !normalized[index] ? 'alert' : 'status'} className="text-sm">
              {normalized[index] ? <>{t('customerPhoneAfter')}: <bdi dir="ltr">{normalized[index]}</bdi></> : t(attempted ? 'invalidCustomerPhone' : 'customerPhoneFormatHint')}
            </p>
          </section>)}
          {attempted && duplicate && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('customerPhoneConflict')}</p>}
        </fieldset>
      </form>
    </Modal>
    {session.confirmation}
  </>;
}
