'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';

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
  maxWidthClass = 'max-w-4xl',
  children,
}: FormModalProps) {
  const { t } = useI18n();
  const sidebarNode = sidebar && (
    <div
      className={`hidden lg:block w-72 shrink-0 space-y-4 ${
        stickySidebar ? 'sticky top-0 self-start max-h-[calc(100vh-6rem)] overflow-y-auto' : ''
      }`}
    >
      {sidebar}
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)] flex flex-col">
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <button
          onClick={onClose}
          aria-label={cancelLabel ?? t('cancel')}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-fg-primary">{title}</span>
        <div className="flex items-center gap-2">
          {showCancelButton && (
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              {cancelLabel ?? t('cancel')}
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saveDisabled || saving}
            className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50"
          >
            {saving ? t('saving') : saveLabel ?? t('save')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className={`${maxWidthClass} mx-auto px-6 py-8 flex gap-8`}>
          {sidebarPosition === 'left' && sidebarNode}
          <div className="flex-1 min-w-0 space-y-5">{children}</div>
          {sidebarPosition === 'right' && sidebarNode}
        </div>
      </div>
    </div>
  );
}
