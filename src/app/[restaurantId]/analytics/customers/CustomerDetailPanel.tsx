'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer, Button } from '@/components/ds';
import { RevenueBars } from '@/components/analytics/RevenueBars';
import { getAnalyticsCustomerDetail, CustomerDetailResponse } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import {
  failedRestaurantState,
  loadingRestaurantState,
  readyRestaurantState,
  RestaurantRequestGuard,
  stateForRestaurant,
  type RestaurantLoadState,
} from '@/lib/restaurant-request-state';

const labelKeyMap: Record<string, string> = {
  dine_in: 'labelDineIn',
  pickup: 'labelPickup',
  delivery: 'labelDelivery',
  cash: 'labelCash',
  card: 'labelCard',
  credit: 'labelCredit',
  pay_now: 'labelOnline',
  qr_dine_in: 'labelQrDineIn',
  website_order: 'labelWebsite',
  manual: 'labelManualPOS',
  wolt: 'labelWolt',
  unknown_external: 'labelExternal',
  pending_review: 'labelPending',
  accepted: 'labelAccepted',
  in_kitchen: 'labelInKitchen',
  ready: 'labelReady',
  served: 'labelServed',
  received: 'labelReceived',
  picked_up: 'labelPickedUp',
  delivered: 'labelDelivered',
  cancelled: 'labelCancelled',
  refunded: 'labelRefunded',
  scheduled: 'labelScheduled',
};

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

const orderTypeColors: Record<string, string> = {
  dine_in: '#3b82f6',
  pickup: '#f59e0b',
  delivery: '#10b981',
};

const paymentColors: Record<string, string> = {
  cash: '#10b981',
  card: '#6366f1',
  credit: '#6366f1',
  pay_now: '#8b5cf6',
};

const sourceColors: Record<string, string> = {
  qr_dine_in: '#3b82f6',
  website_order: '#8b5cf6',
  manual: '#f59e0b',
  wolt: '#00c2c7',
  unknown_external: '#94a3b8',
};

export default function CustomerDetailPanel({
  restaurantId, phone, onClose,
}: {
  restaurantId: number;
  phone: string;
  onClose: () => void;
}) {
  const { money } = useCurrency();
  const requestGuardRef = useRef(new RestaurantRequestGuard());
  requestGuardRef.current.enterRestaurant(restaurantId);
  const [loadState, setLoadState] = useState<RestaurantLoadState<{
    phone: string;
    detail: CustomerDetailResponse;
  }>>(() => loadingRestaurantState(restaurantId));
  const { t, locale } = useI18n();
  const visibleState = stateForRestaurant(loadState, restaurantId);
  const currentSelection = visibleState.data?.phone === phone
    ? visibleState.data
    : null;
  const detail = currentSelection?.detail ?? null;
  const loading = visibleState.status === 'loading' || (
    visibleState.status === 'ready' && currentSelection === null
  );
  const loadFailed = visibleState.status === 'error';
  const [attempt, setAttempt] = useState(0);

  const formatLabel = (s: string) => t(labelKeyMap[s] || s);

  useEffect(() => {
    const guard = requestGuardRef.current;
    const token = guard.begin(restaurantId);
    setLoadState(loadingRestaurantState(restaurantId));
    getAnalyticsCustomerDetail(restaurantId, phone)
      .then((result) => {
        if (guard.isCurrent(token)) {
          setLoadState(readyRestaurantState(restaurantId, { phone, detail: result }));
        }
      })
      .catch(() => {
        if (guard.isCurrent(token)) {
          setLoadState(failedRestaurantState(restaurantId));
        }
      });
  }, [restaurantId, phone, attempt]);

  useEffect(() => () => requestGuardRef.current.invalidate(), []);

  return (
    <Drawer open onOpenChange={open => { if (!open) onClose(); }} title={t('customerDetails')} width={576}>
        {loading ? (
          <div className="flex justify-center py-16" role="status" aria-label={t('loading')}>
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : !detail ? (
          <div className="space-y-3 py-8 text-sm text-fg-secondary" role={loadFailed ? 'alert' : 'status'}>
            <p>{loadFailed ? t('couldNotLoad') : t('customerNotFound')}</p>
            {loadFailed && <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>{t('retry')}</Button>}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Header */}
            <div>
              <h3 className="text-xl font-semibold text-fg-primary break-words">{detail.customer_name || t('unknown')}</h3>
              <p className="text-sm text-fg-secondary"><bdi>{detail.customer_phone}</bdi></p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-5 mt-4 rounded-r-lg bg-[var(--summary-bg)] p-4">
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-[var(--summary-fg)] tabular-nums break-words">{money(detail.total_spent, { decimals: 0 })}</div>
                  <div className="text-xs text-fg-secondary">{t('totalSpentLabel')}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-[var(--summary-fg)] tabular-nums break-words">{detail.total_orders}</div>
                  <div className="text-xs text-fg-secondary">{t('ordersLabel')}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-[var(--summary-fg)] tabular-nums break-words">{money(detail.avg_order_value, { decimals: 0 })}</div>
                  <div className="text-xs text-fg-secondary">{t('avgOrderLabel')}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-fg-secondary">
                <span>{t('firstOrder')} {new Date(detail.first_order_date).toLocaleDateString(locale)}</span>
                <span>{t('lastOrderLabel')} {new Date(detail.last_order_date).toLocaleDateString(locale)}</span>
              </div>
              {detail.preferred_day_of_week && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-fg-secondary">
                  <span>{t('prefersTimePattern').replace('{day}', detail.preferred_day_of_week).replace('{hour}', String(detail.preferred_hour))}</span>
                </div>
              )}
            </div>

            {/* Breakdowns */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('orderType')}</h4>
                <BreakdownBar data={detail.order_type_breakdown} colors={orderTypeColors} t={t} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('paymentMethod')}</h4>
                <BreakdownBar data={detail.payment_method_breakdown} colors={paymentColors} t={t} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('orderSource')}</h4>
                <BreakdownBar data={detail.order_source_breakdown} colors={sourceColors} t={t} />
              </div>
            </div>

            {/* Monthly Spending */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">{t('monthlySpending')}</h4>
              <RevenueBars data={detail.monthly_spending.map(point => ({ date: point.month, revenue: point.total_spent }))} />
            </div>

            {/* Product Breakdown */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">{t('productBreakdown')}</h4>
              {detail.product_breakdown.length === 0 ? (
                <p className="text-xs text-fg-secondary">{t('noProductData')}</p>
              ) : (
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full text-sm tabular-nums [&_th]:pe-3 [&_td]:pe-3 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-start py-2.5 text-fg-secondary font-medium">{t('item')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('times')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('qty')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('spent')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.product_breakdown.map(p => (
                        <tr key={p.menu_item_id} className="border-b border-divider">
                          <td className="py-2.5 text-fg-primary">{p.name}</td>
                          <td className="py-2.5 text-end text-fg-secondary">{p.times_ordered}</td>
                          <td className="py-2.5 text-end text-fg-secondary">{p.total_quantity}</td>
                          <td className="py-2.5 text-end font-medium text-fg-primary">{money(p.total_spent, { decimals: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Delivery Addresses — every distinct place this customer has had
                orders delivered to, so a new address on a fresh order reads as
                the same person delivering elsewhere, not a wrong merge. */}
            {detail.addresses.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">{t('deliveryAddresses')}</h4>
                <div className="space-y-2">
                  {detail.addresses.map((a) => {
                    const fmt = formatDeliveryAddress(
                      { address: a.address, city: a.city, floor: a.floor, apt: a.apt, entryCode: a.entry_code },
                      t,
                    );
                    return (
                      <div
                        key={`${a.address}|${a.city}|${a.floor}|${a.apt}`}
                        className="flex flex-wrap items-start justify-between gap-3 border-b border-divider pb-2 last:border-0 last:pb-0"
                      >
                        <div className="flex flex-col leading-tight min-w-0">
                          <span className="text-sm text-fg-primary break-words">{fmt?.line1 || '—'}</span>
                          {fmt?.line2 && <span className="text-xs text-fg-secondary">{fmt.line2}</span>}
                        </div>
                        <div className="flex flex-col items-end text-xs text-fg-secondary whitespace-nowrap">
                          <span>{t('usedNTimes').replace('{count}', String(a.order_count))}</span>
                          <span>{t('lastUsedOn')} {new Date(a.last_used).toLocaleDateString(locale)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Order History */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">{t('orderHistory')}</h4>
              {detail.orders.length === 0 ? (
                <p className="text-xs text-fg-secondary">{t('noOrders')}</p>
              ) : (
                <div className="overflow-x-auto overscroll-x-contain">
                  <table className="w-full text-sm tabular-nums [&_th]:pe-3 [&_td]:pe-3 [&_th:last-child]:pe-0 [&_td:last-child]:pe-0">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-start py-2.5 text-fg-secondary font-medium">{t('date')}</th>
                        <th className="text-start py-2.5 text-fg-secondary font-medium">{t('type')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('amount')}</th>
                        <th className="text-start py-2.5 text-fg-secondary font-medium">{t('payment')}</th>
                        <th className="text-end py-2.5 text-fg-secondary font-medium">{t('items')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.orders.map(o => (
                        <tr key={o.id} className="border-b border-divider">
                          <td className="py-2.5 text-fg-secondary">{new Date(o.created_at).toLocaleDateString(locale)}</td>
                          <td className="py-2.5 text-fg-secondary">{formatLabel(o.order_type)}</td>
                          <td className="py-2.5 text-end font-medium text-fg-primary">{money(o.total_amount, { decimals: 0 })}</td>
                          <td className="py-2.5 text-fg-secondary">{formatLabel(o.payment_method)}</td>
                          <td className="py-2.5 text-end text-fg-secondary">{o.item_count}</td>
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
