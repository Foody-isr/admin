'use client';

import { AlertCircle, AlertTriangle, Camera, Image as ImageIcon } from 'lucide-react';
import { COST_THRESHOLD } from '@/lib/cost-utils';
import { useI18n } from '@/lib/i18n';

export interface RailCostSummary {
  foodCost: number;
  costPct: number;
  margin: number;
  currencySymbol?: string;
}

/** Mirrors `ComboSavingsSummary` from combo/pricing.ts. Keeping the rail
 *  generic so it doesn't need to import combo internals. */
export interface RailComboSummary {
  comboMin: number;
  comboMax: number;
  soloMin: number;
  soloMax: number;
  savingsMin: number;
  savingsMax: number;
  savingsPct: number;
  unknown: boolean;
}

interface Props {
  imageUrl?: string;
  name: string;
  price?: number;
  activeStatus?: boolean;
  categoryName?: string;
  costSummary?: RailCostSummary | null;
  /** When set, renders the "Économies pour le client" panel instead of /
   *  alongside the cost summary. Supplied by the page when the item is a
   *  combo. */
  comboSummary?: RailComboSummary | null;
  /** Optional drilldown — when provided, the savings badge becomes a button
   *  that calls this on click (the page opens its breakdown modal). */
  onShowComboSavingsDetail?: () => void;
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
  comboSummary,
  onShowComboSavingsDetail,
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

      {/* Combo savings — replaces the cost summary for combos. Mirrors
          the design's "ÉCONOMIES POUR LE CLIENT" panel. */}
      {comboSummary && (
        <ComboSavingsPanel
          summary={comboSummary}
          currency={currency}
          onShowDetail={onShowComboSavingsDetail}
        />
      )}

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

// ── Combo savings panel ─────────────────────────────────────────────────
// Three states:
//   • unknown — no solo prices resolvable yet (categories still loading).
//   • saves — combo cheaper than solo. Green badge with "−₪X · Y%".
//   • costs-more — combo is MORE expensive than buying separately. Warning
//     badge with "+₪X · Y%" — operator misconfiguration signal.
function ComboSavingsPanel({
  summary, currency, onShowDetail,
}: {
  summary: RailComboSummary;
  currency: string;
  onShowDetail?: () => void;
}) {
  const { t } = useI18n();
  // State is driven by the OUTER bound of the savings range so a combo whose
  // cheapest scenario breaks even but whose pricier scenarios save money still
  // shows up as "saves" instead of falling silently into 'even'.
  const state: 'unknown' | 'saves' | 'costs-more' | 'even' =
    summary.unknown ? 'unknown'
    : summary.savingsMax > 0 ? 'saves'
    : summary.savingsMin < 0 ? 'costs-more'
    : 'even';
  const absSaveMin = Math.abs(summary.savingsMin);
  const absSaveMax = Math.abs(summary.savingsMax);
  const absSavePct = Math.round(Math.abs(summary.savingsPct));
  const detailable = !!onShowDetail && (state === 'saves' || state === 'costs-more');

  // Pretty range — drops the second half when min and max collapse, and uses
  // a bare "₪0" on the lower bound so we don't render the awkward "−₪0.00"
  // when the cheapest scenario happens to break even exactly.
  const formatSavings = (sign: '−' | '+'): string => {
    if (absSaveMin === absSaveMax) {
      return `${sign}${currency}${absSaveMin.toFixed(2)} (${absSavePct}%)`;
    }
    const lo = absSaveMin === 0 ? `${currency}0` : `${sign}${currency}${absSaveMin.toFixed(2)}`;
    const hi = `${sign}${currency}${absSaveMax.toFixed(2)}`;
    return `${lo} – ${hi}`;
  };

  const soloLabel = state === 'unknown'
    ? '—'
    : summary.soloMin === summary.soloMax
      ? `${summary.soloMin.toFixed(2)} ${currency}`
      : `${summary.soloMin.toFixed(2)} – ${summary.soloMax.toFixed(2)} ${currency}`;
  const comboLabel = summary.comboMin === summary.comboMax
    ? `${summary.comboMin.toFixed(2)} ${currency}`
    : `${summary.comboMin.toFixed(2)} – ${summary.comboMax.toFixed(2)} ${currency}`;

  return (
    <div className="mt-6 bg-white dark:bg-[#1a1a1a] rounded-xl p-4 border border-neutral-200 dark:border-neutral-700">
      <h4 className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wider mb-4">
        {t('comboSavingsPanelTitle') || 'Économies pour le client'}
      </h4>
      <div className="space-y-3">
        <Row label={t('composeSoldSeparately')}>
          <span className="text-sm text-neutral-500 dark:text-neutral-400 line-through tabular-nums">
            {soloLabel}
          </span>
        </Row>
        <Divider />
        <Row label={t('composeBasePriceLabel')}>
          <span className="text-sm font-semibold text-neutral-900 dark:text-white tabular-nums">
            {comboLabel}
          </span>
        </Row>
        <Divider />
        <Row label={state === 'costs-more'
          ? (t('comboSurchargeLabel') || 'Surcoût combo')
          : (t('reduction') || 'Réduction')}>
          {state === 'unknown' && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400">—</span>
          )}
          {state === 'even' && (
            <span className="text-sm text-neutral-500 dark:text-neutral-400 tabular-nums">±{currency}0</span>
          )}
          {state === 'saves' && (
            detailable ? (
              <button
                type="button"
                onClick={onShowDetail}
                title={t('savingsBreakdownDetailButton')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tabular-nums hover:brightness-110 hover:underline cursor-pointer"
                style={{
                  background: 'color-mix(in oklab, var(--success-500) 14%, transparent)',
                  color: 'var(--success-500)',
                }}
              >
                {formatSavings('−')}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tabular-nums"
                style={{
                  background: 'color-mix(in oklab, var(--success-500) 14%, transparent)',
                  color: 'var(--success-500)',
                }}
              >
                {formatSavings('−')}
              </span>
            )
          )}
          {state === 'costs-more' && (
            detailable ? (
              <button
                type="button"
                onClick={onShowDetail}
                title={t('savingsBreakdownDetailButton')}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tabular-nums hover:brightness-110 hover:underline cursor-pointer"
                style={{
                  background: 'color-mix(in oklab, var(--warning-500) 14%, transparent)',
                  color: 'var(--warning-500)',
                }}
              >
                <AlertTriangle className="w-3 h-3" />
                {formatSavings('+')}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold tabular-nums"
                style={{
                  background: 'color-mix(in oklab, var(--warning-500) 14%, transparent)',
                  color: 'var(--warning-500)',
                }}
              >
                <AlertTriangle className="w-3 h-3" />
                {formatSavings('+')}
              </span>
            )
          )}
        </Row>
      </div>
    </div>
  );
}
