'use client';

import { useI18n } from '@/lib/i18n';
import type { OrderLifecycleV2 } from '@/lib/orders/lifecycle-v2';
import { lifecycleV2MoneyRows, lifecycleV2StateLabel } from '@/lib/orders/lifecycle-v2-presentation';

/** Recorded financial and physical facts, without actionable payment or food inference. */
export function LifecycleFacts({ value, showMoney = true, showProgress = true, className = '' }: {
  value: OrderLifecycleV2; showMoney?: boolean; showProgress?: boolean; className?: string;
}) {
  const { t, locale } = useI18n();
  const preparation = value.preparation.quantities;
  const handoff = value.handoff.quantities;
  const handed = handoff.served + handoff.picked_up + handoff.delivered;
  const count = (key: string, amount: number, total = 0) => t(key).split(/(\{count\} \/ \{total\}|\{count\}|\{total\})/).map((part, index) => part === '{count} / {total}' ? <bdi dir="ltr" key={index}>{amount} / {total}</bdi> : part === '{count}' ? <bdi dir="ltr" key={index}>{amount}</bdi> : part === '{total}' ? <bdi dir="ltr" key={index}>{total}</bdi> : part);
  return <div data-lifecycle-v2-facts className={`space-y-4 text-sm ${className}`}>
    {showProgress && <dl className="space-y-3" data-lifecycle-progress>
      <div className="flex justify-between gap-4"><dt>{t('lifecycleV2Commercial')}</dt><dd className="text-end">{lifecycleV2StateLabel('commercial', value.commercial.state, t)}</dd></div>
      <div className="flex justify-between gap-4"><dt>{t('lifecycleV2Preparation')}</dt><dd className="text-end">
        <span>{lifecycleV2StateLabel('preparation', value.preparation.state, t)}</span>
        {value.preparation.state !== 'not_tracked' && <span className="block text-xs"><bdi>{count('lifecycleV2ReadyUnits', preparation.ready, preparation.total)}</bdi></span>}
        {preparation.unknown > 0 && <span className="block text-xs"><bdi>{count('lifecycleV2UnknownUnits', preparation.unknown)}</bdi></span>}
      </dd></div>
      <div className="flex justify-between gap-4"><dt>{t('lifecycleV2Handoff')}</dt><dd className="text-end">
        <span>{lifecycleV2StateLabel('handoff', value.handoff.state, t)}</span>
        {value.handoff.state !== 'not_tracked' && <span className="block text-xs"><bdi>{count('lifecycleV2HandedUnits', handed, handoff.total)}</bdi></span>}
        {handoff.with_courier > 0 && <span className="block text-xs"><bdi>{count('lifecycleV2CourierUnits', handoff.with_courier)}</bdi></span>}
        {handoff.unknown > 0 && <span className="block text-xs"><bdi>{count('lifecycleV2UnknownUnits', handoff.unknown)}</bdi></span>}
      </dd></div>
    </dl>}
    {showMoney && <dl className="space-y-2" data-lifecycle-money>
      {lifecycleV2MoneyRows(value, locale, t).map(row => <div className="flex justify-between gap-4" key={row.key}>
        <dt>{row.label}</dt><dd className="text-end tabular-nums" data-money-field={row.key}><bdi>{row.value}</bdi></dd>
      </div>)}
    </dl>}
  </div>;
}
