'use client';

import { Save, X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';
import { usePermissions } from '@/lib/permissions-context';

interface Props {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

/** Accessible item editor with a summary rail and independently scrollable form. */
export default function MenuItemShell({
  title,
  onClose,
  onSave,
  saving = false,
  saveDisabled = false,
  sidebar,
  children,
}: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const focus = useDialogReturnFocus();

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />

      {/* Inset container — 32px top, 24px bottom, 24px each side on desktop;
          full-screen edge-to-edge on mobile. Symmetric left/right insets
          (no transform centering) keeps the modal correctly centered in
          RTL as well as LTR — left:50% + width:calc would over-constrain
          and get inverted by the RTL containing-block rules.
          Entrance animation (fade-in + subtle zoom) matches the Radix-powered
          FullScreenEditor used by Stock / Prep editors. */}
      <Dialog.Content {...focus} aria-describedby={undefined}
        className="fixed z-50 inset-0 md:top-[32px] md:bottom-[24px] md:left-[24px] md:right-[24px] pt-safe-t pb-safe-b flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--fg)] md:border md:border-[var(--line)] md:rounded-r-xl md:shadow-3 animate-in fade-in-0 zoom-in-[0.98] duration-200 ease-out"
      >
        {/* Head — 60px, close-left · centered title · save/cancel right.
            Cancel button hides on mobile (X already cancels). */}
        <div className="min-h-[64px] py-3 shrink-0 px-[var(--s-4)] md:px-[var(--s-5)] flex items-center gap-[var(--s-3)] md:gap-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
          <Button variant="ghost" size="md" icon onClick={onClose} aria-label={t('cancel')}>
            <X />
          </Button>
          <div className="flex-1 text-center min-w-0">
            <Dialog.Title className="text-fs-md font-semibold text-[var(--fg)] leading-snug">
              {title}
            </Dialog.Title>
          </div>
          <div className="flex items-center gap-[var(--s-2)] shrink-0">
            <Button variant="secondary" size="md" onClick={onClose} className="hidden md:inline-flex">
              {t('cancel')}
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                size="md"
                onClick={onSave}
                disabled={saving || saveDisabled}
              >
                <Save />
                {saving ? t('saving') : t('save')}
              </Button>
            )}
          </div>
        </div>

        {/* Body — on mobile the summary rail stacks above the main content
            (so image upload + summary stay reachable); on md+ it sits as a
            280px sidebar to the start of the main content. */}
        <div className="flex-1 flex flex-col md:grid overflow-y-auto md:overflow-hidden min-h-0 md:[grid-template-columns:280px_1fr]">
          <aside className="md:border-e border-[var(--line)] md:bg-[var(--surface)] p-[var(--s-4)] md:p-[var(--s-5)] md:overflow-y-auto md:max-w-[280px]">
            {sidebar}
          </aside>
          <main className="flex md:flex-1 flex-col md:overflow-hidden min-w-0">
            {children}
          </main>
        </div>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
