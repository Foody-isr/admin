'use client';

import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  isCombo?: boolean;
  dirty?: boolean;
  dirtySections?: string[];
  initialSection?: string;
}

/** A continuous, accessible item editor with one scroll area and optional section shortcuts. */
export default function MenuItemShell({
  title,
  onClose,
  onSave,
  saving = false,
  saveDisabled = false,
  sidebar,
  children,
  isCombo = false,
  dirty = false,
  dirtySections = [],
  initialSection = 'details',
}: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const focus = useDialogReturnFocus();
  const [scrollRoot, setScrollRoot] = useState<HTMLDivElement | null>(null);
  const [activeSection, setActiveSection] = useState('information');
  const sections = [
    { id: 'information', label: t('itemSectionInformation') },
    { id: 'pricing', label: t('itemSectionPricing') },
    ...(isCombo
      ? [{ id: 'composition', label: t('tabComposition') }]
      : [{ id: 'personalizations', label: t('itemSectionPersonalizations') }]),
    { id: 'customer-facts', label: t('itemSectionCustomerFacts') },
    { id: 'availability', label: t('tabStock') },
    ...(!isCombo ? [{ id: 'recipe', label: t('itemSectionRecipe') }] : []),
    { id: 'assistant', label: t('aiItemContext') },
  ];
  const jumpToSection = (id: string) => {
    const section = scrollRoot?.querySelector<HTMLElement>(
      `[data-item-section="${id}"]`,
    );
    section?.scrollIntoView({ block: 'start', behavior: 'auto' });
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };
  useEffect(() => {
    const root = scrollRoot;
    if (!root) return;
    const update = () => {
      const top = root.getBoundingClientRect().top + 80;
      const candidates = Array.from(
        root.querySelectorAll<HTMLElement>('[data-item-section]:not([hidden])'),
      );
      const current =
        candidates
          .filter((section) => section.getBoundingClientRect().top <= top)
          .at(-1) ?? candidates[0];
      if (current)
        setActiveSection(current.dataset.itemSection ?? 'information');
    };
    root.addEventListener('scroll', update, { passive: true });
    update();
    return () => root.removeEventListener('scroll', update);
  }, [isCombo, scrollRoot]);
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
    if (!root) return;
    const scroll = () => {
      const section = root.querySelector<HTMLElement>(
        `[data-item-section="${id}"]`,
      );
      if (!section) return false;
      section.scrollIntoView({ block: 'start' });
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />

        {/* Inset container — 32px top, 24px bottom, 24px each side on desktop;
          full-screen edge-to-edge on mobile. Symmetric left/right insets
          (no transform centering) keeps the modal correctly centered in
          RTL as well as LTR — left:50% + width:calc would over-constrain
          and get inverted by the RTL containing-block rules.
          Entrance animation (fade-in + subtle zoom) matches the Radix-powered
          FullScreenEditor used by Stock / Prep editors. */}
        <Dialog.Content
          {...focus}
          aria-describedby={undefined}
          className="fixed z-50 inset-0 md:top-[32px] md:bottom-[24px] md:left-[24px] md:right-[24px] pt-safe-t pb-safe-b flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--fg)] md:border md:border-[var(--line)] md:rounded-r-xl md:shadow-3 animate-in fade-in-0 zoom-in-[0.98] duration-200 ease-out"
        >
          {/* Head — 60px, close-left · centered title · save/cancel right.
            Cancel button hides on mobile (X already cancels). */}
          <div className="min-h-[64px] py-3 shrink-0 px-[var(--s-4)] md:px-[var(--s-5)] flex items-center gap-[var(--s-3)] md:gap-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
            <Button
              variant="ghost"
              size="md"
              icon
              onClick={onClose}
              aria-label={t('cancel')}
            >
              <X />
            </Button>
            <div className="flex-1 text-center min-w-0">
              <Dialog.Title className="text-fs-md font-semibold text-[var(--fg)] leading-snug">
                {title}
              </Dialog.Title>
              {dirty && (
                <p
                  role="status"
                  className="mt-0.5 text-xs text-[var(--fg-muted)]"
                >
                  {t('itemUnsavedChanges')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-[var(--s-2)] shrink-0">
              <Button
                variant="secondary"
                size="md"
                onClick={onClose}
                className="hidden md:inline-flex"
              >
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

          <div
            ref={setScrollRoot}
            data-item-editor-scroll
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <div className="mx-auto grid max-w-[1440px] items-start gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px]">
              <main className="min-w-0">{children}</main>
              <aside className="min-w-0 space-y-5 lg:self-stretch">
                {sidebar}
                <nav
                  aria-label={t('itemSectionNavigation')}
                  className="hidden lg:sticky lg:top-6 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-3 lg:block"
                >
                  <p className="px-3 py-2 text-xs font-medium text-[var(--fg-muted)]">
                    {t('itemSectionNavigation')}
                  </p>
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      aria-label={section.label}
                      onClick={() => jumpToSection(section.id)}
                      aria-current={
                        activeSection === section.id ? 'location' : undefined
                      }
                      className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-r-md px-3 text-start text-sm transition-colors ${activeSection === section.id ? 'bg-[var(--surface-2)] font-semibold text-[var(--fg)]' : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)]'}`}
                    >
                      {section.label}
                      {dirtySections.includes(section.id) && (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-[var(--brand-500)]"
                          aria-label={t('itemUnsavedChanges')}
                        />
                      )}
                    </button>
                  ))}
                </nav>
              </aside>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
