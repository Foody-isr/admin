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
  addressInputProps?: Pick<React.InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-invalid' | 'aria-describedby' | 'aria-label'>;
  addressError?: React.ReactNode;
  /** An address picker that fills both the street and city. Unit fields are shared. */
  addressControl?: React.ReactNode;
  /** Order-specific content shown under the address line — the manual order
   *  sheet puts the linked customer's known addresses there. A slot rather than
   *  a flag to drop the address field: the form stays whole everywhere, so a
   *  field added here cannot appear on one screen and not the other. */
  underAddress?: React.ReactNode;
}

/** Shared street, city and unit fields for staff delivery details. */
export function CustomerDeliveryFields({ value, onChange, disabled, underAddress, addressInputProps, addressError, addressControl }: Props) {
  const { t } = useI18n();
  return (
    <>
      {addressControl ? <div className="min-w-0">{addressControl}{addressError}</div> : <Field label={t('deliveryAddress')}>
        <Input
          {...addressInputProps}
          dir="auto"
          value={value.address}
          disabled={disabled}
          onChange={(e) => onChange({ address: e.target.value })}
        />
        {addressError}
      </Field>}
      {underAddress}
      <div className={addressControl ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-3 gap-2'}>
        {!addressControl && <Field label={t('city')} className="col-span-1">
          <Input
          dir="auto"
            value={value.city}
            disabled={disabled}
            onChange={(e) => onChange({ city: e.target.value })}
          />
        </Field>}
        <Field label={t('floor')} className="col-span-1">
          <Input
          dir="auto"
            value={value.floor}
            disabled={disabled}
            onChange={(e) => onChange({ floor: e.target.value })}
          />
        </Field>
        <Field label={t('apt')} className="col-span-1">
          <Input
          dir="auto"
            value={value.apt}
            disabled={disabled}
            onChange={(e) => onChange({ apt: e.target.value })}
          />
        </Field>
      </div>
      <Field label={t('buildingCode')}>
        <Input
          dir="auto"
          value={value.entryCode}
          disabled={disabled}
          onChange={(e) => onChange({ entryCode: e.target.value })}
        />
      </Field>
      <Field label={t('deliveryNotes')}>
        <Textarea
          dir="auto"
          value={value.deliveryNotes}
          disabled={disabled}
          onChange={(e) => onChange({ deliveryNotes: e.target.value })}
        />
      </Field>
    </>
  );
}
