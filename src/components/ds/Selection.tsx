'use client';

import { forwardRef, useId, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Shared visual language for a selected radio or checkbox, without extra semantics. */
export function SelectionIndicator({ checked, multiple = false }: { checked: boolean; multiple?: boolean }) {
  return <span aria-hidden="true" className={cn('selection-indicator', multiple ? 'selection-checkbox' : 'selection-radio')} data-checked={checked} />;
}

/** Yes/no segments for a single accessible switch; pointer choices are explicit. */
export function BooleanIndicator({ checked }: { checked: boolean }) {
  const { t } = useI18n();
  return <span aria-hidden="true" className="boolean-segments">
    <span data-value="true" data-active={checked}>{t('yes')}</span>
    <span data-value="false" data-active={!checked}>{t('no')}</span>
  </span>;
}

/** Native switch adapter retaining form events, labels, and fieldset disabling. */
export const BooleanInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'>>(
  function BooleanInput({ className, ...props }, forwardedRef) {
    const input = useRef<HTMLInputElement | null>(null);
    const { t } = useI18n();
    return <span className="boolean-input">
      <input {...props} type="checkbox" role="switch" className={cn('boolean-input-field', className)} ref={element => {
        input.current = element;
        if (typeof forwardedRef === 'function') forwardedRef(element);
        else if (forwardedRef) forwardedRef.current = element;
      }} />
      <span aria-hidden="true" className="boolean-segments">
        {[true, false].map(value => <span key={String(value)} data-value={String(value)} onClick={event => {
          // Cancel the enclosing label's implicit toggle, including on the active segment.
          event.preventDefault();
          if (input.current && !input.current.matches(':disabled') && input.current.checked !== value) input.current.click();
          input.current?.focus();
        }}>{t(value ? 'yes' : 'no')}</span>)}
      </span>
    </span>;
  },
);

/** Full-width labelled option. Native radio names provide arrow-key group navigation. */
export function ChoiceRow({ label, description, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  label: ReactNode;
  description?: ReactNode;
}) {
  const id = useId();
  return <label className={cn('choice-row', className)}>
    <span className="choice-copy"><span className="choice-title">{label}</span>{description && <span id={`${id}-hint`} className="choice-description">{description}</span>}</span>
    <input {...props} type={props.type ?? 'checkbox'} aria-describedby={props['aria-describedby'] ?? (description ? `${id}-hint` : undefined)} />
  </label>;
}
