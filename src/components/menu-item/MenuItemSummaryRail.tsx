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
  comparable: boolean;
}

interface Props {
  imageUrl?: string;
  name: string;
  price?: number;
  activeStatus?: boolean;
  /** Recipe-aware availability — overrides the dot colour to amber/yellow when
   *  the item is active but can't be made or is running low. */
  availabilityState?: 'available' | 'low' | 'sold_out' | 'hidden';
  availabilityBottleneck?: string;
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
  availabilityState,
  availabilityBottleneck,
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
      <div className="bg-[var(--surface)] rounded-r-lg overflow-hidden border border-[var(--line)] shadow-sm">
        <div className="relative h-48 bg-gradient-to-br from-[color-mix(in_oklab,var(--brand-500)_16%,transparent)] to-[color-mix(in_oklab,var(--brand-500)_7%,transparent)]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--brand-500)]">
              <ImageIcon className="w-10 h-10" />
            </div>
          )}
          {typeof activeStatus === 'boolean' && (() => {
            let dotClass: string;
            let dotTitle: string;
            if (!activeStatus) {
              dotClass = 'bg-[var(--fg-subtle)]';
              dotTitle = t('unavailable');
            } else if (availabilityState === 'sold_out') {
              dotClass = 'bg-amber-500';
              dotTitle = availabilityBottleneck || t('outOfStock');
            } else if (availabilityState === 'low') {
              dotClass = 'bg-yellow-400';
              dotTitle = availabilityBottleneck || t('lowStock');
            } else {
              dotClass = 'bg-[var(--success-500)]';
              dotTitle = t('available');
            }
            return (
              <span
                className={`absolute top-3 right-3 size-3 rounded-full border-2 border-[var(--surface)] ${dotClass}`}
                title={dotTitle}
              />
            );
          })()}
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
          <h3 className="text-lg font-bold text-[var(--fg)] mb-1 truncate" title={name}>
            {name || placeholderLabel || '\u2014'}
          </h3>
          <div className="flex items-center gap-2">
            {typeof price === 'number' && price > 0 && (
              <span className="text-[var(--brand-500)] font-semibold text-base">
                {price.toFixed(2)} {currency}
              </span>
            )}
            {categoryName && (
              <span className="px-2.5 py-0.5 bg-[var(--surface-2)] text-[var(--fg-muted)] rounded text-xs font-medium truncate">
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
        <div className="mt-6 bg-[var(--surface)] rounded-r-lg p-4 border border-[var(--line)]">
          <h4 className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-4">
            {t('costSummary')}
          </h4>
          <div className="space-y-3">
            <Row label={t('foodCostLabel')}>
              <span className="text-sm font-semibold text-[var(--fg)]">
                {costSummary.foodCost.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('grossProfit')}>
              <span
                className={`text-sm font-semibold ${
                  costSummary.margin >= 0
                    ? 'text-[var(--success-500)]'
                    : 'text-[var(--brand-500)]'
                }`}
              >
                {costSummary.margin.toFixed(2)} {currency}
              </span>
            </Row>
            <Divider />
            <Row label={t('costPercent')}>
              <div className="flex items-center gap-1">
                {overThreshold && (
                  <AlertCircle size={14} className="text-[var(--brand-500)]" />
                )}
                <span
                  className={`text-sm font-semibold ${
                    overThreshold
                      ? 'text-[var(--brand-500)]'
                      : 'text-[var(--fg)]'
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
      <span className="text-sm text-[var(--fg-muted)]">{label}</span>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[var(--line)]" />;
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
  // `incomparable` short-circuits all the others — when the comparison would
  // run against a fictional baseline (share plates, per-person items priced
  // at ₪0 solo), we replace the saves/surcharge framing with a help note.
  const state: 'unknown' | 'incomparable' | 'saves' | 'costs-more' | 'even' =
    summary.unknown ? 'unknown'
    : !summary.comparable ? 'incomparable'
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

  // Incomparable combos skip the solo/surcharge math entirely — showing
  // "490 ₪" with a strike-through next to a ₪1600 combo is just noise when
  // the operator never intended those items to sell solo. The drilldown
  // stays reachable so the operator can still see which options are
  // missing a standalone retail price.
  if (state === 'incomparable') {
    const help = (
      <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
        {t('comboSavingsIncomparable') || 'Comparaison indisponible : certaines options sont vendues uniquement dans ce combo (plats à partager, prix par personne).'}
      </p>
    );
    return (
      <div className="mt-6 bg-[var(--surface)] rounded-r-lg p-4 border border-[var(--line)]">
        <h4 className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-4">
          {t('comboSavingsPanelTitle') || 'Économies pour le client'}
        </h4>
        <div className="space-y-3">
          <Row label={t('composeBasePriceLabel')}>
            <span className="text-sm font-semibold text-[var(--fg)] tabular-nums">
              {comboLabel}
            </span>
          </Row>
          {onShowDetail ? (
            <button
              type="button"
              onClick={onShowDetail}
              className="text-start hover:underline focus:outline-none focus-visible:underline"
            >
              {help}
            </button>
          ) : help}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-[var(--surface)] rounded-r-lg p-4 border border-[var(--line)]">
      <h4 className="text-xs font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-4">
        {t('comboSavingsPanelTitle') || 'Économies pour le client'}
      </h4>
      <div className="space-y-3">
        <Row label={t('composeSoldSeparately')}>
          <span className="text-sm text-[var(--fg-muted)] line-through tabular-nums">
            {soloLabel}
          </span>
        </Row>
        <Divider />
        <Row label={t('composeBasePriceLabel')}>
          <span className="text-sm font-semibold text-[var(--fg)] tabular-nums">
            {comboLabel}
          </span>
        </Row>
        <Divider />
        <Row label={state === 'costs-more'
          ? (t('comboSurchargeLabel') || 'Surcoût combo')
          : (t('reduction') || 'Réduction')}>
          {state === 'unknown' && (
            <span className="text-sm text-[var(--fg-muted)]">—</span>
          )}
          {state === 'even' && (
            <span className="text-sm text-[var(--fg-muted)] tabular-nums">±{currency}0</span>
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
