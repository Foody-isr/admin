'use client';

import { useState } from 'react';
import { Button, Drawer, Field, Select } from '@/components/ds';
import { insertPlannedStop, type DeliveryRoute } from '@/lib/delivery';
import { deliveryRoutingError } from '@/lib/delivery-planning';
import { useI18n } from '@/lib/i18n';
import type { Order, StaffMember } from '@/lib/api';

interface Props {
  restaurantId: number;
  order: Order;
  routes: { route: DeliveryRoute; number: number }[];
  couriers: Map<number, StaffMember>;
  initialRouteId?: number | null;
  onClose: () => void;
  onSaved: (route: DeliveryRoute, number: number) => void;
  onRefresh: () => Promise<void>;
}

/** Place a late delivery in a saved itinerary while retaining the other stops' order. */
export function InsertDeliveryDrawer({ restaurantId, order, routes, couriers, initialRouteId, onClose, onSaved, onRefresh }: Props) {
  const { t } = useI18n();
  const [routeId, setRouteId] = useState(initialRouteId && routes.some(row => row.route.id === initialRouteId) ? initialRouteId : routes.length === 1 ? routes[0].route.id : 0);
  const [position, setPosition] = useState('end');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = routes.find(row => row.route.id === routeId);
  const route = selected?.route;
  const ordered = [...(route?.stops ?? [])].sort((left, right) => left.sequence - right.sequence);
  const afterIndex = ordered.findIndex(stop => String(stop.id) === position);
  const anchorExists = position === 'start' || position === 'end' || afterIndex >= 0;
  const insertAt = position === 'end' ? ordered.length : position === 'start' ? 0 : afterIndex + 1;
  const previous = ordered[insertAt - 1], next = ordered[insertAt];

  const insert = async () => {
    if (!route || !selected || !anchorExists || busy) return;
    setBusy(true);
    setError('');
    try {
      onSaved(await insertPlannedStop(restaurantId, route.id, order.id, next?.id), selected.number);
    } catch (cause) {
      await onRefresh();
      setError(deliveryRoutingError(cause, t) ?? t('deliveryInsertFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open onOpenChange={open => { if (!open && !busy) onClose(); }} closeDisabled={busy}
      title={t('deliveryInsertTitle')} subtitle={`#${order.id} · ${order.customer_name}`}
      footer={<Button className="w-full" disabled={busy || !route || !anchorExists} onClick={() => void insert()}>{t('deliveryInsertConfirm')}</Button>}>
      <div className="space-y-5">
        <Field label={t('deliveryInsertRoute')}>
          <Select value={route?.id ?? ''} disabled={busy} onChange={event => {
            setRouteId(Number(event.target.value)); setPosition('end'); setError('');
          }}>
            <option value="">{t('deliveryInsertChoose')}</option>
            {routes.map(({ route: row, number }) => <option key={row.id} value={row.id}>
              {couriers.get(row.courier_id)?.full_name ?? t('courier')} · {t('mapsRoute')} {number}
            </option>)}
          </Select>
        </Field>
        {route && <Field label={t('deliveryInsertPosition')}>
          <Select value={position} disabled={busy} onChange={event => { setPosition(event.target.value); setError(''); }}>
            <option value="end">{t('deliveryInsertLast')}</option>
            {ordered.length > 0 && <option value="start">{t('dispatchFirst')}</option>}
            {ordered.map(stop => <option key={stop.id} value={stop.id}>
              {t('deliveryInsertAfter').replace('{sequence}', String(stop.sequence))} · #{stop.order_id} · {stop.customer_name}
            </option>)}
          </Select>
        </Field>}
        {route && anchorExists && <section aria-label={t('deliveryInsertPreview')} className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4">
          <h3 className="mb-2 text-fs-sm font-semibold">{t('deliveryInsertPreview')}</h3>
          <ol className="space-y-1">
            {[
              ...(previous ? [{ id: previous.order_id, name: previous.customer_name, position: insertAt }] : []),
              { id: order.id, name: order.customer_name, position: insertAt + 1 },
              ...(next ? [{ id: next.order_id, name: next.customer_name, position: insertAt + 2 }] : []),
            ].map(row => <li key={row.id} className={row.id === order.id ? 'flex items-center gap-3 rounded-r-md bg-[var(--surface-2)] px-2 py-2 font-semibold' : 'flex items-center gap-3 px-2 py-2 text-[var(--fg-muted)]'}>
              <span className="num text-fs-sm" dir="ltr">{String(row.position).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 text-fs-sm"><bdi>{row.name}</bdi> · <bdi>#{row.id}</bdi></span>
              {row.id === order.id && <span className="text-fs-xs text-[var(--info-500)]">{t('deliveryInsertNewStop')}</span>}
            </li>)}
          </ol>
        </section>}
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('deliveryInsertHint')}</p>
        {(error || !anchorExists || !routes.length) && <p role="alert" className="text-fs-sm text-[var(--danger-500)]">
          {error || t('deliveryInsertionChanged')}
        </p>}
      </div>
    </Drawer>
  );
}
