'use client';

import { useCurrency, useI18n } from '@/lib/i18n';
import type { CostLineDetail } from '@/lib/cost-utils';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';

interface Props {
  itemName?: string;
  /** VAT-normalized total, matching the sum of lines. */
  foodCost: number;
  lines: CostLineDetail[];
  showCostsExVat: boolean;
  onClose: () => void;
}

/** Explain each ingredient's contribution on the comparison's selected VAT basis. */
export default function FoodCostBreakdownModal({itemName, foodCost, lines, showCostsExVat, onClose}: Props) {
  const { t, locale } = useI18n();
  const { money } = useCurrency();
  const number = new Intl.NumberFormat(locale, {maximumFractionDigits:3});
  const percent = new Intl.NumberFormat(locale, {style:'percent', maximumFractionDigits:0});
  return <Modal title={t('foodCostBreakdownTitle')} subtitle={itemName} size="3xl" onClose={onClose}
    footer={<div className="flex justify-end"><Button size="lg" variant="secondary" onClick={onClose}>{t('close')}</Button></div>}>
    <div className="space-y-4 text-sm">
      <p className="text-fg-secondary leading-relaxed">{t(showCostsExVat ? 'foodCostBreakdownIntroEx' : 'foodCostBreakdownIntroInc')}</p>
      {!lines.length ? <p className="rounded-r-md bg-[var(--surface-2)] p-4 text-fg-secondary">{t('noIngredientsLinked')}</p> :
        <div role="region" tabIndex={0} aria-label={t('foodCostBreakdownTitle')} className="overflow-x-auto rounded-r-md border border-[var(--line)]">
          <table className="w-full min-w-[600px] text-sm">
            <caption className="sr-only">{t('foodCostBreakdownTitle')} — {itemName}</caption>
            <thead className="bg-[var(--surface-2)] text-xs text-fg-secondary"><tr>
              <th scope="col" className="p-3 text-start font-medium">{t('ingredient')}</th><th scope="col" className="p-3 text-end font-medium">{t('lineCost')}</th><th scope="col" className="p-3 text-start font-medium">{t('type')}</th>
              <th scope="col" className="p-3 text-end font-medium">{t('qtyPerServing')}</th><th scope="col" className="p-3 text-end font-medium">{t('unitCost')}</th>
            </tr></thead>
            <tbody>{lines.map((line,index) => <tr key={`${line.ingredient.id}:${index}`} className="border-t border-[var(--line)]">
              <th scope="row" className="p-3 text-start font-medium"><bdi>{line.name}</bdi>{foodCost > 0 && line.lineCost > 0 && <bdi className="block mt-1 text-xs font-normal text-fg-secondary">{percent.format(line.lineCost / foodCost)}</bdi>}</th>
              <td className="p-3 text-end tabular-nums font-semibold whitespace-nowrap"><bdi>{money(line.lineCost)}</bdi></td>
              <td className="p-3"><span className="inline-flex rounded-r-md px-2 py-1 text-xs bg-[var(--info-50)] text-[var(--info-500)]">{t(line.isPrep ? 'prep' : 'raw')}</span></td>
              <td className="p-3 text-end tabular-nums whitespace-nowrap"><bdi dir="ltr">{number.format(line.qty)} {line.qtyUnit}</bdi></td>
              <td className="p-3 text-end tabular-nums whitespace-nowrap text-fg-secondary"><bdi dir="ltr">{money(line.unitCost,{decimals:4})}/{line.sourceUnit}</bdi></td>
            </tr>)}</tbody>

          </table>
        </div>}
      {lines.length > 0 && <dl className="flex flex-wrap items-center justify-between gap-3 rounded-r-md bg-[var(--surface-2)] p-3 font-semibold"><dt>{t('totalFoodCost')}</dt><dd className="tabular-nums"><bdi>{money(foodCost)}</bdi></dd></dl>}
      <p className="text-xs text-fg-secondary">{t('foodCostBreakdownNote')}</p>
    </div>
  </Modal>;
}
