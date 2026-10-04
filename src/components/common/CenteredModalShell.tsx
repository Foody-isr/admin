'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import { Button } from '@/components/ds';

interface Props {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  maxWidth?: string;
  children: React.ReactNode;
}

/** Constrained route editor with fixed actions and a keyboard-accessible body. */
export default function CenteredModalShell({ title, onClose, onSave, saving = false, saveDisabled = false, saveLabel, maxWidth = 'max-w-3xl', children }: Props) {
  const { t } = useI18n();
  const focus = useDialogReturnFocus();
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
      <Dialog.Content {...focus} aria-describedby={undefined} className={`fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-1.5rem)] ${maxWidth} max-h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom))] flex flex-col overflow-hidden rounded-r-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] shadow-3`}>
        <div className="flex shrink-0 items-center gap-3 px-4 sm:px-6 py-3 border-b border-[var(--line)]">
          <Dialog.Close asChild><Button variant="ghost" icon aria-label={t('cancel')}><X /></Button></Dialog.Close>
          <Dialog.Title className="flex-1 min-w-0 text-base font-semibold leading-snug">{title || t('loading')}</Dialog.Title>
          {onSave && <div className="flex shrink-0 gap-2">
            <Button variant="secondary" onClick={onClose} className="hidden sm:inline-flex">{t('cancel')}</Button>
            <Button onClick={onSave} disabled={saving || saveDisabled}>{saving ? t('saving') : saveLabel || t('save')}</Button>
          </div>}
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
