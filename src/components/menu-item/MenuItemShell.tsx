'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
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

// Fullscreen page shell for the menu-item edit/create flow. Pixel-aligned to
// Figma (file bpnbCfGmcUAW25nYHli2Lf, node 0:3). Dark palette is hardcoded
// because the design is dark-only — using the app's light/dark theme tokens
// here would drift from the mockup.
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
    <div className="fixed inset-0 z-50 bg-[#09090b] text-[#fafafa] flex flex-col">
      {/* Header (Figma 0:4) */}
      <header className="border-b border-[rgba(255,255,255,0.1)] px-8 pt-4 pb-[17px] flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('cancel')}
          className="w-10 h-10 rounded-full bg-[#27272a] hover:bg-[#3f3f46] transition-colors flex items-center justify-center"
        >
          <XMarkIcon className="w-5 h-5 text-[#fafafa]" />
        </button>

        <h1 className="text-[16px] leading-[24px] text-[#fafafa]">{title}</h1>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-[14px] leading-[20px] text-[#9f9fa9] hover:text-[#fafafa] rounded-[6px] transition-colors"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || saveDisabled}
            className="h-9 px-6 rounded-[8px] bg-[#f54900] hover:bg-[#e04300] text-[#fff7ed] text-[14px] leading-[20px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
