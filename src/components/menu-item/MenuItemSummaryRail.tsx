'use client';

import { AlertCircle, Image as ImageIcon, Camera } from 'lucide-react';
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

// Left-rail identity card + cost summary, theme-aware.
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
    <div className="w-[280px] flex flex-col gap-6">
      {/* Identity card */}
      <div className="relative bg-[var(--surface)] border border-[var(--divider)] rounded-xl overflow-hidden shadow-sm">
        <div className="relative w-full h-48 bg-gradient-to-br from-brand-100 to-brand-200 dark:from-brand-900/30 dark:to-brand-800/30">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-brand-500">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}
          {typeof activeStatus === 'boolean' && (
            <span
              className={`absolute top-3 right-3 w-3 h-3 rounded-full ring-2 ring-[var(--surface)] ${
                activeStatus ? 'bg-green-500' : 'bg-[var(--text-secondary)]'
              }`}
              title={activeStatus ? t('available') : t('unavailable')}
            />
          )}
          {onImageClick && (
            <button
              type="button"
              onClick={onImageClick}
              aria-label={t('addPhoto') || 'Upload image'}
              className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
            >
              <Camera className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-4 flex flex-col gap-1">
          <p className="text-lg font-bold text-[var(--text-primary)] truncate" title={name}>
            {name || placeholderLabel || '\u2014'}
          </p>
          <div className="flex items-center gap-2">
            {typeof price === 'number' && price > 0 && (
              <span className="text-base font-semibold text-brand-500">
                {price.toFixed(2)} {currency}
              </span>
            )}
            {categoryName && (
              <span className="inline-flex items-center bg-[var(--surface-subtle)] rounded-md px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)] truncate">
                {categoryName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cost summary card */}
      {costSummary && (
        <div className="bg-[var(--surface)] border border-[var(--divider)] rounded-xl p-4 flex flex-col gap-4 shadow-sm">
          <p className="text-xs font-semibold tracking-wider uppercase text-[var(--text-secondary)]">
            {t('costSummary')}
          </p>
          <div className="flex flex-col gap-3">
            <Row label={t('foodCostLabel')}>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {costSummary.foodCost.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('grossProfit')}>
              <span
                className={`text-sm font-semibold ${
                  costSummary.margin >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-brand-500'
                }`}
              >
                {costSummary.margin.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('costPercent')}>
              <span
                className={`inline-flex items-center gap-1 text-sm font-semibold ${
                  overThreshold ? 'text-brand-500' : 'text-[var(--text-primary)]'
                }`}
              >
                {overThreshold && <AlertCircle className="w-3.5 h-3.5" />}
                {(costSummary.costPct * 100).toFixed(1)}%
              </span>
            </Row>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--divider)]" />;
}
