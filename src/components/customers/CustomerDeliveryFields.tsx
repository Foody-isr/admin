'use client';

import { Field, Input, Textarea } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

/** The delivery fields that describe where a customer is. Kept as one value so
 *  no caller can save half an address. */
export interface CustomerDeliveryValue {
  address: string;
  city: string;
  floor: string;
  apt: string;
  entryCode: string;
  deliveryNotes: string;
}

export const EMPTY_DELIVERY: CustomerDeliveryValue = {
  address: '',
  city: '',
  floor: '',
  apt: '',
  entryCode: '',
  deliveryNotes: '',
};

interface Props {
  value: CustomerDeliveryValue;
  /** Receives only the changed field, so callers keep their own state shape. */
  onChange: (patch: Partial<CustomerDeliveryValue>) => void;
  disabled?: boolean;
  /** Order-specific content shown under the address line — the manual order
   *  sheet puts the linked customer's known addresses there. A slot rather than
   *  a flag to drop the address field: the form stays whole everywhere, so a
   *  field added here cannot appear on one screen and not the other. */
  underAddress?: React.ReactNode;
}

/**
 * The customer's delivery details, rendered identically wherever staff edit
 * them: the manual order sheet and the Clients page.
 *
 * The two screens used to each carry their own copy — different primitives,
 * different label keys, a 3-column grid on one and 2 on the other — so the same
 * customer offered a different form depending on where you opened them. Editing
 * one form is the whole point of this component; if a field belongs on a
 * customer, it belongs here and appears on both screens at once.
 */
export function CustomerDeliveryFields({ value, onChange, disabled, underAddress }: Props) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t('deliveryAddress')}>
        <Input
          value={value.address}
          disabled={disabled}
          onChange={(e) => onChange({ address: e.target.value })}
        />
      </Field>
      {underAddress}
      <div className="grid grid-cols-3 gap-2">
        <Field label={t('city')} className="col-span-1">
          <Input
            value={value.city}
            disabled={disabled}
            onChange={(e) => onChange({ city: e.target.value })}
          />
        </Field>
        <Field label={t('floor')} className="col-span-1">
          <Input
            value={value.floor}
            disabled={disabled}
            onChange={(e) => onChange({ floor: e.target.value })}
          />
        </Field>
        <Field label={t('apt')} className="col-span-1">
          <Input
            value={value.apt}
            disabled={disabled}
            onChange={(e) => onChange({ apt: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t('buildingCode')}>
        <Input
          value={value.entryCode}
          disabled={disabled}
          onChange={(e) => onChange({ entryCode: e.target.value })}
        />
      </Field>
      <Field label={t('deliveryNotes')}>
        <Textarea
          value={value.deliveryNotes}
          disabled={disabled}
          onChange={(e) => onChange({ deliveryNotes: e.target.value })}
        />
      </Field>
    </>
  );
}
