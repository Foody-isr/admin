'use client';

import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { FEATURE_HELP } from '@/lib/help/registry';
import { LearnMore } from './LearnMore';

/**
 * Square-style feature explainer shown at the top of a feature page: what it is,
 * how to use it, and a "Learn more" link to the full Help article. New users see
 * it expanded; a × collapses it to a small "ⓘ" chip (persisted per feature in
 * localStorage), and clicking the chip re-expands it — so it stays discoverable
 * without ever being a dead end.
 */
export function FeatureIntro({ feature }: { feature: string }) {
  const { t } = useI18n();
  const f = FEATURE_HELP[feature];
  const storageKey = `foody.help.intro.${feature}`;

  // Default collapsed=false, but start "unhydrated" so we don't flash the full
  // banner before reading the stored preference on the client.
  const [collapsed, setCollapsed] = useState<boolean | null>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem(storageKey) === 'collapsed');
  }, [storageKey]);

  if (!f || collapsed === null) return null;

  function setState(next: boolean) {
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, next ? 'collapsed' : 'expanded');
    } catch {
      /* ignore storage failures (private mode) */
    }
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setState(false)}
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-fs-xs text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
      >
        <Info className="size-3.5 text-[var(--brand-500)]" />
        {t(f.titleKey)}
      </button>
    );
  }

  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
    >
      <Info className="size-4 mt-0.5 shrink-0 text-[var(--brand-500)]" />
      <div className="min-w-0 flex-1">
        <div className="text-fs-sm font-semibold text-[var(--fg)]">{t(f.titleKey)}</div>
        <p className="mt-0.5 text-fs-sm text-[var(--fg-muted)]">{t(f.blurbKey)}</p>
        <div className="mt-1.5">
          <LearnMore feature={feature} />
        </div>
      </div>
      <button
        type="button"
        onClick={() => setState(true)}
        aria-label={t('helpDismiss')}
        className="text-[var(--fg-muted)] hover:text-[var(--fg)]"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
