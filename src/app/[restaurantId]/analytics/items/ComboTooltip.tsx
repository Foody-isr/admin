'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { useI18n } from '@/lib/i18n';

const COMBO_COLOR = '#7c3aed';

/** ₪ with 1 decimal under 10 (so small shares stay legible), rounded above. */
function money(n: number): string {
  return n >= 10 ? Math.round(n).toLocaleString() : n.toFixed(1);
}

/** One receipt line: description (optional violet dot + label + calc) on the
 *  left, amount right-aligned. Amounts use tabular figures so they align. */
function Row({
  label, calc, amount, dot, strong,
}: {
  label: string; calc?: string; amount: string; dot?: boolean; strong?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[1fr_auto] items-center gap-x-6 ${strong ? 'font-semibold' : ''}`}>
      <span className="flex items-center gap-1.5">
        <span className="inline-flex w-2 shrink-0 justify-center">
          {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: COMBO_COLOR }} />}
        </span>
        <span className="shrink-0">{label}</span>
        {calc && <span className="text-[var(--fg-muted)] tabular-nums">{calc}</span>}
      </span>
      <span className="tabular-nums text-right">{amount}</span>
    </div>
  );
}

/**
 * Wraps a combo indicator with a hover/focus tooltip that reconciles the
 * product's revenue like a receipt: à-la-carte units × price + combo units ×
 * their share of the forfait (combo_revenue / combo_quantity) = total. This
 * answers "how are 23 sold = ₪665". All figures come from the report response;
 * nothing is recomputed on the server. Renders children unchanged when there are
 * no combo sales.
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
  const alaRevenue = revenue - comboRevenue;
  const alaUnit = alaQty > 0 ? alaRevenue / alaQty : 0;
  const units = t('units').toLowerCase();

  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            collisionPadding={12}
            className="z-50 w-max max-w-[280px] rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] shadow-xl px-3 py-2.5 text-xs origin-(--radix-tooltip-content-transform-origin) animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
          >
            <div className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--fg-muted)] mb-2">
              {t('revenueBreakdown')}
            </div>
            <div className="space-y-1">
              {alaQty > 0 && (
                <Row
                  label={t('alaCarteLabel')}
                  calc={`${alaQty} × ₪${money(alaUnit)}`}
                  amount={`₪${Math.round(alaRevenue).toLocaleString()}`}
                />
              )}
              <Row
                dot
                label={t('combo')}
                calc={`${comboQty} × ≈ ₪${money(comboUnit)}`}
                amount={`₪${Math.round(comboRevenue).toLocaleString()}`}
              />
            </div>
            {alaQty > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-[var(--line)]">
                <Row
                  strong
                  label={t('totalLabel')}
                  calc={`${quantity} ${units}`}
                  amount={`₪${Math.round(revenue).toLocaleString()}`}
                />
              </div>
            )}
            <div className="mt-2 text-[10px] leading-snug text-[var(--fg-muted)]">
              {t('comboUnitExplain')}
            </div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
