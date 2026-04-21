'use client';

import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface Props {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  saveDisabled?: boolean;
  sidebar: React.ReactNode;
  children: React.ReactNode;
}

// Fullscreen page shell for the menu-item edit/create flow. Supports both
// light and dark themes via CSS tokens (no hardcoded palette).
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
  return (
    <div className="fixed inset-0 z-50 bg-[var(--bg)] text-[var(--text-primary)] flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--divider)] px-8 py-4 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('cancel')}
          className="size-10 rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--divider)] transition-colors flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <X className="w-5 h-5" />
        </button>

        <h1 className="text-base font-bold text-[var(--text-primary)]">{title}</h1>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] rounded-lg transition-colors font-medium"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saveDisabled}
            className="h-9 px-6 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white text-sm font-medium shadow-lg shadow-brand-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex gap-8 p-8 items-start">
          <aside className="shrink-0 sticky top-0 self-start">{sidebar}</aside>
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
