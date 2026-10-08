'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';
import { usePermissions } from '@/lib/permissions-context';
import './item-editor.css';
import ItemSectionOutline from './ItemSectionOutline';

interface Props {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  dirty?: boolean;
  initialSection?: string;
}

/** A continuous, accessible item editor with one scroll area and fixed actions. */
export default function MenuItemShell({
  title,
  onClose,
  onSave,
  saving = false,
  saveDisabled = false,
  sidebar,
  children,
  dirty = false,
  initialSection = 'details',
}: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const focus = useDialogReturnFocus();
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [sidebarCards, setSidebarCards] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!scrollRoot) return;
    const update = () => setScrolled(scrollRoot.scrollTop > 56);
    scrollRoot.addEventListener('scroll', update, { passive: true });
    update();
    return () => scrollRoot.removeEventListener('scroll', update);
  }, [scrollRoot]);
  useEffect(() => {
    const id =
      initialSection === 'details'
        ? 'information'
        : initialSection === 'cost'
          ? 'recipe'
          : initialSection === 'modifiers'
            ? 'personalizations'
            : initialSection;
    const root = scrollRoot;
    if (!root || id === 'information') return;
    const scroll = () => {
      const section = root.querySelector<HTMLElement>(
        `[data-item-section="${id}"]`,
      );
      if (!section) return false;
      root.scrollTo({
        top:
          root.scrollTop +
          section.getBoundingClientRect().top -
          root.getBoundingClientRect().top -
          24,
        behavior: 'auto',
      });
      return true;
    };
    // Availability and recipe data can expand earlier sections after mount.
    // Keep the requested section in view until the user starts interacting.
    const mutationObserver = new MutationObserver(() => {
      scroll();
    });
    const resizeObserver = new ResizeObserver(() => {
      scroll();
    });
    const stop = () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
        root.removeEventListener(event, stop);
    };
    mutationObserver.observe(root, { childList: true, subtree: true });
    if (root.firstElementChild) resizeObserver.observe(root.firstElementChild);
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown'])
      root.addEventListener(event, stop, { passive: true });
    scroll();
    return stop;
  }, [initialSection, scrollRoot]);

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--surface)]" />
        <Dialog.Content
          {...focus}
          aria-describedby={undefined}
          className="item-editor fixed inset-0 z-50 flex flex-col overflow-clip pt-safe-t pb-safe-b"
        >
          <header className="item-editor-header">
            <Button
              variant="secondary"
              icon
              onClick={onClose}
              aria-label={t('cancel')}
              className="item-editor-close"
            >
              <X />
            </Button>
            <div className="item-editor-header-title">
              <Dialog.Title className={scrolled ? '' : 'sr-only'}>
                {title}
              </Dialog.Title>
              {dirty && (
                <p role="status" className="item-editor-unsaved">
                  {t('itemUnsavedChanges')}
                </p>
              )}
            </div>
            <div className="item-editor-actions">
              <Button
                variant="secondary"
                onClick={onClose}
                className="hidden md:inline-flex"
              >
                {t('cancel')}
              </Button>
              {canEdit && (
                <Button
                  variant="primary"
                  onClick={onSave}
                  disabled={saving || saveDisabled}
                >
                  {saving ? t('saving') : t('save')}
                </Button>
              )}
            </div>
          </header>
          <div
            ref={setScrollRoot}
            data-item-editor-scroll
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="item-editor-layout">
              <h1 className="item-editor-title">{title}</h1>
              <main className="min-w-0">{children}</main>
              <aside className="item-editor-sidebar">
                <div ref={setSidebarCards}>{sidebar}</div>
                <ItemSectionOutline
                  scrollRoot={scrollRoot}
                  cards={sidebarCards}
                />
              </aside>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
