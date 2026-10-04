'use client';

import type { ReactNode } from 'react';
import { useCurrency, useI18n } from '@/lib/i18n';
import { COST_THRESHOLD } from '@/lib/cost-utils';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';

interface Props {
  itemName?: string;
  /** Raw stored selling price, including VAT. */
  displayPrice: number;
  /** Ingredient cost on the selected VAT basis. */
  displayCost: number;
  costPct: number;
  showCostsExVat: boolean;
  vatRate: number;
  onClose: () => void;
}

/** Explain the existing food-cost ratio using the selected VAT basis. */
export default function CostPctBreakdownModal({ itemName, displayPrice, displayCost, costPct, showCostsExVat, vatRate, onClose }: Props) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const vatMultiplier = 1 + vatRate / 100;
  const normalizedPrice = showCostsExVat ? displayPrice / vatMultiplier : displayPrice;
  return (
    <Modal title={t('costPctBreakdownTitle')} subtitle={itemName} size="lg" onClose={onClose}
      footer={<div className="flex justify-end"><Button size="lg" variant="secondary" onClick={onClose}>{t('close')}</Button></div>}>
      <div className="space-y-5 text-sm">
        <p className="text-fg-secondary leading-relaxed">{t(showCostsExVat ? 'costPctBreakdownIntroEx' : 'costPctBreakdownIntroInc')}</p>
        <section className="space-y-2">
          <h3 className="font-semibold">{t('costPctStep1')}</h3>
          <dl className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-3">
            <Value label={t('pnlPriceInc')} strong={!showCostsExVat}>{money(displayPrice)}</Value>
            <Value label={t('pnlVat').replace('{rate}', String(vatRate))}>{money(displayPrice - displayPrice / vatMultiplier)}</Value>
            <Value label={t('pnlPriceEx')} strong={showCostsExVat}>{money(displayPrice / vatMultiplier)}</Value>
          </dl>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">{t(showCostsExVat ? 'costPctStep2Ex' : 'costPctStep2Inc')}</h3>
          <dl className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3"><Value label={t('foodCostLabel')} strong>{money(displayCost)}</Value></dl>
          <p className="text-xs text-fg-secondary">{t('costPctStep2Hint')}</p>
        </section>
        <section className="space-y-2">
          <h3 className="font-semibold">{t('costPctStep3')}</h3>
          <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 space-y-2">
            <bdi dir="ltr" className="block tabular-nums">{money(displayCost)} ÷ {money(normalizedPrice)}</bdi>
            <bdi dir="ltr" className="block text-xl font-semibold tabular-nums">{normalizedPrice > 0 ? `= ${(costPct * 100).toFixed(1)}%` : '—'}</bdi>
            {costPct > COST_THRESHOLD && <p className="text-sm text-[var(--warning-500)]">{t('foodCostExceedsThreshold').replace('{threshold}', (COST_THRESHOLD * 100).toFixed(0))}</p>}
          </div>
        </section>
        <p className="text-xs text-fg-secondary leading-relaxed">{t('costThresholdExplanation').replace('{threshold}', String(COST_THRESHOLD * 100))}</p>
      </div>
    </Modal>
  );
}

function Value({label, children, strong = false}: {label: string; children: ReactNode; strong?: boolean}) {
  return <div className={`flex flex-wrap justify-between gap-x-5 gap-y-1 ${strong ? 'font-semibold' : 'text-fg-secondary'}`}><dt>{label}</dt><dd className="tabular-nums"><bdi>{children}</bdi></dd></div>;
}
