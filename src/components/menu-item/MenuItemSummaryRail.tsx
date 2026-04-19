'use client';

import { ExclamationTriangleIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { COST_THRESHOLD } from '@/lib/cost-utils';
import { useI18n } from '@/lib/i18n';
import type { MenuItemSection } from './TabBar';

export interface RailSection {
  id: MenuItemSection;
  label: string;
  warning?: boolean;
  disabled?: boolean;
}

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
  sections: RailSection[];
  activeSection?: MenuItemSection;
  onSectionClick: (id: MenuItemSection) => void;
  costSummary?: RailCostSummary | null;
  placeholderLabel?: string;
}

// Sticky product identity + jump nav + live cost badge. Sits in FormModal's
// left sidebar slot. Summary values are passed in — the rail is presentation
// only so it doesn't re-derive state that the page already computes.
export default function MenuItemSummaryRail({
  imageUrl,
  name,
  price,
  activeStatus,
  categoryName,
  sections,
  activeSection,
  onSectionClick,
  costSummary,
  placeholderLabel,
}: Props) {
  const { t } = useI18n();
  const currency = costSummary?.currencySymbol ?? '\u20AA';
  const overThreshold = costSummary && costSummary.costPct > COST_THRESHOLD;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-4 space-y-3">
        <div className="relative">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={name}
              className="w-full aspect-square object-cover rounded-lg"
            />
          ) : (
            <div className="w-full aspect-square rounded-lg border-2 border-dashed border-[var(--divider)] flex items-center justify-center text-fg-tertiary">
              <PhotoIcon className="w-8 h-8" />
            </div>
          )}
          {typeof activeStatus === 'boolean' && (
            <span
              className={`absolute top-2 right-2 w-3 h-3 rounded-full ring-2 ring-[var(--surface)] ${
                activeStatus ? 'bg-status-ready' : 'bg-fg-tertiary'
              }`}
              title={activeStatus ? t('available') : t('unavailable')}
            />
          )}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-bold text-fg-primary truncate" title={name}>
            {name || placeholderLabel || '\u2014'}
          </p>
          {typeof price === 'number' && price > 0 && (
            <p className="text-sm font-semibold text-fg-secondary">
              {price.toFixed(2)} {currency}
            </p>
          )}
          {categoryName && (
            <p className="text-xs uppercase tracking-wider text-fg-tertiary truncate">
              {categoryName}
            </p>
          )}
        </div>
      </div>

      <nav className="rounded-xl border border-[var(--divider)] bg-[var(--surface)] p-2">
        <p className="px-2 pt-1 pb-2 text-xs uppercase tracking-wider text-fg-tertiary font-semibold">
          {t('jumpTo')}
        </p>
        <ul className="space-y-0.5">
          {sections.map((s) => {
            const isActive = activeSection === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={s.disabled}
                  onClick={() => onSectionClick(s.id)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                    s.disabled
                      ? 'text-fg-tertiary cursor-not-allowed opacity-60'
                      : isActive
                        ? 'bg-brand-500/10 text-brand-500 font-semibold'
                        : 'text-fg-secondary hover:text-fg-primary hover:bg-[var(--surface-subtle)]'
                  }`}
                >
                  <span className="truncate">{s.label}</span>
                  {s.warning && <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {costSummary && (
        <div
          className={`rounded-xl border p-4 space-y-2 ${
            overThreshold ? 'border-red-500/40 bg-red-500/5' : 'border-[var(--divider)] bg-[var(--surface)]'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-tertiary uppercase tracking-wider font-semibold">
              {t('foodCostLabel')}
            </span>
            <span className="font-mono font-semibold text-fg-primary">
              {costSummary.foodCost.toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-fg-tertiary uppercase tracking-wider font-semibold">
              {t('grossProfit')}
            </span>
            <span
              className={`font-mono font-semibold ${
                costSummary.margin >= 0 ? 'text-status-ready' : 'text-red-500'
              }`}
            >
              {costSummary.margin.toFixed(2)} {currency}
            </span>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-[var(--divider)]">
            <span className="text-xs text-fg-tertiary uppercase tracking-wider font-semibold">
              {t('costPercent')}
            </span>
            <span
              className={`font-mono font-bold text-sm inline-flex items-center gap-1 ${
                overThreshold ? 'text-red-500' : 'text-fg-primary'
              }`}
            >
              {overThreshold && <ExclamationTriangleIcon className="w-3.5 h-3.5" />}
              {(costSummary.costPct * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
