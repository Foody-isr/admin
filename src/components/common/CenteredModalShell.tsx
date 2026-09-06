'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

// Centered modal shell for route-driven editors that don't need the
// MenuItem summary sidebar (e.g. option sets, modifier sets). Same header
// pattern as MenuItemShell — Esc closes, backdrop click closes, orange
// gradient Save on the right.

interface Props {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  /** Tailwind width class; default `max-w-3xl`. */
  maxWidth?: string;
  children: React.ReactNode;
}

export default function CenteredModalShell({
  title,
  onClose,
  onSave,
  saving = false,
  saveDisabled = false,
  saveLabel,
  maxWidth = 'max-w-3xl',
  children,
}: Props) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* The wrapper carries the safe-area insets so the card can simply be
          max-h-full — on a notched phone it never slides under the status bar. */}
      <div className="absolute inset-0 flex items-center justify-center px-3 sm:px-4 pt-[max(var(--s-3),var(--safe-top))] pb-[max(var(--s-3),var(--safe-bottom))]">
        <div
          className={`relative bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl w-full ${maxWidth} max-h-full overflow-hidden flex flex-col`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-8 sm:py-6 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <button
              onClick={onClose}
              aria-label={t('cancel')}
              className="size-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
            >
              <X size={20} className="text-neutral-600 dark:text-neutral-400" />
            </button>
            <h2 className="min-w-0 flex-1 text-base sm:text-xl font-bold text-neutral-900 dark:text-white truncate">
              {title}
            </h2>
            {onSave ? (
              <div className="flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors font-medium"
                >
                  {t('cancel')}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving || saveDisabled}
                  className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? t('saving') : (saveLabel || t('save'))}
                </button>
              </div>
            ) : (
              <div className="size-10 shrink-0" aria-hidden />
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
