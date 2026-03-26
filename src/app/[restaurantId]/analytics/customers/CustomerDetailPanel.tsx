'use client';

import { useEffect, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { getAnalyticsCustomerDetail, CustomerDetailResponse } from '@/lib/api';

const labelMap: Record<string, string> = {
  dine_in: 'Dine-In',
  pickup: 'Pickup',
  delivery: 'Delivery',
  cash: 'Cash',
  card: 'Card',
  credit: 'Credit',
  pay_now: 'Online',
  qr_dine_in: 'QR Dine-In',
  website_order: 'Website',
  manual: 'Manual (POS)',
  wolt: 'Wolt',
  unknown_external: 'External',
  pending_review: 'Pending',
  accepted: 'Accepted',
  in_kitchen: 'In Kitchen',
  ready: 'Ready',
  served: 'Served',
  received: 'Received',
  picked_up: 'Picked Up',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  scheduled: 'Scheduled',
};

function formatLabel(s: string): string {
  return labelMap[s] || s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function BreakdownBar({ data, colors }: { data: Record<string, number>; colors: Record<string, string> }) {
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

function MonthlyChart({ data }: { data: { month: string; total_spent: number }[] }) {
  if (data.length === 0) return <span className="text-xs text-fg-secondary">No data</span>;
  const max = Math.max(...data.map(d => d.total_spent), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map(d => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-1" title={`${d.month}: ₪${d.total_spent.toFixed(0)}`}>
          <div
            className="w-full bg-brand-500 rounded-t min-h-[2px]"
            style={{ height: `${(d.total_spent / max) * 100}%` }}
          />
          <span className="text-[10px] text-fg-secondary">{d.month.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CustomerDetailPanel({
  restaurantId, phone, onClose,
}: {
  restaurantId: number;
  phone: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<CustomerDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getAnalyticsCustomerDetail(restaurantId, phone)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [restaurantId, phone]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-surface shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-surface z-10 flex items-center justify-between p-4 border-b border-divider">
          <h2 className="text-lg font-semibold text-fg-primary">Customer Details</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-surface-subtle">
            <XMarkIcon className="w-5 h-5 text-fg-secondary" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : !detail ? (
          <p className="text-sm text-fg-secondary p-6">Customer not found</p>
        ) : (
          <div className="p-4 space-y-6">
            {/* Header */}
            <div>
              <h3 className="text-xl font-bold text-fg-primary">{detail.customer_name || 'Unknown'}</h3>
              <p className="text-sm text-fg-secondary">{detail.customer_phone}</p>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="card text-center py-3">
                  <div className="text-lg font-bold text-fg-primary">₪{detail.total_spent.toFixed(0)}</div>
                  <div className="text-xs text-fg-secondary">Total Spent</div>
                </div>
                <div className="card text-center py-3">
                  <div className="text-lg font-bold text-fg-primary">{detail.total_orders}</div>
                  <div className="text-xs text-fg-secondary">Orders</div>
                </div>
                <div className="card text-center py-3">
                  <div className="text-lg font-bold text-fg-primary">₪{detail.avg_order_value.toFixed(0)}</div>
                  <div className="text-xs text-fg-secondary">Avg Order</div>
                </div>
              </div>
              <div className="flex gap-4 mt-3 text-xs text-fg-secondary">
                <span>First order: {new Date(detail.first_order_date).toLocaleDateString()}</span>
                <span>Last order: {new Date(detail.last_order_date).toLocaleDateString()}</span>
              </div>
              {detail.preferred_day_of_week && (
                <div className="flex gap-4 mt-1 text-xs text-fg-secondary">
                  <span>Prefers: {detail.preferred_day_of_week}s around {detail.preferred_hour}:00</span>
                </div>
              )}
            </div>

            {/* Breakdowns */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">Order Type</h4>
                <BreakdownBar data={detail.order_type_breakdown} colors={orderTypeColors} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">Payment Method</h4>
                <BreakdownBar data={detail.payment_method_breakdown} colors={paymentColors} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-fg-primary mb-2">Order Source</h4>
                <BreakdownBar data={detail.order_source_breakdown} colors={sourceColors} />
              </div>
            </div>

            {/* Monthly Spending */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">Monthly Spending (Last 12 Months)</h4>
              <MonthlyChart data={detail.monthly_spending} />
            </div>

            {/* Product Breakdown */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">Product Breakdown</h4>
              {detail.product_breakdown.length === 0 ? (
                <p className="text-xs text-fg-secondary">No product data</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-left py-1.5 text-fg-secondary font-medium">Item</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">Times</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">Qty</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.product_breakdown.map(p => (
                        <tr key={p.menu_item_id} className="border-b border-divider">
                          <td className="py-1.5 text-fg-primary">{p.name}</td>
                          <td className="py-1.5 text-right text-fg-secondary">{p.times_ordered}</td>
                          <td className="py-1.5 text-right text-fg-secondary">{p.total_quantity}</td>
                          <td className="py-1.5 text-right font-medium text-fg-primary">₪{p.total_spent.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Order History */}
            <div>
              <h4 className="text-sm font-medium text-fg-primary mb-2">Order History</h4>
              {detail.orders.length === 0 ? (
                <p className="text-xs text-fg-secondary">No orders</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-divider">
                        <th className="text-left py-1.5 text-fg-secondary font-medium">Date</th>
                        <th className="text-left py-1.5 text-fg-secondary font-medium">Type</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">Amount</th>
                        <th className="text-left py-1.5 text-fg-secondary font-medium">Payment</th>
                        <th className="text-right py-1.5 text-fg-secondary font-medium">Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.orders.map(o => (
                        <tr key={o.id} className="border-b border-divider">
                          <td className="py-1.5 text-fg-secondary">{new Date(o.created_at).toLocaleDateString()}</td>
                          <td className="py-1.5 text-fg-secondary">{formatLabel(o.order_type)}</td>
                          <td className="py-1.5 text-right font-medium text-fg-primary">₪{o.total_amount.toFixed(0)}</td>
                          <td className="py-1.5 text-fg-secondary">{formatLabel(o.payment_method)}</td>
                          <td className="py-1.5 text-right text-fg-secondary">{o.item_count}</td>
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
