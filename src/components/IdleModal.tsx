'use client';

import { useI18n } from '@/lib/i18n';

interface IdleModalProps {
  countdown: number;
  onDismiss: () => void;
}

export default function IdleModal({ countdown, onDismiss }: IdleModalProps) {
  const { t } = useI18n();

  return (
    <div
      data-idle-modal
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div className="card p-8 max-w-sm w-full mx-4 text-center space-y-5">
        <div className="text-4xl">👋</div>
        <h2 className="text-lg font-bold text-fg-primary">{t('idleTitle')}</h2>
        <p className="text-sm text-fg-secondary">
          {t('idleDescription').replace('{countdown}', String(countdown))}
        </p>
        <div className="w-full bg-[var(--surface-subtle)] rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${(countdown / 60) * 100}%` }}
          />
        </div>
        <button
          onClick={onDismiss}
          className="btn-primary w-full py-3 text-sm"
        >
          {t('idleDismiss')}
        </button>
      </div>
    </div>
  );
}
