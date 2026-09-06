'use client';

import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

// Centered modal shell used by the stock / prep / suppliers editors. Same
// visual pattern as MenuItemShell and CenteredModalShell — backdrop blur +
// rounded-2xl card, sticky header with lucide X, orange-gradient Save,
// optional sidebar column, Esc closes, backdrop click closes.

export type FormModalProps = {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
  showCancelButton?: boolean;
  sidebar?: React.ReactNode;
  sidebarPosition?: 'left' | 'right';
  stickySidebar?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
};

export default function FormModal({
  title,
  onClose,
  onSave,
  saveLabel,
  cancelLabel,
  saveDisabled = false,
  saving = false,
  showCancelButton = true,
  sidebar,
  sidebarPosition = 'right',
  stickySidebar = false,
  maxWidthClass = 'max-w-6xl',
  children,
}: FormModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sidebarNode = sidebar && (
    <div
      className={`hidden lg:block w-72 shrink-0 space-y-4 ${
        stickySidebar ? 'sticky top-0 self-start max-h-[calc(100dvh-12rem)] overflow-y-auto' : ''
      }`}
    >
      {sidebar}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* The wrapper carries the safe-area insets so the card can simply be
          max-h-full — on a notched phone it never slides under the status bar. */}
      <div className="absolute inset-0 flex items-center justify-center px-3 sm:px-4 pt-[max(var(--s-3),var(--safe-top))] pb-[max(var(--s-3),var(--safe-bottom))]">
        <div
          className={`relative bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-2xl w-full ${maxWidthClass} max-h-full overflow-hidden flex flex-col`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-8 sm:py-6 border-b border-neutral-200 dark:border-neutral-800 shrink-0">
            <button
              onClick={onClose}
              aria-label={cancelLabel ?? t('cancel')}
              className="size-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors shrink-0"
            >
              <X size={20} className="text-neutral-600 dark:text-neutral-400" />
            </button>
            <h2 className="min-w-0 flex-1 text-base sm:text-xl font-bold text-neutral-900 dark:text-white truncate">
              {title}
            </h2>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* The X already cancels on mobile — the text button only earns its
                  width from sm: up. */}
              {showCancelButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden sm:block px-6 py-2.5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors font-medium"
                >
                  {cancelLabel ?? t('cancel')}
                </button>
              )}
              <button
                type="button"
                onClick={onSave}
                disabled={saveDisabled || saving}
                className="px-4 py-2 sm:px-6 sm:py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? t('saving') : (saveLabel ?? t('save'))}
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-4 sm:px-8 sm:py-6 flex gap-8">
              {sidebarPosition === 'left' && sidebarNode}
              <div className="flex-1 min-w-0 space-y-5">{children}</div>
              {sidebarPosition === 'right' && sidebarNode}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
