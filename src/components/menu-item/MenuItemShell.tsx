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
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Inset container — 32px top, 24px sides, 24px bottom per reference */}
      <div
        className="absolute top-[32px] inset-x-[24px] bottom-[24px] flex flex-col overflow-hidden bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-xl shadow-3"
      >
        {/* Head — 60px, close-left · centered title · save/cancel right */}
        <div className="h-[60px] shrink-0 px-[var(--s-5)] flex items-center gap-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
          <Button variant="ghost" size="md" icon onClick={onClose} aria-label={t('cancel')}>
            <X />
          </Button>
          <div className="flex-1 text-center min-w-0">
            <h2 className="text-fs-md font-semibold text-[var(--fg)] truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-[var(--s-2)] shrink-0">
            <Button variant="secondary" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onSave}
              disabled={saving || saveDisabled}
            >
              <Save />
              {saving ? t('saving') : t('save')}
            </Button>
          </div>
        </div>

        {/* Body — 280px rail + scrollable main */}
        <div
          className="flex-1 grid overflow-hidden min-h-0"
          style={{ gridTemplateColumns: '280px 1fr' }}
        >
          <aside className="border-r border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)] overflow-y-auto">
            {sidebar}
          </aside>
          <main className="flex flex-col overflow-hidden min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
