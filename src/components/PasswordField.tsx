'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
}

/** Labelled password input with an explicit, keyboard-accessible visibility control. */
export function PasswordField({ label, error, id, className, ...props }: PasswordFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-fg-primary">{label}</label>
      <div className="relative" dir={props.dir}>
        <input {...props} id={fieldId} type={visible ? 'text' : 'password'}
          className={cn('input pe-12', className)}
          aria-invalid={error ? true : props['aria-invalid']}
          aria-describedby={[props['aria-describedby'], error ? `${fieldId}-error` : ''].filter(Boolean).join(' ') || undefined} />
        <button type="button" disabled={props.disabled} aria-controls={fieldId} aria-pressed={visible}
          aria-label={`${t(visible ? 'hidePassword' : 'showPassword')} · ${label}`}
          onClick={() => setVisible(value => !value)}
          className="absolute end-0 top-0 grid h-full w-11 place-items-center rounded-r-md text-fg-secondary hover:text-fg-primary disabled:opacity-50">
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {error && <p id={`${fieldId}-error`} className="mt-2 text-xs text-[var(--danger-500)]">{error}</p>}
    </div>
  );
}
