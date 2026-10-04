'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer, Button } from '@/components/ds';
import { RevenueBars } from '@/components/analytics/RevenueBars';
import { getAnalyticsItemDetail, ItemSalesDetail, type DateBasis } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { Badge } from '@/components/ds';
import { ComboTooltip } from './ComboTooltip';
import {
  failedRestaurantState,
  loadingRestaurantState,
  readyRestaurantState,
  RestaurantRequestGuard,
  stateForRestaurant,
  type RestaurantLoadState,
} from '@/lib/restaurant-request-state';

// Combo visual language, reused across the report: violet = sold inside a combo,
// neutral slate = à la carte. Distinct from the breakdown hues below and from
// brand orange (default sales).
const COMBO_COLOR = '#7c3aed';
const ALACARTE_COLOR = '#94a3b8';

// Order type / source values → existing i18n label keys (same map the customer
// panel uses). Kept local so this screen stays self-contained.
const labelKeyMap: Record<string, string> = {
  dine_in: 'labelDineIn',
  pickup: 'labelPickup',
  delivery: 'labelDelivery',
  qr_dine_in: 'labelQrDineIn',
  website_order: 'labelWebsite',
  manual: 'labelManualPOS',
  wolt: 'labelWolt',
  unknown_external: 'labelExternal',
};

const orderTypeColors: Record<string, string> = {
  dine_in: '#3b82f6',
  pickup: '#f59e0b',
  delivery: '#10b981',
};

const sourceColors: Record<string, string> = {
  qr_dine_in: '#3b82f6',
  website_order: '#8b5cf6',
  manual: '#f59e0b',
  wolt: '#00c2c7',
  unknown_external: '#94a3b8',
};

/** Horizontal share bar for a breakdown map (values are percentages 0–100). */
function BreakdownBar({ data, colors, t }: { data: Record<string, number>; colors: Record<string, string>; t: (k: string) => string }) {
  const formatLabel = (s: string) => t(labelKeyMap[s] || s);
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <span className="text-xs text-fg-secondary">—</span>;
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 bg-surface-subtle">
        {entries.map(([key, pct]) => (
          <div
            key={key}
            style={{ width: `${pct}%`, backgroundColor: colors[key] || '#94a3b8' }}
            title={`${formatLabel(key)}: ${pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {entries.map(([key, pct]) => (
          <span key={key} className="text-xs text-fg-secondary flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: colors[key] || '#94a3b8' }} />
            {formatLabel(key)} {pct.toFixed(0)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/** À la carte vs combo split, sized by revenue, with units + ₪ per side. Explains
 *  why an item's revenue isn't quantity × à-la-carte price: combo picks are
 *  attributed at their real (discounted) share of the combo forfait. */
function SalesSplitBar({
  totalRevenue, comboRevenue, totalQty, comboQty, t,
}: {
  totalRevenue: number; comboRevenue: number; totalQty: number; comboQty: number;
  t: (k: string) => string;
}) {
  const { money } = useCurrency();
  const alaRevenue = Math.max(0, totalRevenue - comboRevenue);
  const alaQty = Math.max(0, totalQty - comboQty);
  const denom = totalRevenue > 0 ? totalRevenue : 1;
  const comboPct = Math.min(100, Math.max(0, (comboRevenue / denom) * 100));
  const alaPct = 100 - comboPct;
  const seg = (label: string, qty: number, rev: number, color: string, interactive = false) => (
    <span className={`text-xs text-fg-secondary flex items-center gap-1${interactive ? ' cursor-help' : ''}`}>
      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
      {label}{' '}
      <span className="text-fg-primary font-medium">{qty} · {money(Math.round(rev))}</span>
    </span>
  );
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 bg-surface-subtle">
        {alaPct > 0 && (
          <div style={{ width: `${alaPct}%`, backgroundColor: ALACARTE_COLOR }}
            title={`${t('alaCarteLabel')}: ${alaQty} · ${money(Math.round(alaRevenue))}`} />
        )}
        {comboPct > 0 && (
          <div style={{ width: `${comboPct}%`, backgroundColor: COMBO_COLOR }}
            title={`${t('combo')}: ${comboQty} · ${money(Math.round(comboRevenue))}`} />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {seg(t('alaCarteLabel'), alaQty, alaRevenue, ALACARTE_COLOR)}
        <ComboTooltip quantity={totalQty} revenue={totalRevenue} comboQty={comboQty} comboRevenue={comboRevenue}>
          {seg(t('combo'), comboQty, comboRevenue, COMBO_COLOR, true)}
        </ComboTooltip>
      </div>
    </div>
  );
}

export default function ItemDetailPanel({
  restaurantId, itemId, scope, basis, onClose,
}: {
  restaurantId: number;
  itemId: number;
  scope: { from: string; to: string };
  basis: DateBasis;
  onClose: () => void;
}) {
  const { money } = useCurrency();
  const requestGuardRef = useRef(new RestaurantRequestGuard());
  requestGuardRef.current.enterRestaurant(restaurantId);
  const requestKey = `${itemId}:${scope.from}:${scope.to}:${basis}`;
  const [loadState, setLoadState] = useState<RestaurantLoadState<{
    key: string;
    detail: ItemSalesDetail;
  }>>(() => loadingRestaurantState(restaurantId));
  const { t } = useI18n();
  const visibleState = stateForRestaurant(loadState, restaurantId);
  const currentSelection = visibleState.data?.key === requestKey
    ? visibleState.data
    : null;
  const detail = currentSelection?.detail ?? null;
  const loading = visibleState.status === 'loading' || (
    visibleState.status === 'ready' && currentSelection === null
  );
  const loadFailed = visibleState.status === 'error';
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const guard = requestGuardRef.current;
    const token = guard.begin(restaurantId);
    setLoadState(loadingRestaurantState(restaurantId));
    getAnalyticsItemDetail(restaurantId, itemId, scope, basis)
      .then((result) => {
        if (guard.isCurrent(token)) {
          setLoadState(readyRestaurantState(restaurantId, { key: requestKey, detail: result }));
        }
      })
      .catch(() => {
        if (guard.isCurrent(token)) {
          setLoadState(failedRestaurantState(restaurantId));
        }
      });
    // scope is a fresh object each render; depend on its stable fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, itemId, scope.from, scope.to, basis, attempt]);

  useEffect(() => () => requestGuardRef.current.invalidate(), []);

  return (
    <Drawer open onOpenChange={open => { if (!open) onClose(); }} title={t('itemDetails')} width={576}>
        {loading ? (
          <div className="flex justify-center py-16" role="status" aria-label={t('loading')}>
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : !detail ? (
          <div className="space-y-3 py-8 text-sm text-fg-secondary" role={loadFailed ? 'alert' : 'status'}>
            <p>{loadFailed ? t('couldNotLoad') : t('itemNotFound')}</p>
            {loadFailed && <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</Button>}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <h3 className="text-xl font-semibold text-fg-primary break-words">{detail.name}</h3>
              {detail.category_name && <p className="text-sm text-fg-secondary">{detail.category_name}</p>}
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 mt-4 rounded-r-lg bg-[var(--summary-bg)] p-4">
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-[var(--summary-fg)] tabular-nums break-words">{money(detail.revenue, { decimals: 0 })}</div>
                  <div className="text-xs text-fg-secondary">{t('revenue')}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-[var(--summary-fg)] tabular-nums break-words">{detail.quantity}</div>
                  <div className="text-xs text-fg-secondary">{t('quantitySold')}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-[var(--summary-fg)] tabular-nums break-words">{detail.order_count}</div>
                  <div className="text-xs text-fg-secondary">{t('ordersLabel')}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-[var(--summary-fg)] tabular-nums break-words">{money(detail.avg_price, { decimals: 0 })}</div>
                  <div className="text-xs text-fg-secondary">{t('avgPrice')}</div>
                </div>
              </div>
            </div>

            {/* À la carte vs combo — shown only when combos contributed, right
                under the KPIs where "why isn't revenue qty × price?" arises. */}
            {detail.combo_quantity > 0 && (
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('salesSplitTitle')}</h4>
                <SalesSplitBar
                  totalRevenue={detail.revenue}
                  comboRevenue={detail.combo_revenue}
                  totalQty={detail.quantity}
                  comboQty={detail.combo_quantity}
                  t={t}
                />
              </div>
            )}

            {/* Daily trend */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">{t('dailyTrend')}</h4>
              <RevenueBars data={detail.daily} />
            </div>

            {/* Breakdowns */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('orderType')}</h4>
                <BreakdownBar data={detail.order_type_breakdown} colors={orderTypeColors} t={t} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('orderSource')}</h4>
                <BreakdownBar data={detail.order_source_breakdown} colors={sourceColors} t={t} />
              </div>
            </div>

            {/* Variants */}
            {detail.variants.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('variants')}</h4>
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full text-sm tabular-nums [&_th]:pe-3 [&_td]:pe-3 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-start py-2.5 text-fg-secondary font-medium">{t('variant')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('qty')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('revenue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.variants.map((v, i) => (
                        <tr key={i} className="border-b border-divider">
                          <td className="py-2.5 text-fg-primary">
                            {v.variant_name || t('standardVariant')}
                            {v.combo_quantity > 0 && (
                              <ComboTooltip quantity={v.quantity} revenue={v.revenue} comboQty={v.combo_quantity} comboRevenue={v.combo_revenue}>
                                <span className="ms-2 text-xs cursor-help underline decoration-dotted underline-offset-2 text-[#7c3aed] dark:text-[#a78bfa]">
                                  {v.combo_quantity} {t('inComboSuffix')}
                                </span>
                              </ComboTooltip>
                            )}
                          </td>
                          <td className="py-2.5 text-end text-fg-secondary">{v.quantity}</td>
                          <td className="py-2.5 text-end font-medium text-fg-primary">{money(v.revenue, { decimals: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Top customers */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">{t('topCustomers')}</h4>
              {detail.top_customers.length === 0 ? (
                <p className="text-xs text-fg-secondary">{t('noCustomerData')}</p>
              ) : (
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full text-sm tabular-nums [&_th]:pe-3 [&_td]:pe-3 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-start py-2.5 text-fg-secondary font-medium">{t('customer')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('orders')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('qty')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('revenue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.top_customers.map((c) => (
                        <tr key={c.customer_phone} className="border-b border-divider">
                          <td className="py-2.5 text-fg-primary">
                            <div className="flex items-center gap-1.5">
                              <span>{c.customer_name || '—'}</span>
                              {c.combo_quantity > 0 && (
                                <ComboTooltip quantity={c.quantity} revenue={c.revenue} comboQty={c.combo_quantity} comboRevenue={c.combo_revenue}>
                                  <Badge tone="combo" className="h-[18px] px-1.5 cursor-help">{t('combo')}</Badge>
                                </ComboTooltip>
                              )}
                            </div>
                            <div className="text-xs text-fg-secondary"><bdi>{c.customer_phone}</bdi></div>
                          </td>
                          <td className="py-2.5 text-end text-fg-secondary">{c.orders}</td>
                          <td className="py-2.5 text-end text-fg-secondary">{c.quantity}</td>
                          <td className="py-2.5 text-end font-medium text-fg-primary">{money(c.revenue, { decimals: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
    </Drawer>
  );
}
