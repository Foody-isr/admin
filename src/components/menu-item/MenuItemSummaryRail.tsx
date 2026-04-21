'use client';

import { AlertCircle, Camera, Image as ImageIcon } from 'lucide-react';
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

// Left rail — mirrors Figma MenuItemDetails.tsx:43-89.
// Renders inside the w-80 <aside> of MenuItemShell; no outer width here.
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
    <>
      {/* Item card */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl overflow-hidden border border-neutral-200 dark:border-neutral-700 shadow-sm">
        <div className="relative h-48 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-900/30 dark:to-orange-800/30">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-orange-600 dark:text-orange-200">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}
          {typeof activeStatus === 'boolean' && (
            <span
              className={`absolute top-3 right-3 size-3 rounded-full border-2 border-white dark:border-[#1a1a1a] ${
                activeStatus ? 'bg-green-500' : 'bg-neutral-400'
              }`}
              title={activeStatus ? t('available') : t('unavailable')}
            />
          )}
          {onImageClick && (
            <button
              type="button"
              onClick={onImageClick}
              aria-label={t('addPhoto') || 'Upload image'}
              className="absolute bottom-3 right-3 size-8 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center transition-colors"
            >
              <Camera size={16} className="text-white" />
            </button>
          )}
        </div>

        <div className="p-4">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1 truncate" title={name}>
            {name || placeholderLabel || '\u2014'}
          </h3>
          <div className="flex items-center gap-2">
            {typeof price === 'number' && price > 0 && (
              <span className="text-orange-500 font-semibold text-base">
                {price.toFixed(2)} {currency}
              </span>
            )}
            {categoryName && (
              <span className="px-2.5 py-0.5 bg-neutral-100 dark:bg-[#2a2a2a] text-neutral-700 dark:text-neutral-300 rounded text-xs font-medium truncate">
                {categoryName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cost summary — Figma:65 */}
      {costSummary && (
        <div className="mt-6 bg-white dark:bg-[#1a1a1a] rounded-xl p-4 border border-neutral-200 dark:border-neutral-700">
          <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider mb-4">
            {t('costSummary')}
          </h4>
          <div className="space-y-3">
            <Row label={t('foodCostLabel')}>
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                {costSummary.foodCost.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('grossProfit')}>
              <span
                className={`text-sm font-semibold ${
                  costSummary.margin >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-orange-500'
                }`}
              >
                {costSummary.margin.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('costPercent')}>
              <div className="flex items-center gap-1">
                {overThreshold && (
                  <AlertCircle size={14} className="text-orange-500" />
                )}
                <span
                  className={`text-sm font-semibold ${
                    overThreshold
                      ? 'text-orange-500'
                      : 'text-neutral-900 dark:text-white'
                  }`}
                >
                  {(costSummary.costPct * 100).toFixed(1)}%
                </span>
              </div>
            </Row>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-neutral-200 dark:bg-neutral-700" />;
}
