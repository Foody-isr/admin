'use client';

import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Cake,
  ClipboardList,
  Coffee,
  Gift,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ds';
import {
  getAllCategories,
  listAllItems,
  type LoyaltyEarningOptions,
} from '@/lib/api';
import { loyaltyMinor } from '@/lib/loyalty-program';
import { useI18n } from '@/lib/i18n';

type Product = NonNullable<LoyaltyEarningOptions['products']>[number];
const activities = [
  ['welcome', Gift, 'earnWelcome'],
  ['survey', ClipboardList, 'earnSurvey'],
  ['referral', UsersRound, 'earnReferral'],
  ['birthday', Cake, 'earnBirthday'],
] as const;

function Row({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3 border-b border-[var(--line)] py-5 sm:grid-cols-[minmax(12rem,1fr)_minmax(0,1.5fr)]">
      <h3 className="flex items-start gap-3 font-semibold">
        <Icon aria-hidden="true" size={19} className="mt-0.5 shrink-0" />
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Edit purchase rules and member activities without changing card artwork. */
export default function LoyaltyEarningEditor({
  restaurant,
  mode,
  currency,
  value,
  onChange,
}: {
  restaurant: number;
  mode: 'points' | 'visits';
  currency: string;
  value?: LoyaltyEarningOptions;
  onChange: (value: LoyaltyEarningOptions) => void;
}) {
  const { t, locale } = useI18n();
  const e = value ?? {};
  const patch = (part: Partial<LoyaltyEarningOptions>) =>
    onChange({ ...e, ...part });
  const [catalog, setCatalog] = useState<{
    items: { id: number; name: string }[];
    categories: { id: number; name: string }[];
  } | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setCatalog(null);
    setCatalogError(false);
    Promise.all([listAllItems(restaurant), getAllCategories(restaurant)])
      .then(([items, categories]) => {
        if (active)
          setCatalog({
            items: items.filter(
              (i) =>
                i.is_active &&
                !i.combo_only &&
                i.item_type !== 'combo' &&
                i.pricing_mode !== 'by_weight',
            ),
            categories,
          });
      })
      .catch(() => {
        if (active) setCatalogError(true);
      });
    return () => {
      active = false;
    };
  }, [restaurant, retry]);
  const products = e.products ?? [];
  const updateProduct = (index: number, change: Product) =>
    patch({ products: products.map((p, i) => (i === index ? change : p)) });
  const dateFormat = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const amount = (
    v: number | undefined,
    label: string,
    update: (n: number) => void,
  ) => (
    <Input
      type="number"
      min="1"
      max="1000000"
      step="1"
      aria-label={label}
      value={v || ''}
      onChange={(event) => update(Number(event.target.value))}
      className="max-w-32"
    />
  );
  return (
    <div className="max-w-4xl">
      {!e.products_only && (
        <Row icon={Gift} title={t('earnCombine')}>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!e.purchase_bonus}
              onChange={(ev) =>
                patch({
                  purchase_bonus: ev.target.checked
                    ? { units: 1, spend_minor: mode === 'visits' ? 100 : 0 }
                    : undefined,
                })
              }
            />
            {t(mode === 'visits' ? 'earnAddSpend' : 'earnAddVisit')}
          </label>
          {e.purchase_bonus && (
            <div className="flex flex-wrap items-end gap-3">
              {mode === 'visits' && (
                <Field label={t('loyaltyProgramSpend') + ' (' + currency + ')'}>
                  <Input
                    aria-label={
                      t('loyaltyProgramSpend') + ' (' + currency + ')'
                    }
                    inputMode="decimal"
                    defaultValue={e.purchase_bonus.spend_minor / 100}
                    onChange={(ev) => {
                      let minor = 0;
                      try {
                        minor = loyaltyMinor(ev.target.value);
                      } catch {
                        /* An incomplete amount keeps Save disabled. */
                      }
                      patch({
                        purchase_bonus: {
                          units: e.purchase_bonus!.units,
                          spend_minor: minor,
                        },
                      });
                    }}
                  />
                </Field>
              )}
              <Field label={t('earnUnits')}>
                {amount(e.purchase_bonus.units, t('earnUnits'), (n) =>
                  patch({ purchase_bonus: { ...e.purchase_bonus!, units: n } }),
                )}
              </Field>
            </div>
          )}
        </Row>
      )}
      <Row icon={Coffee} title={t('earnProducts')}>
        {catalogError && (
          <div role="alert">
            {t('loyaltyProgramCatalogError')}{' '}
            <Button variant="ghost" onClick={() => setRetry((r) => r + 1)}>
              {t('loyaltyCheckoutRefresh')}
            </Button>
          </div>
        )}
        {products.map((p, index) => {
          const category = p.category_id !== undefined;
          const id = p.category_id ?? p.item_id ?? 0;
          const entries =
            (category ? catalog?.categories : catalog?.items) ?? [];
          return (
            <div
              key={index}
              className="space-y-2 rounded-lg border border-[var(--line)] p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <Select
                  aria-label={t('earnCatalogType')}
                  value={category ? 'category' : 'item'}
                  onChange={(ev) =>
                    updateProduct(
                      index,
                      ev.target.value === 'item'
                        ? { item_id: 0, units: p.units }
                        : { category_id: 0, units: p.units },
                    )
                  }
                >
                  <option value="item">{t('loyaltyProgramProduct')}</option>
                  <option value="category">{t('earnCategory')}</option>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    patch({
                      products: products.filter((_, i) => i !== index),
                      products_only: products.length > 1 && e.products_only,
                    })
                  }
                >
                  {t('walletStudioRemove')}
                </Button>
              </div>
              <Select
                aria-label={
                  category ? t('earnCategory') : t('loyaltyProgramProduct')
                }
                value={id}
                onChange={(ev) =>
                  updateProduct(index, {
                    [category ? 'category_id' : 'item_id']: Number(
                      ev.target.value,
                    ),
                    units: p.units,
                  })
                }
              >
                <option value={0}>{t('loyaltyProgramChoose')}</option>
                {id > 0 && !entries.some((v) => v.id === id) && (
                  <option value={id}>#{id}</option>
                )}
                {entries.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
              <Field label={t('earnPerUnit')}>
                {amount(p.units, t('earnPerUnit'), (units) =>
                  updateProduct(index, { ...p, units }),
                )}
              </Field>
            </div>
          );
        })}
        {products.length < 32 && (
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              patch({ products: [...products, { item_id: 0, units: 1 }] })
            }
          >
            {t('earnAddProduct')}
          </Button>
        )}
        {!!products.length && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={!!e.products_only}
              onChange={(ev) =>
                patch({
                  products_only: ev.target.checked,
                  ...(ev.target.checked ? { purchase_bonus: undefined } : {}),
                })
              }
            />
            {t('earnProductsOnly')}
          </label>
        )}
      </Row>
      {!!products.length && (
        <p className="py-2 text-sm text-[var(--fg-muted)]">
          {t('earnPriority')}
        </p>
      )}
      <Row icon={CalendarDays} title={t('earnDouble')}>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 7 }, (_, n) => {
            const selected = Boolean((e.double_days ?? 0) & (1 << n));
            const date = new Date(Date.UTC(2026, 0, 4 + n));
            return (
              <button
                type="button"
                key={n}
                aria-pressed={selected}
                className={
                  'rounded-full border px-3 py-2 text-sm ' +
                  (selected
                    ? 'bg-[var(--fg)] text-[var(--bg)]'
                    : 'border-[var(--line)]')
                }
                onClick={() => {
                  const days = (e.double_days ?? 0) ^ (1 << n);
                  patch({
                    double_days: days,
                    ...(days
                      ? {}
                      : { double_from: undefined, double_until: undefined }),
                  });
                }}
              >
                {dateFormat.format(date)}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-[var(--fg-muted)]">{t('earnLocalTime')}</p>
        {!!e.double_days && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('earnDateFrom')}>
              <Input
                type="date"
                value={e.double_from ?? ''}
                max={e.double_until}
                onChange={(event) =>
                  patch({ double_from: event.target.value || undefined })
                }
              />
            </Field>
            <Field label={t('earnDateUntil')}>
              <Input
                type="date"
                value={e.double_until ?? ''}
                min={e.double_from}
                onChange={(event) =>
                  patch({ double_until: event.target.value || undefined })
                }
              />
            </Field>
          </div>
        )}
      </Row>
      <Row icon={Gift} title={t('firstVisitCoupon')}><label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={!!e.welcome_gift} onChange={ev => patch({ welcome_gift: ev.target.checked, ...(ev.target.checked && {welcome: undefined}) })}/>
        {t('firstVisitCouponHelp')}</label></Row>
      {activities.filter(([key]) => key !== 'welcome' || !e.welcome_gift).map(([key, Icon, label]) => {
        const active =
          e[key] !== undefined || (key === 'birthday' && e.birthday_gift);
        return (
          <Row key={key} icon={Icon} title={t(label)}>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={t('earnEnable').replace('{name}', t(label))}
                checked={!!active}
                onChange={(ev) =>
                  patch({
                    [key]: ev.target.checked ? 1 : undefined,
                    ...(key === 'birthday' ? { birthday_gift: undefined } : {}),
                  })
                }
              />
              {t(
                {
                  welcome: 'earnWelcomeHint',
                  survey: 'earnSurveyHint',
                  referral: 'earnReferralHint',
                  birthday: 'earnBirthdayHint',
                }[key],
              )}
            </label>
            {!!active && (
              <div className="flex flex-wrap items-end gap-3">
                {key === 'birthday' && (
                  <Field label={t('loyaltyProgramRewardType')}>
                    <Select
                      value={e.birthday_gift ? 'gift' : 'units'}
                      onChange={(ev) =>
                        patch({
                          birthday: ev.target.value === 'gift' ? undefined : 1,
                          birthday_gift:
                            ev.target.value === 'gift' || undefined,
                        })
                      }
                    >
                      <option value="units">{t('earnUnits')}</option>
                      <option value="gift">{t('earnDirectGift')}</option>
                    </Select>
                  </Field>
                )}
                {!(key === 'birthday' && e.birthday_gift) && (
                  <Field label={t('earnUnits')}>
                    {amount(e[key], t(label), (n) => patch({ [key]: n }))}
                  </Field>
                )}
              </div>
            )}
          </Row>
        );
      })}
    </div>
  );
}
