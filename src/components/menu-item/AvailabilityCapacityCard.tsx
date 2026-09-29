'use client';

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, PackageCheck, XCircle } from 'lucide-react';
import type { AvailabilityPreview, AvailabilityState } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

interface Props {
  preview: AvailabilityPreview | null;
  failed?: boolean;
}

/** Shows the number of complete sales supported by the current stock, with an
 *  inline recipe breakdown that explains the limiting ingredient. */
export function AvailabilityCapacityCard({ preview, failed = false }: Props) {
  const { t, locale } = useI18n();
  const quantityFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  );
  const state: AvailabilityState | 'loading' = preview == null ? 'loading' : preview.state;
  const StatusIcon =
    state === 'available' ? CheckCircle2 : state === 'low' ? AlertTriangle : state === 'sold_out' ? XCircle : Info;
  const statusTone: Record<AvailabilityState | 'loading', { fg: string; bgMix: string }> = {
    available: { fg: 'var(--success-500)', bgMix: 'color-mix(in oklab, var(--success-500) 14%, transparent)' },
    low: { fg: 'var(--warning-500)', bgMix: 'color-mix(in oklab, var(--warning-500) 14%, transparent)' },
    sold_out: { fg: 'var(--danger-500)', bgMix: 'color-mix(in oklab, var(--danger-500) 14%, transparent)' },
    hidden: { fg: 'var(--fg-muted)', bgMix: 'color-mix(in oklab, var(--fg-muted) 14%, transparent)' },
    loading: { fg: 'var(--fg-muted)', bgMix: 'color-mix(in oklab, var(--fg-muted) 14%, transparent)' },
  };
  const tone = statusTone[state];
  const displayUnit = (unit: string) => (unit === 'unit' ? t('unit').toLocaleLowerCase(locale) : unit);
  const limitingNames =
    preview?.ingredients?.filter((ingredient) => ingredient.limiting).map((ingredient) => ingredient.name) ?? [];
  if (limitingNames.length === 0 && preview?.bottleneck) limitingNames.push(preview.bottleneck);
  const statusLabel = failed
    ? t('availabilityPreviewUnavailableShort')
    : state === 'loading'
      ? t('availabilityComputing')
      : t(
          state === 'low'
            ? 'availabilityStateLow'
            : state === 'sold_out'
              ? 'availabilityStateSoldOut'
              : state === 'hidden'
                ? 'availabilityStateHidden'
                : 'availabilityStateAvailable',
        );

  return (
    <section className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="p-[var(--s-5)]">
        <div className="flex items-start justify-between gap-[var(--s-4)]">
          <div className="flex min-w-0 items-start gap-[var(--s-3)]">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-r-md"
              style={{
                background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                color: 'var(--brand-500)',
              }}
            >
              <PackageCheck className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="text-fs-md font-semibold text-[var(--fg)]">
                {t('availabilityCapacityTitle')}
              </div>
              <div className="mt-0.5 text-fs-xs leading-[var(--lh-base)] text-[var(--fg-subtle)]">
                {t('availabilityCapacitySubtitle')}
              </div>
            </div>
          </div>
          <div
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-[var(--s-3)] py-1 text-fs-xs font-semibold"
            style={{ background: tone.bgMix, color: tone.fg }}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {statusLabel}
          </div>
        </div>

        <div className="mt-[var(--s-5)] ps-[calc(2.5rem+var(--s-3))]">
          {preview == null ? (
            <div className="text-fs-sm text-[var(--fg-muted)]" role="status">
              {failed ? t('availabilityPreviewUnavailable') : t('availabilityComputing')}
            </div>
          ) : preview.unlimited ? (
            <div className="text-fs-sm leading-[var(--lh-base)] text-[var(--fg-muted)]">
              {t('availabilityNoRecipeHint')}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-[var(--s-2)] gap-y-1">
                <span className="font-mono text-[2rem] font-semibold leading-none tabular-nums text-[var(--fg)]">
                  {quantityFormatter.format(preview.buildable)}
                </span>
                <span className="text-fs-md font-semibold text-[var(--fg)]">
                  {t('availabilitySalesPossible')}
                </span>
              </div>
              <p className="mt-[var(--s-2)] text-fs-xs leading-[var(--lh-base)] text-[var(--fg-subtle)]">
                {preview.basis === 'predefined_stock'
                  ? t('availabilityCapacityPredefinedBasis')
                  : t('availabilityCapacityRecipeBasis')}
              </p>
              {limitingNames.length > 0 && (
                <div className="mt-[var(--s-3)] inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--surface-2,var(--surface))] px-[var(--s-3)] py-1 text-fs-xs text-[var(--fg-muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning-500)]" />
                  {t('availabilityLimitedBy')}{' '}
                  <span className="font-semibold text-[var(--fg)]">{limitingNames.join(' · ')}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {preview?.ingredients && preview.ingredients.length > 0 && (
        <details className="group border-t border-[var(--line)]">
          <summary className="flex cursor-pointer list-none items-center justify-between px-[var(--s-5)] py-[var(--s-3)] text-fs-xs font-semibold text-[var(--brand-500)] hover:bg-[var(--surface-2,var(--surface))] [&::-webkit-details-marker]:hidden">
            {t('availabilityViewCalculation')}
            <ChevronDown className="h-4 w-4 transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <div className="border-t border-[var(--line)] bg-[var(--surface-2,var(--surface))] px-[var(--s-5)] py-[var(--s-3)]">
            <div className="flex flex-col divide-y divide-[var(--line)]">
              {preview.ingredients.map((ingredient, index) => (
                <div
                  key={`${ingredient.kind}-${ingredient.name}-${index}`}
                  className="grid grid-cols-1 gap-[var(--s-2)] py-[var(--s-3)] first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-center md:gap-[var(--s-4)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-[var(--s-2)]">
                      <span className="truncate text-fs-sm font-semibold text-[var(--fg)]">{ingredient.name}</span>
                      {ingredient.limiting && (
                        <span
                          className="rounded-full px-2 py-0.5 text-fs-micro font-semibold"
                          style={{
                            background: 'color-mix(in oklab, var(--warning-500) 14%, transparent)',
                            color: 'var(--warning-600, var(--warning-500))',
                          }}
                        >
                          {t('availabilityLimiting')}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-fs-xs text-[var(--fg-subtle)]">
                      {quantityFormatter.format(ingredient.required_per_sale)} {displayUnit(ingredient.required_unit)}{' '}
                      {t('availabilityPerSale')}
                    </div>
                  </div>
                  <div className="text-fs-xs text-[var(--fg-muted)]">
                    <span className="font-mono tabular-nums text-[var(--fg)]">
                      {quantityFormatter.format(ingredient.available)} {displayUnit(ingredient.available_unit)}
                    </span>{' '}
                    {t('availabilityInStock')}
                  </div>
                  <div className="text-fs-xs text-[var(--fg-muted)] md:text-end">
                    <span className="font-mono text-fs-sm font-semibold tabular-nums text-[var(--fg)]">
                      {quantityFormatter.format(ingredient.capacity)}
                    </span>{' '}
                    {t('availabilitySales')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
