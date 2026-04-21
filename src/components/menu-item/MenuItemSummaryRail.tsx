'use client';

import { ExclamationTriangleIcon, PhotoIcon, CameraIcon } from '@heroicons/react/24/outline';
import { COST_THRESHOLD } from '@/lib/cost-utils';
import { useI18n } from '@/lib/i18n';

export interface RailCostSummary {
  foodCost: number;
  costPct: number;
  margin: number;
  currencySymbol?: string;
}

interface Props {
  imageUrl?: string;
  name: string;
  price?: number;
  activeStatus?: boolean;
  categoryName?: string;
  costSummary?: RailCostSummary | null;
  placeholderLabel?: string;
  onImageClick?: () => void;
}

// Left-rail product identity card + cost summary. The rail no longer hosts
// jump-nav — the page uses a top tab bar instead. `onImageClick` fires the
// page's file picker so the camera button doubles as an upload shortcut.
export default function MenuItemSummaryRail({
  imageUrl,
  name,
  price,
  activeStatus,
  categoryName,
  costSummary,
  placeholderLabel,
  onImageClick,
}: Props) {
  const { t } = useI18n();
  const currency = costSummary?.currencySymbol ?? '\u20AA';
  const overThreshold = costSummary && costSummary.costPct > COST_THRESHOLD;

  return (
    <div className="space-y-4">
      {/* Identity card — image + name + price + category pill */}
      <div className="rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-4 space-y-4">
        <div className="relative">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={name}
              className="w-full aspect-square object-cover rounded-xl"
            />
          ) : (
            <div className="w-full aspect-square rounded-xl border-2 border-dashed border-[var(--divider)] flex items-center justify-center text-fg-tertiary">
              <PhotoIcon className="w-10 h-10" />
            </div>
          )}
          {typeof activeStatus === 'boolean' && (
            <span
              className={`absolute top-2.5 right-2.5 w-3.5 h-3.5 rounded-full ring-2 ring-[var(--surface)] ${
                activeStatus ? 'bg-status-ready' : 'bg-fg-tertiary'
              }`}
              title={activeStatus ? t('available') : t('unavailable')}
            />
          )}
          {onImageClick && (
            <button
              type="button"
              onClick={onImageClick}
              aria-label={t('addPhoto') || 'Upload image'}
              className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-black/55 hover:bg-black/70 backdrop-blur-sm text-white flex items-center justify-center transition-colors"
            >
              <CameraIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-lg font-extrabold uppercase tracking-tight text-fg-primary truncate" title={name}>
            {name || placeholderLabel || '\u2014'}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            {typeof price === 'number' && price > 0 && (
              <span className="text-base font-semibold text-brand-500">
                {price.toFixed(2)} {currency}
              </span>
            )}
            {categoryName && (
              <span className="px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wider bg-[var(--surface-subtle)] text-fg-secondary truncate">
                {categoryName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cost summary card */}
      {costSummary && (
        <div className="rounded-2xl border border-[var(--divider)] bg-[var(--surface)] p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-fg-tertiary font-semibold">
            {t('costSummary')}
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-secondary">{t('foodCostLabel')}</span>
            <span className="font-mono font-semibold text-fg-primary">
              {costSummary.foodCost.toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-fg-secondary">{t('grossProfit')}</span>
            <span
              className={`font-mono font-semibold ${
                costSummary.margin >= 0 ? 'text-status-ready' : 'text-red-500'
              }`}
            >
              {costSummary.margin.toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[var(--divider)]">
            <span className="text-sm text-fg-secondary">{t('costPercent')}</span>
            <span
              className={`font-mono font-bold inline-flex items-center gap-1.5 ${
                overThreshold ? 'text-brand-500' : 'text-fg-primary'
              }`}
            >
              {overThreshold && <ExclamationTriangleIcon className="w-4 h-4" />}
              {(costSummary.costPct * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
