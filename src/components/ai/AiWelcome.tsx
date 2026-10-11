'use client';

import { useAi } from '@/lib/ai-context';
import { useI18n } from '@/lib/i18n';

const SUGGESTIONS = [
  { key: 'aiSuggestSales', icon: '📊' },
  { key: 'aiSuggestTopItems', icon: '🏆' },
  { key: 'aiSuggestStock', icon: '📦' },
  { key: 'aiSuggestCustomers', icon: '👥' },
];

export default function AiWelcome() {
  const { t } = useI18n();
  const { sendMessage } = useAi();

  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center px-4">
      <div className="w-12 h-12 rounded-r-lg bg-[var(--summary-bg)] flex items-center justify-center mb-4">
        <span className="text-[var(--summary-fg)] text-xl font-bold">AI</span>
      </div>
      <h3 className="text-lg font-semibold text-fg-primary mb-1">{t('aiWelcomeTitle')}</h3>
      <p className="text-sm text-fg-secondary mb-6 max-w-xs">{t('aiWelcomeDesc')}</p>

      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => sendMessage(t(s.key))}
            className="flex items-center gap-2 p-3 rounded-lg text-fs-sm text-fg-secondary text-start hover:bg-[var(--surface-subtle)] transition-colors border"
            style={{ borderColor: 'var(--divider)' }}
          >
            <span className="text-base">{s.icon}</span>
            <span>{t(s.key)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
