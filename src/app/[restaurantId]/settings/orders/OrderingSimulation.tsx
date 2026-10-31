'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Input, Select } from '@/components/ds';
import { RouteAddressField } from '@/components/delivery/RouteAddressField';
import { getDeliveryZones, listAllItems, getOrderingSimulationClock, simulateOrderingAvailability, type DeliveryZone, type MenuItem, type OrderingSimulationClock } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';

type InputState = { service: 'pickup' | 'delivery'; address: string; date: string; orderedAt: string; items: { id: number; quantity: number }[] };
type Result = Awaited<ReturnType<typeof simulateOrderingAvailability>>;

/** Tests the saved basket calendar with the same resolvers used by customers. */
export default function OrderingSimulation({ rid, timezone, dirty, pickupEnabled, deliveryEnabled }: { rid: number; timezone: string; dirty: boolean; pickupEnabled: boolean; deliveryEnabled: boolean }) {
  const { t, locale } = useI18n(), { money } = useCurrency();
  const [open, setOpen] = useState(false), [items, setItems] = useState<MenuItem[]>([]), [zones, setZones] = useState<DeliveryZone[]>([]);
  const [clock, setClock] = useState<OrderingSimulationClock | null>(null);
  const [addressResolving, setAddressResolving] = useState(false);
  const [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(false), [catalogBusy, setCatalogBusy] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState<InputState>({ service: 'delivery', address: '', date: '', orderedAt: '', items: [] });
  const [result, setResult] = useState<{ signature: string; value: Result } | null>(null);
  const sequence = useRef(0), catalogSequence = useRef(0);
  const signature = JSON.stringify(input);
  useEffect(() => () => { sequence.current++; catalogSequence.current++; }, []);
  useEffect(() => { sequence.current++; setBusy(false); setResult(null); setError(null); }, [dirty]);
  const load = async () => {
    const token = ++catalogSequence.current; setLoadError(false); setCatalogBusy(true);
    try {
      const [catalog, inventory, reference] = await Promise.all([listAllItems(rid), getDeliveryZones(rid), getOrderingSimulationClock(rid)]);
      if (token === catalogSequence.current) {
        setItems(catalog); setZones(inventory); setClock(reference); setLoaded(true);
        const orderedAt = reference.ordered_at.slice(0, 16);
        setInput(current => ({ ...current, date: current.date || orderedAt.slice(0, 10), orderedAt: current.orderedAt || orderedAt }));
      }
    } catch { if (token === catalogSequence.current) setLoadError(true); }
    finally { if (token === catalogSequence.current) setCatalogBusy(false); }
  };
  const patch = (next: Partial<InputState>) => { sequence.current++; setBusy(false); setInput(current => ({ ...current, ...next, ...(next.orderedAt && current.date < next.orderedAt.slice(0, 10) ? { date: next.orderedAt.slice(0, 10) } : {}) })); setError(null); };
  const resetClock = async () => {
    const token = ++sequence.current; setBusy(true); setError(null); setResult(null);
    try {
      const reference = await getOrderingSimulationClock(rid);
      if (token === sequence.current) { setClock(reference); patch({ orderedAt: reference.ordered_at.slice(0, 16) }); }
    } catch { if (token === sequence.current) setError('orderingSimulationError'); }
    finally { if (token === sequence.current) setBusy(false); }
  };
  const simulate = async () => {
    const token = ++sequence.current; setBusy(true); setError(null); setResult(null);
    try {
      const value = await simulateOrderingAvailability(rid, input);
      if (value.calendar && (!value.calendar.slots_by_date || typeof value.calendar.slots_by_date !== 'object' || !Number.isFinite(value.calendar.lead_time_minutes) || value.calendar.evaluated_at?.slice(0, 16) !== input.orderedAt || value.calendar.timezone !== clock?.timezone)) throw new Error('Incomplete calendar');
      if (token === sequence.current) setResult({ signature, value });
    } catch (failure) { if (token === sequence.current) setError(failure instanceof Error && failure.message === 'ordering_simulation_time_invalid' ? 'orderingSimulationInvalidTime' : 'orderingSimulationError'); }
    finally { if (token === sequence.current) setBusy(false); }
  };
  const current = result?.signature === signature ? result.value : null;
  const calendar = current?.calendar, policy = calendar?.delivery_day_policies?.[input.date];
  const windows = calendar?.slots_by_date[input.date] ?? [];
  const zone = zones.find(zone => zone.id === current?.zone_id);
  const mode = policy?.mode ?? calendar?.delivery_mode ?? 'customer';
  const nextDate = Object.keys(calendar?.slots_by_date ?? {}).filter(date => date > input.date && calendar!.slots_by_date[date]?.length).sort()[0];
  const validMinute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.orderedAt) && input.orderedAt >= '2000-01-01T00:00' && input.orderedAt <= '2100-12-31T23:59' && Number.isFinite(Date.parse(`${input.orderedAt}Z`)) && new Date(`${input.orderedAt}Z`).toISOString().slice(0, 16) === input.orderedAt;
  const orderDay = validMinute ? new Intl.DateTimeFormat(locale, { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${input.orderedAt.slice(0, 10)}T12:00:00Z`)) : '';
  const valid = !!clock && validMinute && (input.service === 'pickup' ? pickupEnabled : deliveryEnabled) && !!input.date && input.date >= input.orderedAt.slice(0, 10) && input.items.length > 0 && input.items.every(item => Number.isInteger(item.quantity) && item.quantity > 0) && (input.service !== 'delivery' || !!input.address.trim());
  return <details id="ordering-simulation" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5" open={open} onToggle={event => { const expanded = event.currentTarget.open; setOpen(expanded); if (expanded && !loaded && !catalogBusy && !loadError) void load(); }}>
    <summary className="cursor-pointer py-1 text-base font-semibold">{t('orderingSimulationTitle')}</summary>
    <div className="mt-5 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">{t('orderingSimulationHint')}</p>
      {!(input.service === 'pickup' ? pickupEnabled : deliveryEnabled) && <p role="status" className="text-sm">{t('orderingSimulationServiceDisabled')}</p>}
      {dirty && <p role="status" className="text-sm font-medium">{t('orderingSimulationDirty')}</p>}
      {loadError ? <div role="alert" className="space-y-3"><p>{t('orderingSimulationLoadError')}</p><Button type="button" variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : !loaded ? <p role="status">{t('loading')}</p> : <>
        <div className="space-y-2">
          <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label={t('orderingSimulationOrderedAt')}><Input id="simulation-ordered-at" type="datetime-local" dir="ltr" min="2000-01-01T00:00" max="2100-12-31T23:59" step="60" value={input.orderedAt} disabled={busy} aria-invalid={error === 'orderingSimulationInvalidTime' || undefined} onChange={event => patch({ orderedAt: event.target.value })} /></Field>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void resetClock()}>{t('orderingSimulationNow')}</Button>
          </div>
          <p className="text-sm text-[var(--fg-muted)]"><bdi>{orderDay}</bdi>{orderDay && ' · '}<bdi>{clock?.timezone || timezone}</bdi></p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={t('orderingSimulationService')}><Select value={input.service} disabled={busy} onChange={event => patch({ service: event.target.value as InputState['service'] })}><option value="pickup" disabled={!pickupEnabled}>{t('pickup')}</option><option value="delivery" disabled={!deliveryEnabled}>{t('delivery')}</option></Select></Field><Field label={t('orderingSimulationDate')}><Input type="date" dir="ltr" min={input.orderedAt.slice(0, 10)} value={input.date} disabled={busy} onChange={event => patch({ date: event.target.value })} /></Field></div>
        {input.service === 'delivery' && <RouteAddressField key={rid} restaurantId={rid} locale={locale} label={t('orderingSimulationAddress')} value={input.address} disabled={busy} onChange={address => patch({ address })} onResolvingChange={setAddressResolving} t={t} />}
        <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">{t('orderingSimulationBasket')}</legend>
          {input.items.map((line, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-2"><Field label={t('item')}><Select value={line.id} disabled={busy} onChange={event => patch({ items: input.items.map((value, i) => i === index ? { ...value, id: Number(event.target.value) } : value) })}>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label={t('quantity')}><Input type="number" dir="ltr" min="1" step="1" value={line.quantity || ''} disabled={busy} onChange={event => patch({ items: input.items.map((value, i) => i === index ? { ...value, quantity: Number(event.target.value) } : value) })} /></Field><Button type="button" variant="ghost" disabled={busy} aria-label={`${t('remove')} ${index + 1}`} onClick={() => patch({ items: input.items.filter((_, i) => i !== index) })}>×</Button></div>)}
          <Button type="button" variant="secondary" disabled={busy || !items.length} onClick={() => patch({ items: [...input.items, { id: items[0].id, quantity: 1 }] })}>{t('addItem')}</Button>
        </fieldset>
        <Button type="button" variant="primary" disabled={busy || (input.service === 'delivery' && addressResolving) || !valid || dirty} onClick={() => void simulate()}>{t(busy ? 'loading' : 'orderingSimulationRun')}</Button>
      </>}
      {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t(error)}</p>}
      {current && <div role="status" className="space-y-3 border-s-2 border-[var(--line)] ps-4 text-sm leading-6" data-ordering-simulation-result>
        {calendar?.evaluated_at && <p>{t('preparationPreviewOrderedAt')} <bdi>{calendar.evaluated_at.slice(0, 10)} · {calendar.evaluated_at.slice(11, 16)} · {calendar.timezone}</bdi></p>}
        {!current.resolved ? <p>{t('orderingSimulationUnresolved')}</p> : !current.deliverable ? <p>{t('orderingSimulationOutside')}</p> : <>
          {zone && <p className="font-semibold">{zone.name} · {money(current.delivery_fee ?? 0)}</p>}
          {calendar && <p>{t('orderingSimulationPreparation')} <bdi>{calendar.lead_time_minutes} {t('minutes')}</bdi>{calendar.constrained_by && <> · {calendar.constrained_by.name}</>}</p>}
          {zone?.schedule?.same_day && policy && <p>{t('zoneSameDayTransit')} : <bdi>{zone.schedule.same_day.transit_minutes}</bdi></p>}
          {!calendar ? <p>{t('orderingSimulationNoZoneCalendar')}</p> : !windows.length ? <><p className="font-medium">{t(policy?.unavailable_reason === 'same_day_disabled' || policy?.unavailable_reason === 'same_day_outside_coverage' ? 'orderingSimulationSameDayDisabled' : 'orderingSimulationNoDate')}</p>{nextDate && <p>{t('orderingSimulationNextDate')} <bdi>{nextDate}</bdi></p>}</> : <>
            <p className="font-semibold">{t(mode === 'restaurant' ? 'orderingSimulationEstimate' : 'orderingSimulationSlots')}</p>
            <p><bdi>{input.date} · {windows.slice(0, 6).map(window => `${window.start}–${window.end}`).join(', ')}{windows.length > 6 ? '…' : ''}</bdi></p>
            <p>{t(mode === 'restaurant' ? 'sameDayTimeRestaurant' : mode === 'automatic' ? 'deliveryScheduleAutomatic' : 'deliveryScheduleCustomer')}</p>
          </>}
        </>}
        <Link className="inline-block underline underline-offset-4" href={`/${rid}/settings/delivery`}>{t('deliveryZones')}</Link>
      </div>}
    </div>
  </details>;
}
