'use client';

import { useAi } from '@/lib/ai-context';
import { useI18n } from '@/lib/i18n';
import AiChat from './AiChat';
import { XIcon, TrashIcon } from 'lucide-react';

export default function AiDrawer() {
  const { isOpen, closeDrawer, clearChat, messages } = useAi();
  const { t, direction } = useI18n();
  const isRtl = direction === 'rtl';

  return (
    <>
      {/* Backdrop (mobile) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 lg:hidden"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 bottom-0 z-50 w-[400px] max-w-full flex flex-col transition-transform duration-300 ease-in-out ${
          isRtl ? 'left-0' : 'right-0'
        } ${
          isOpen
            ? 'translate-x-0'
            : isRtl
            ? '-translate-x-full'
            : 'translate-x-full'
        }`}
        style={{ background: 'var(--surface)', borderLeft: isRtl ? 'none' : '1px solid var(--divider)', borderRight: isRtl ? '1px solid var(--divider)' : 'none' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-14 border-b" style={{ borderColor: 'var(--divider)' }}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-brand-500 flex items-center justify-center">
              <span className="text-white text-xs font-bold">AI</span>
            </div>
            <h2 className="text-sm font-semibold text-fg-primary">{t('aiAssistant')}</h2>
            <span className="text-[10px] font-bold text-white bg-orange-500 px-1.5 py-0.5 rounded-full uppercase">
              Beta
            </span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="p-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors text-fg-secondary"
                title={t('aiClearChat')}
              >
                <TrashIcon className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={closeDrawer}
              className="p-1.5 rounded-md hover:bg-[var(--surface-subtle)] transition-colors text-fg-secondary"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Chat area */}
        <AiChat />
      </div>
    </>
  );
}
