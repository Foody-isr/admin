'use client';

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ds/Drawer';
import { getOrder, Order } from '@/lib/api';

interface Props {
  restaurantId: number;
  orderId: number | null;
  onClose: () => void;
}

/** Read-only order detail shown when a production-sheet row is clicked. */
export function ProductionOrderDrawer({ restaurantId, orderId, onClose }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (orderId == null) {
      setOrder(null);
      return;
    }
    setLoading(true);
    getOrder(restaurantId, orderId)
      .then(setOrder)
      .finally(() => setLoading(false));
  }, [restaurantId, orderId]);

  const window =
    order?.scheduled_pickup_window_start && order?.scheduled_pickup_window_end
      ? `${order.scheduled_pickup_window_start}–${order.scheduled_pickup_window_end}`
      : '';
  const subtitle = order ? [order.order_type, window].filter(Boolean).join(' · ') : '';

  return (
    <Drawer
      open={orderId != null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={order?.customer_name || '…'}
      subtitle={subtitle}
    >
      {loading && <p className="text-fs-sm text-[var(--fg-muted)] p-[var(--s-4)]">…</p>}
      {!loading && order && (
        <div className="p-[var(--s-4)] flex flex-col gap-[var(--s-4)]">
          {order.customer_phone && (
            <p className="text-fs-sm text-[var(--fg-muted)]">{order.customer_phone}</p>
          )}
          <ul className="divide-y divide-[var(--line)] border border-[var(--line)] rounded-r-lg">
            {order.items.map((item) => (
              <li key={item.id} className="px-[var(--s-4)] py-[var(--s-3)] flex justify-between gap-[var(--s-3)]">
                <div className="min-w-0">
                  <span className="text-fs-sm font-semibold">{item.quantity} × {item.name}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(item.selected_variant_name || item.variant_portion) && (
                      <span className="text-fs-xs px-2 py-0.5 rounded-r-xl bg-[var(--surface-2)] text-[var(--fg-muted)]">
                        {item.variant_portion || item.selected_variant_name}
                      </span>
                    )}
                    {item.modifiers?.map((m) => (
                      <span key={m.id} className="text-fs-xs px-2 py-0.5 rounded-r-xl bg-[var(--surface-2)] text-[var(--fg-muted)]">
                        {m.name}
                      </span>
                    ))}
                  </div>
                  {item.notes && <p className="text-fs-xs text-[var(--fg-subtle)] mt-1">{item.notes}</p>}
                </div>
                <span className="text-fs-sm tabular-nums whitespace-nowrap">₪{(item.price * item.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-fs-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">₪{order.total_amount.toFixed(2)}</span>
          </div>
          <p className="text-fs-xs text-[var(--fg-muted)] uppercase tracking-[0.05em]">{order.payment_status}</p>
        </div>
      )}
    </Drawer>
  );
}
