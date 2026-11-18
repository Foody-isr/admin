'use client';

import Link from 'next/link';
import { ArrowUpRight, ChevronRight, Gift, Link2, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ds';
import type { LoyaltyProgram, MenuItem } from '@/lib/api';
import { formatMoney } from '@/lib/currency';
import { useI18n } from '@/lib/i18n';
import { loyaltyCustomerPage } from '@/lib/loyalty-program';

const row = 'group flex min-w-0 items-center gap-3 rounded-r-md py-3 text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';
const linkIcon = 'size-5 shrink-0 text-[var(--fg-muted)]';

/** Displays the saved program and the routes a merchant uses to design and share its card. */
export default function LoyaltyProgramOverview({ rid, program, item, onTerms }: {
  rid: number;
  program: LoyaltyProgram | null;
  item?: MenuItem;
  onTerms: () => void;
}) {
  const { t, locale } = useI18n();
  const rules = program?.rules;
  const number = new Intl.NumberFormat(locale);
  const money = (minor: number) => formatMoney(minor / 100, rules?.currency, { decimals: minor % 100 ? 2 : 0 });
  const units = (count: number, mode: 'visits' | 'points') => {
    const labels = mode === 'visits' ? ['loyaltyProgramOneVisit', 'loyaltyProgramManyVisits'] : ['loyaltyProgramOnePoint', 'loyaltyProgramManyPoints'];
    return t(labels[count === 1 ? 0 : 1]).replace('{n}', number.format(count));
  };
  const name = program?.content[locale].name || t('loyaltyProgramTitle');
  const option = item?.option_sets?.flatMap(set => set.options ?? []).find(candidate => candidate.id === rules?.reward_variant_id);

  return <div className="space-y-8">
    {program && rules ?
      <section aria-label={t('loyaltyProgramOverview')} className="grid items-center gap-6 rounded-[1.25rem] bg-[var(--surface-2)] p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] lg:gap-10">
        <div className="min-w-0">
          <Badge dot tone={program.enabled ? 'success' : 'warning'}>{t(program.enabled ? 'loyaltyProgramActive' : 'loyaltyProgramPaused')}</Badge>
          <h2 dir="auto" className="my-3 break-words text-start text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{name}</h2>
          <p className="text-fs-md text-[var(--fg-muted)]">{rules.mode === 'visits' ? t('loyaltyProgramEarnVisit') :
            t('loyaltyProgramEarnSpend').replace('{points}', units(rules.units_per_step, 'points')).replace('{amount}', money(rules.spend_step_minor))}</p>
        </div>
        <div className="relative min-w-0 overflow-hidden rounded-r-lg bg-[var(--action)] text-[var(--action-fg)]">
          <div className="space-y-2 px-5 pb-4 pt-5">
            <div className="flex items-center gap-2 text-sm"><Gift aria-hidden="true" size={18} />{t(rules.reward_type === 'item' ? 'loyaltyProgramItem' : 'loyaltyProgramReward')}</div>
            <p dir="auto" className="break-words text-start text-2xl font-semibold leading-tight tracking-tight">
              {rules.reward_type === 'fixed' ? t('loyaltyProgramDiscountValue').replace('{amount}', money(rules.reward_amount_minor)) : item?.name || t('loyaltyProgramItem')}
            </p>
            {rules.reward_type === 'item' && option && <p dir="auto" className="text-sm">{option.name}</p>}
          </div>
          <div className="relative border-t border-dashed border-current/40 px-5 py-3 text-sm font-medium">
            <span aria-hidden="true" className="absolute -start-2 -top-2 size-4 rounded-full bg-[var(--surface-2)]" />
            <span aria-hidden="true" className="absolute -end-2 -top-2 size-4 rounded-full bg-[var(--surface-2)]" />
            {t('loyaltyProgramAfter').replace('{threshold}', units(rules.reward_threshold, rules.mode))}
          </div>
        </div>
      </section>
    : <section className="rounded-[1.25rem] bg-[var(--surface-2)] p-6 sm:p-8">
      <Gift aria-hidden="true" className="mb-3 size-6" />
      <h2 className="text-xl font-semibold">{t('loyaltyProgramNotConfigured')}</h2>
      <p className="mt-2 max-w-prose text-sm text-[var(--fg-muted)]">{t('loyaltyProgramStartHint')}</p>
    </section>}
    <div className="grid min-w-0 gap-8 lg:grid-cols-2 lg:gap-12">
      {rules && <section className="min-w-0">
        <h2 className="border-b border-[var(--line)] pb-3 text-lg font-semibold">{t('loyaltyProgramRules')}</h2>
        <dl className="divide-y divide-[var(--line)] text-sm">
          <div className="flex justify-between gap-3 py-3"><dt>{t('loyaltyProgramMinimum')}</dt><dd className="text-end font-medium">{rules.minimum_purchase_minor ? money(rules.minimum_purchase_minor) : t('loyaltyProgramNoMinimum')}</dd></div>
          <div className="flex justify-between gap-3 py-3"><dt>{t('loyaltyProgramRewardValidity')}</dt><dd className="text-end font-medium">{rules.reward_validity_days ? t(rules.reward_validity_days === 1 ? 'loyaltyProgramOneDay' : 'loyaltyProgramDays').replace('{n}', number.format(rules.reward_validity_days)) : t('loyaltyProgramNoExpiry')}</dd></div>
        </dl>
        <button type="button" onClick={onTerms} className={row + ' w-full justify-between border-t border-[var(--line)] text-sm font-medium hover:underline'}>{t('loyaltyProgramContent')}<ChevronRight aria-hidden="true" className="size-4 rtl:rotate-180" /></button>
      </section>}
      <section className="min-w-0">
        <h2 className="border-b border-[var(--line)] pb-3 text-lg font-semibold">{t('loyaltyProgramCard')}</h2>
        <Link href={`/${rid}/loyalty/program/wallet`} className={row} aria-label={t('walletStudioTitle')}>
          <WalletCards aria-hidden="true" className={linkIcon} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold group-hover:underline">{t('walletStudioTitle')}</span><span className="block text-sm text-[var(--fg-muted)]">{t('loyaltyProgramStudioHint')}</span></span>
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 rtl:rotate-180" />
        </Link>
        {program && <a href={loyaltyCustomerPage(rid)} target="_blank" rel="noopener noreferrer" className={row + ' border-t border-[var(--line)]'}>
          <Link2 aria-hidden="true" className={linkIcon} />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold group-hover:underline">{t('walletStudioOpenCustomerPage')}</span><span className="block text-sm text-[var(--fg-muted)]">{t(program.enabled ? 'loyaltyProgramEnrollmentOpen' : 'loyaltyProgramEnrollmentClosed')}</span></span>
          <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 rtl:-scale-x-100" />
        </a>}
      </section>
    </div>
  </div>;
}
