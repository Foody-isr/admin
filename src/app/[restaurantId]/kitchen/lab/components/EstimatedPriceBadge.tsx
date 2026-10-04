import { useI18n } from '@/lib/i18n';
import type { Component } from '../types';

/** Identify estimated ingredient prices without relying on a color alone. */
export function EstimatedPriceBadge({confidence}:{confidence?:Component['price_confidence']}) {
  const {t}=useI18n();
  return <span title={t('labCostEstimated')} aria-label={t('labCostEstimated')} className="inline-flex rounded-[4px] bg-[var(--warning-50)] px-1.5 py-1 text-xs font-semibold text-[var(--fg)]">≈{confidence==='low'?' !':''}</span>;
}
