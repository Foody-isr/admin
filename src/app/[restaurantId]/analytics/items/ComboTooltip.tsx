'use client';

import * as React from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useI18n } from '@/lib/i18n';

/** ₪ with 1 decimal under 10 (so small shares stay legible), rounded above. */
function money(n: number): string {
  return n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1);
}

/**
 * Wraps a combo indicator with a hover/focus tooltip explaining how much the
 * product actually earns per unit inside a combo — its share of the combo
 * forfait (combo_revenue / combo_quantity) — next to its à-la-carte unit price
 * for comparison. All four fields come from the report; nothing is recomputed on
 * the server. Renders children unchanged when there are no combo sales.
 */
export function ComboTooltip({
  quantity, revenue, comboQty, comboRevenue, children,
}: {
  quantity: number;
  revenue: number;
  comboQty: number;
  comboRevenue: number;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  if (comboQty <= 0) return <>{children}</>;

  const comboUnit = comboRevenue / comboQty;
  const alaQty = quantity - comboQty;
  const alaUnit = alaQty > 0 ? (revenue - comboRevenue) / alaQty : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="max-w-[240px]">
        <div className="space-y-1">
          <div className="font-medium">
            {t('combo')} : ≈ ₪{money(comboUnit)} {t('perUnitLabel')}
          </div>
          {alaUnit > 0 && (
            <div className="opacity-80">
              {t('alaCarteLabel')} : ₪{money(alaUnit)} {t('perUnitLabel')}
            </div>
          )}
          <div className="opacity-70">
            {comboQty} × ≈ ₪{money(comboUnit)} = ₪{Math.round(comboRevenue).toLocaleString()}
          </div>
          <div className="opacity-70 pt-1 border-t border-white/15">{t('comboUnitExplain')}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
