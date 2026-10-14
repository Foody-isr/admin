'use client';

import type { InputHTMLAttributes, ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ChevronDown, X } from 'lucide-react';
import { Button, Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

/** Labelled table row matching the event editor's Square reference. */
export function CalendarField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid min-w-0 grid-cols-[minmax(0,38%)_minmax(0,1fr)] text-sm leading-5">
    <span className="flex min-h-12 items-center bg-[#f2f2f2] dark:bg-[var(--surface-2)] px-4 py-3 font-semibold">{label}</span>
    <span className="min-w-0 focus-within:shadow-[inset_0_-2px_0_var(--fg)] [&_input]:h-12 [&_input]:rounded-none [&_input]:border-0 [&_input]:px-4 [&_input:focus]:shadow-none [&_select]:h-12 [&_select]:rounded-none [&_select]:border-0 [&_select]:px-4 [&_select:focus]:shadow-none [&_textarea]:h-20 [&_textarea]:min-h-20 [&_textarea]:rounded-none [&_textarea]:border-0 [&_textarea]:px-4 [&_textarea]:py-3 [&_textarea:focus]:shadow-none">{children}</span>
  </label>;
}

/** Shows a localized long date while retaining native date entry and validation. */
export function CalendarDateInput({ value, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value: string }) {
  const { locale } = useI18n();
  const date = new Date(`${value}T12:00:00Z`);
  const label = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(date) : '';
  return <span className="relative block h-12">
    <span aria-hidden className="flex h-12 min-w-0 items-center justify-between gap-2 px-4"><span className="min-w-0 truncate" title={label}>{label}</span><ChevronDown className="size-4 shrink-0" /></span>
    <Input {...props} type="date" value={value} dir="ltr" className="absolute inset-0 opacity-0" onClick={event => { props.onClick?.(event); if (!event.defaultPrevented) event.currentTarget.showPicker?.(); }} />
  </span>;
}

/** Centered event editor with a fixed close control and save footer. */
export function CalendarDialog({ open, title, onClose, onSave, saving, saveDisabled, footer, children }: {
  open: boolean; title: string; onClose: () => void; onSave?: () => void; saving: boolean; saveDisabled: boolean; footer?: ReactNode; children: ReactNode;
}) {
  const { t, direction } = useI18n();
  const focus = useDialogReturnFocus();
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" />
    <Dialog.Content {...focus} dir={direction} aria-describedby={undefined} data-calendar-dialog className="fixed start-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px-var(--safe-top)-var(--safe-bottom))] w-[600px] max-w-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-[var(--surface)] text-[var(--fg)] outline-none rtl:translate-x-1/2" style={{ fontFamily: "'Orders Sans', var(--font-sans)" }}>
      <div className="grid min-h-[72px] shrink-0 grid-cols-[48px_minmax(0,1fr)_48px] items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <Button type="button" variant="ghost" icon disabled={saving} aria-label={t('close')} onClick={onClose} className="min-h-12 w-12 bg-[#f2f2f2] dark:bg-[var(--surface-2)] text-[var(--fg)] [&_svg]:size-5"><X /></Button>
        <Dialog.Title className="text-center text-xl font-semibold leading-7 sm:text-2xl">{title}</Dialog.Title><span aria-hidden />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">{children}</div>
      {(onSave || footer) && <div className="flex min-h-20 shrink-0 items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-4">
        <div>{footer}</div>{onSave && <Button type="button" onClick={onSave} disabled={saveDisabled} className="min-h-12 min-w-[104px] px-4 text-sm">{saving ? t('saving') : t('save')}</Button>}
      </div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
