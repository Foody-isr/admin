'use client';

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Opens table display options from the circular control in the last header cell. */
export function ColumnPicker({ children }: { children: ReactNode }) {
  const { t, direction } = useI18n();
  const isRtl = direction === 'rtl';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={t('columns')} title={t('columns')}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full align-middle text-[var(--fg-muted)] outline-none focus-visible:shadow-ring [&[data-state=open]>span]:ring-2 [&[data-state=open]>span]:ring-[var(--fg-muted)]">
          <span className="grid size-[22px] place-items-center rounded-full bg-[var(--surface-2)] hover:bg-[var(--line)]"><Plus aria-hidden className="size-4" /></span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={16} aria-label={t('columns')} dir={isRtl ? 'rtl' : 'ltr'}
        className="max-h-[min(420px,80dvh)] w-72 max-w-[calc(100vw-32px)] overflow-y-auto rounded-md border-0 bg-[var(--surface)] p-2 text-start text-sm font-normal normal-case tracking-normal shadow-lg">
        {children}
      </PopoverContent>
    </Popover>
  );
}
