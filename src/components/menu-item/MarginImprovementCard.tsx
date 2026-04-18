'use client';

import { useRouter } from 'next/navigation';
import type { StockItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  CostLine,
  IngredientSuggestion,
  PriceSuggestion,
  suggestTargetPrice,
  suggestTopIngredient,
} from '@/lib/cost-suggestions';

interface Props {
  rid: number;
  itemId: number;
  // displayCost and displayPrice are both on the current VAT basis (the panel's
  // "Show TTC/HT" toggle). showCostsExVat + vatMultiplier let us translate the
  // target price back to TTC — the basis used by item.price on the Details tab.
  displayCost: number;
  displayPrice: number;
  showCostsExVat: boolean;
  vatMultiplier: number;
  targetPct: number;
  lines: CostLine[];
  // When true the active price comes from a variant — we still surface a
  // target number but the price-edit CTA routes to Details without prefilling
  // (variant/override prices are not edited on the base price field).
  isVariantPrice: boolean;
  onEditStockItem?: (s: StockItem) => void;
}

// Actionable "how to get back under the threshold" card. Rendered only when
// the menu item is above the food-cost threshold. Two suggestions: raise the
// price, or renegotiate the single biggest ingredient.
export default function MarginImprovementCard({
  rid, itemId, displayCost, displayPrice, showCostsExVat, vatMultiplier,
  targetPct, lines, isVariantPrice, onEditStockItem,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const price: PriceSuggestion | null = suggestTargetPrice(displayCost, displayPrice, targetPct);
  const ing: IngredientSuggestion | null = suggestTopIngredient(lines, displayCost, displayPrice, targetPct);

  if (!price && !ing) return null;

  const targetPctLabel = (targetPct * 100).toFixed(0);

  const goToPrice = () => {
    const base = `/${rid}/menu/items/${itemId}?tab=details`;
    if (price && !isVariantPrice) {
      // item.price is stored inc-VAT (TTC). When the panel is showing ex-VAT
      // numbers, scale the target back up before handing it to the Details
      // tab's price input.
      const prefillInc = showCostsExVat
        ? price.targetPrice * vatMultiplier
        : price.targetPrice;
      router.push(`${base}&suggestedPrice=${prefillInc.toFixed(2)}`);
      return;
    }
    router.push(base);
  };

  const topStock = ing?.ingredient.stock_item;
  const topPrep = ing?.ingredient.prep_item;
  const ingTitle = topStock?.name ?? topPrep?.name ?? '';

  const triggerIngCta = () => {
    if (topStock && onEditStockItem) {
      onEditStockItem(topStock);
      return;
    }
    if (topPrep) {
      router.push(`/${rid}/kitchen/prep`);
    }
  };

  const ingCtaLabel = topStock
    ? t('editIngredientCostCta')
    : (t('openPreparationCta') || 'Open preparation');

  return (
    <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-fg-primary">
        <span className="text-xl leading-none">💡</span>
        <span>{t('marginImprovementTitle')}</span>
        <span className="text-xs font-normal text-fg-secondary">
          {t('toReachTargetPct').replace('{target}', targetPctLabel)}
        </span>
      </div>

      <div className={`grid gap-3 ${price && ing ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
        {price && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface)' }}>
            <p className="text-xs uppercase tracking-wider text-fg-secondary font-medium">
              {t('raisePriceTitle')}
            </p>
            <div className="font-mono text-sm text-fg-primary">
              {displayPrice.toFixed(2)} &#8362;
              <span className="mx-2 text-fg-tertiary">→</span>
              <span className="font-semibold">{price.targetPrice.toFixed(2)} &#8362;</span>
            </div>
            <div className="text-xs text-fg-secondary">
              +{price.delta.toFixed(2)} &#8362; (+{(price.deltaPct * 100).toFixed(1)}%)
            </div>
            {isVariantPrice && (
              <p className="text-xs text-amber-500">{t('variantPriceHint')}</p>
            )}
            <button
              onClick={goToPrice}
              className="btn-primary text-xs py-1.5 px-3 rounded-full"
            >
              {t('editPriceCta')} &rarr;
            </button>
          </div>
        )}

        {ing && (
          <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--surface)' }}>
            <p className="text-xs uppercase tracking-wider text-fg-secondary font-medium">
              {t('renegotiateIngredientTitle')}
            </p>
            <div className="text-sm text-fg-primary">
              <span className="font-semibold">{ingTitle}</span>
              <span className="text-xs text-fg-secondary ml-2">
                {t('contributionPctLabel').replace('{pct}', (ing.contributionPct * 100).toFixed(0))}
              </span>
            </div>
            <div className="font-mono text-sm text-fg-primary">
              {ing.currentUnitCost.toFixed(2)} &#8362;/{ing.sourceUnit}
              <span className="mx-2 text-fg-tertiary">→</span>
              <span className="font-semibold">
                {ing.targetUnitCost.toFixed(2)} &#8362;/{ing.sourceUnit}
              </span>
            </div>
            <div className="text-xs text-fg-secondary">
              {(ing.targetUnitCost - ing.currentUnitCost).toFixed(2)} &#8362;
              &nbsp;({(ing.deltaPct * 100).toFixed(1)}%)
            </div>
            {topPrep && !topStock && (
              <p className="text-xs text-fg-tertiary">{t('prepIngredientHint')}</p>
            )}
            <button
              onClick={triggerIngCta}
              disabled={!topStock && !topPrep}
              className="btn-primary text-xs py-1.5 px-3 rounded-full disabled:opacity-50"
            >
              {ingCtaLabel} &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
