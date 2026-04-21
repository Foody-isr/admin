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

// Left-rail identity card + cost summary. Pixel-aligned to Figma node 0:17.
// Colors are scoped to this page since the design is dark-only.
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
      {/* Identity card — image + name + price + category pill (Figma 0:18) */}
      <div className="relative bg-[#18181b] border border-[rgba(255,255,255,0.1)] rounded-[12px] overflow-hidden shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
        <div className="relative w-full h-[192px]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#9f9fa9] bg-[#27272a]">
              <PhotoIcon className="w-10 h-10" />
            </div>
          )}
          {typeof activeStatus === 'boolean' && (
            <span
              className={`absolute top-3 right-3 w-3 h-3 rounded-full ring-2 ring-[#09090b] ${
                activeStatus ? 'bg-[#00c950]' : 'bg-[#9f9fa9]'
              }`}
              title={activeStatus ? t('available') : t('unavailable')}
            />
          )}
          {onImageClick && (
            <button
              type="button"
              onClick={onImageClick}
              aria-label={t('addPhoto') || 'Upload image'}
              className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-[rgba(9,9,11,0.6)] hover:bg-[rgba(9,9,11,0.8)] text-[#fafafa] flex items-center justify-center transition-colors"
            >
              <CameraIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="p-4 flex flex-col gap-1">
          <p className="text-[18px] leading-[28px] text-[#fafafa] truncate" title={name}>
            {name || placeholderLabel || '\u2014'}
          </p>
          <div className="flex items-center gap-2">
            {typeof price === 'number' && price > 0 && (
              <span className="text-[16px] leading-[24px] text-[#f54900]">
                {price.toFixed(2)} {currency}
              </span>
            )}
            {categoryName && (
              <span className="inline-flex items-center bg-[#27272a] border border-[rgba(255,255,255,0.1)] rounded-[6px] px-[9px] py-[3px] text-[12px] leading-[16px] text-[#fafafa] truncate">
                {categoryName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Cost summary card (Figma 0:35) */}
      {costSummary && (
        <div className="relative bg-[#18181b] rounded-[12px] p-4 flex flex-col gap-4 shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
          <p className="text-[12px] leading-[16px] tracking-[0.6px] uppercase text-[#9f9fa9]">
            {t('costSummary')}
          </p>
          <div className="flex flex-col gap-2">
            <Row label={t('foodCostLabel')}>
              <span className="text-[14px] leading-[20px] text-[#fafafa]">
                {costSummary.foodCost.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('grossProfit')}>
              <span
                className={`text-[14px] leading-[20px] ${
                  costSummary.margin >= 0 ? 'text-[#05df72]' : 'text-[#f54900]'
                }`}
              >
                {costSummary.margin.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('costPercent')}>
              <span
                className={`inline-flex items-center gap-1 text-[14px] leading-[20px] ${
                  overThreshold ? 'text-[#f54900]' : 'text-[#fafafa]'
                }`}
              >
                {overThreshold && <ExclamationTriangleIcon className="w-[14px] h-[14px]" />}
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
      <span className="text-[14px] leading-[20px] text-[#9f9fa9]">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[rgba(255,255,255,0.1)]" />;
}
