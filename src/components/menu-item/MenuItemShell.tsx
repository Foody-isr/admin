'use client';

import { Save, X } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

interface Props {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Item-editor shell — inset full-screen modal with 280px left rail.
 * Aligned to the Foody OS design-reference FullScreenEditor pattern
 * (see design-reference/design/drawer.jsx): 60px head, close-left,
 * centered title, save/cancel right. API preserved for existing callers.
 */
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

  // Esc to close — parity with Radix Dialog UX.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop — matches FullScreenEditor (Stock/Prep) entrance animation */}
      <div
        className="absolute inset-0 bg-black/50 animate-in fade-in-0 duration-200"
        onClick={onClose}
      />

      {/* Inset container — 32px top, 24px bottom, centered horizontally with
          48px total side gap on desktop; full-screen edge-to-edge on mobile.
          Using transform centering (not inset-x-24) keeps the modal visually
          symmetric regardless of page scrollbar gutter reservation.
          Entrance animation (fade-in + subtle zoom) matches the Radix-powered
          FullScreenEditor used by Stock / Prep editors. */}
      <div
        className="absolute inset-0 md:top-[32px] md:bottom-[24px] md:left-1/2 md:-translate-x-1/2 md:w-[calc(100%-48px)] flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--fg)] md:border md:border-[var(--line)] md:rounded-r-xl md:shadow-3 animate-in fade-in-0 zoom-in-[0.98] duration-200 ease-out"
      >
        {/* Head — 60px, close-left · centered title · save/cancel right.
            Cancel button hides on mobile (X already cancels). */}
        <div className="h-[60px] shrink-0 px-[var(--s-4)] md:px-[var(--s-5)] flex items-center gap-[var(--s-3)] md:gap-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
          <Button variant="ghost" size="md" icon onClick={onClose} aria-label={t('cancel')}>
            <X />
          </Button>
          <div className="flex-1 text-center min-w-0">
            <h2 className="text-fs-md font-semibold text-[var(--fg)] truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-[var(--s-2)] shrink-0">
            <Button variant="secondary" size="md" onClick={onClose} className="hidden md:inline-flex">
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onSave}
              disabled={saving || saveDisabled}
            >
              <Save />
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </div>

        {/* Body — single column on mobile (rail hidden), 280px rail + main on md+ */}
        <div className="flex-1 flex md:grid overflow-hidden min-h-0 md:[grid-template-columns:280px_1fr]">
          <aside className="hidden md:block border-e border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)] overflow-y-auto">
            {sidebar}
          </aside>
          <main className="flex-1 flex flex-col overflow-hidden min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
