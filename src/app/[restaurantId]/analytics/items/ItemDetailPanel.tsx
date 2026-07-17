'use client';

import { useEffect, useState } from 'react';
import { XIcon } from 'lucide-react';
import { getAnalyticsItemDetail, ItemSalesDetail } from '@/lib/api';
import type { DateBasis } from '@/components/DateBasisToggle';
import { useI18n } from '@/lib/i18n';
import { Badge } from '@/components/ds';

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
  const alaRevenue = Math.max(0, totalRevenue - comboRevenue);
  const alaQty = Math.max(0, totalQty - comboQty);
  const denom = totalRevenue > 0 ? totalRevenue : 1;
  const comboPct = Math.min(100, Math.max(0, (comboRevenue / denom) * 100));
  const alaPct = 100 - comboPct;
  const seg = (label: string, qty: number, rev: number, color: string) => (
    <span className="text-xs text-fg-secondary flex items-center gap-1">
      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
      {label}{' '}
      <span className="text-fg-primary font-medium">{qty} · ₪{Math.round(rev)}</span>
    </span>
  );
  return (
    <div>
      <div className="flex rounded-full overflow-hidden h-3 bg-surface-subtle">
        {alaPct > 0 && (
          <div style={{ width: `${alaPct}%`, backgroundColor: ALACARTE_COLOR }}
            title={`${t('alaCarteLabel')}: ${alaQty} · ₪${Math.round(alaRevenue)}`} />
        )}
        {comboPct > 0 && (
          <div style={{ width: `${comboPct}%`, backgroundColor: COMBO_COLOR }}
            title={`${t('combo')}: ${comboQty} · ₪${Math.round(comboRevenue)}`} />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {seg(t('alaCarteLabel'), alaQty, alaRevenue, ALACARTE_COLOR)}
        {seg(t('combo'), comboQty, comboRevenue, COMBO_COLOR)}
      </div>
    </div>
  );
}

/** Daily revenue bars over the selected window. Labels show DD (day of month). */
function DailyChart({ data, noDataLabel }: { data: ItemSalesDetail['daily']; noDataLabel: string }) {
  if (data.length === 0) return <span className="text-xs text-fg-secondary">{noDataLabel}</span>;
  const max = Math.max(...data.map(d => d.revenue), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map(d => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ₪${d.revenue.toFixed(0)} · ${d.quantity}`}>
          <div
            className="w-full bg-brand-500 rounded-t min-h-[2px]"
            style={{ height: `${(d.revenue / max) * 100}%` }}
          />
          <span className="text-[10px] text-fg-secondary">{d.date.slice(8)}</span>
        </div>
      ))}
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
  const [detail, setDetail] = useState<ItemSalesDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    setLoading(true);
    getAnalyticsItemDetail(restaurantId, itemId, scope, basis)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
    // scope is a fresh object each render; depend on its stable fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, itemId, scope.from, scope.to, basis]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-surface shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-surface z-10 flex items-center justify-between p-4 border-b border-divider">
          <h2 className="text-lg font-semibold text-fg-primary">{t('itemDetails')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-subtle">
            <XIcon className="w-5 h-5 text-fg-secondary" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : !detail ? (
          <p className="text-sm text-fg-secondary p-6">{t('itemNotFound')}</p>
        ) : (
          <div className="p-4 space-y-6">
            {/* Header */}
            <div>
              <h3 className="text-xl font-bold text-fg-primary">{detail.name}</h3>
              {detail.category_name && <p className="text-sm text-fg-secondary">{detail.category_name}</p>}
              <div className="grid grid-cols-4 gap-3 mt-3">
                <div className="card text-center py-3">
                  <div className="text-lg font-bold text-fg-primary">₪{detail.revenue.toFixed(0)}</div>
                  <div className="text-xs text-fg-secondary">{t('revenue')}</div>
                </div>
                <div className="card text-center py-3">
                  <div className="text-lg font-bold text-fg-primary">{detail.quantity}</div>
                  <div className="text-xs text-fg-secondary">{t('quantitySold')}</div>
                </div>
                <div className="card text-center py-3">
                  <div className="text-lg font-bold text-fg-primary">{detail.order_count}</div>
                  <div className="text-xs text-fg-secondary">{t('ordersLabel')}</div>
                </div>
                <div className="card text-center py-3">
                  <div className="text-lg font-bold text-fg-primary">₪{detail.avg_price.toFixed(0)}</div>
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
              <DailyChart data={detail.daily} noDataLabel={t('noData')} />
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
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-left py-1.5 text-fg-secondary font-medium">{t('variant')}</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">{t('qty')}</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">{t('revenue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.variants.map((v, i) => (
                        <tr key={i} className="border-b border-divider">
                          <td className="py-1.5 text-fg-primary">
                            {v.variant_name || t('standardVariant')}
                            {v.combo_quantity > 0 && (
                              <span className="ml-2 text-[10px]" style={{ color: COMBO_COLOR }}>
                                {v.combo_quantity} {t('inComboSuffix')}
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 text-right text-fg-secondary">{v.quantity}</td>
                          <td className="py-1.5 text-right font-medium text-fg-primary">₪{v.revenue.toFixed(0)}</td>
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
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-left py-1.5 text-fg-secondary font-medium">{t('customer')}</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">{t('orders')}</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">{t('qty')}</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">{t('revenue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.top_customers.map((c) => (
                        <tr key={c.customer_phone} className="border-b border-divider">
                          <td className="py-1.5 text-fg-primary">
                            <div className="flex items-center gap-1.5">
                              <span>{c.customer_name || '—'}</span>
                              {c.combo_quantity > 0 && (
                                <Badge tone="combo" className="h-[18px] px-1.5">{t('combo')}</Badge>
                              )}
                            </div>
                            <div className="text-[11px] text-fg-secondary">{c.customer_phone}</div>
                          </td>
                          <td className="py-1.5 text-right text-fg-secondary">{c.orders}</td>
                          <td className="py-1.5 text-right text-fg-secondary">{c.quantity}</td>
                          <td className="py-1.5 text-right font-medium text-fg-primary">₪{c.revenue.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
