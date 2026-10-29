'use client';
import { useState } from 'react';
import { Button, Field, Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { updateOrderFulfillment, type Order } from '@/lib/api';
import { deliveryScheduleWeekdays } from '@/lib/delivery-zone-state';

/** Confirm the promised delivery time through the scoped fulfillment endpoint. */
export function DeliverySlotAssignment({ order, onSaved }: { order: Order; onSaved: () => void }) {
  const { t } = useI18n();
  const [date, setDate] = useState(order.scheduled_for?.slice(0, 10) ?? '');
  const [start, setStart] = useState(order.scheduled_pickup_window_start ?? '');
  const [end, setEnd] = useState(order.scheduled_pickup_window_end ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const changedDay = date !== order.scheduled_for?.slice(0, 10);
  const save = async () => {
    if (busy || !date || !start || !end || start >= end || (changedDay && !reason.trim())) return;
    setBusy(true); setError(false);
    try {
      await updateOrderFulfillment(order.restaurant_id, order.id, {
        order_type: 'delivery', is_scheduled: true, scheduled_for: date,
        scheduled_pickup_window_start: start, scheduled_pickup_window_end: end,
        delivery_address: order.delivery_address, delivery_city: order.delivery_city,
        delivery_floor: order.delivery_floor, delivery_apt: order.delivery_apt,
        delivery_entry_code: order.delivery_entry_code,
        ...(changedDay ? { reason_code: 'other', reason_note: reason.trim() } : {}),
      });
      setSaved(true); onSaved();
    } catch { setError(true); } finally { setBusy(false); }
  };
  if (saved) return <p role="status" className="p-4">{t('deliverySlotSaved')}</p>;
  return <section className="mb-4 space-y-4 rounded-r-lg border border-[var(--line)] p-4">
    <h3 className="font-semibold">{t(order.delivery_slot_pending ? 'deliverySlotPending' : 'deliveryAssignSlot')}</h3>
    <p className="text-fs-sm text-[var(--fg-muted)]">{t('deliveryAssignmentHint')}</p>
    <p className="text-fs-sm">{order.delivery_schedule?.windows?.length ? order.delivery_schedule.windows.map(window => `${window.days.map(day => t(`weekday_${day}`)).join(', ')} : ${window.start}–${window.end}`).join(' ; ') : order.delivery_schedule && deliveryScheduleWeekdays(order.delivery_schedule).map(day => t(`weekday_${day}`)).join(', ')}</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3"><Field label={t('date')} grow><Input type="date" value={date} onChange={event => setDate(event.target.value)} /></Field><Field label={t('zoneWindowStart')} grow><Input type="time" value={start} onChange={event => setStart(event.target.value)} /></Field><Field label={t('zoneWindowEnd')} grow><Input type="time" value={end} onChange={event => setEnd(event.target.value)} /></Field></fieldset>
    {changedDay && <Field label={t('deliveryMoveReason')} grow><Input value={reason} onChange={event => setReason(event.target.value)} disabled={busy} /></Field>}
    {error && <p role="alert" className="text-fs-sm text-[var(--danger-500)]">{t('deliveryAssignmentError')}</p>}
    <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || !date || !start || !end || start >= end || (changedDay && !reason.trim())}>{t(busy ? 'saving' : 'deliveryAssignSlot')}</Button>
  </section>;
}
