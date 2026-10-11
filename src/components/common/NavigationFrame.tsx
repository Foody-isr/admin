'use client';

import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

import { useSyncExternalStore, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useI18n } from '@/lib/i18n';

const query = '(min-width: 1024px)';
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

/** Tracks the same desktop breakpoint used by the application shell. */
export function useDesktopNavigation() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/** Desktop landmark or mobile modal navigation, with one shared content tree. */
export function NavigationFrame({ open, onClose, className, children }: {
  open: boolean; onClose: () => void; className: string; children: ReactNode;
}) {
  const desktop = useDesktopNavigation();
  const focus = useDialogReturnFocus();
  const { t } = useI18n();
  if (desktop) return <aside className={className}>{children}</aside>;
  return <Dialog.Root open={open} onOpenChange={value => { if (!value) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-30 bg-[var(--overlay)]" />
      <Dialog.Content {...focus} asChild aria-describedby={undefined}>
        <aside className={className}>
          <Dialog.Title className="sr-only">{t('menu')}</Dialog.Title>
          {children}
        </aside>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
