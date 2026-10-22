'use client';

import { useId } from 'react';
import { Switch } from '@/components/ui/switch';

/** Explicitly turn saved order slots into routing constraints for this route. */
export function OrderWindowField({ checked, onChange, disabled, t }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  t: (key: string) => string;
}) {
  const id = useId();
  return <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <label htmlFor={id} className="text-fs-xs font-medium text-[var(--fg-muted)]">{t('respectOrderWindowsLabel')}</label>
      <p id={`${id}-hint`} className="mt-1 text-fs-xs leading-relaxed text-[var(--fg-subtle)]">{t('respectOrderWindowsHint')}</p>
    </div>
    <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-describedby={`${id}-hint`} />
  </div>;
}
