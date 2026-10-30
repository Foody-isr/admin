'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Field, Input, Select } from '@/components/ds';
import { getDeliveryZones, listAllItems, simulateOrderingAvailability, type DeliveryZone, type MenuItem } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';

type InputState = { service: 'pickup' | 'delivery'; address: string; date: string; items: { id: number; quantity: number }[] };
type Result = Awaited<ReturnType<typeof simulateOrderingAvailability>>;

/** Tests the saved basket calendar with the same resolvers used by customers. */
export default function OrderingSimulation({ rid, timezone, dirty, pickupEnabled, deliveryEnabled }: { rid: number; timezone: string; dirty: boolean; pickupEnabled: boolean; deliveryEnabled: boolean }) {
  const { t } = useI18n(), { money } = useCurrency();
  const [open, setOpen] = useState(false), [items, setItems] = useState<MenuItem[]>([]), [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loaded, setLoaded] = useState(false), [loadError, setLoadError] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const [input, setInput] = useState<InputState>({ service: 'delivery', address: '', date: '', items: [] });
  const [result, setResult] = useState<{ signature: string; value: Result } | null>(null);
  const sequence = useRef(0);
  const signature = JSON.stringify(input);
  useEffect(() => () => { sequence.current++; }, []);
  useEffect(() => { sequence.current++; setBusy(false); setResult(null); setError(false); }, [dirty]);
  const load = async () => {
    const token = ++sequence.current; setLoadError(false); setBusy(true);
    try {
      const [catalog, inventory] = await Promise.all([listAllItems(rid), getDeliveryZones(rid)]);
      if (token === sequence.current) {
        setItems(catalog); setZones(inventory); setLoaded(true);
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        setInput(current => ({ ...current, date: current.date || date }));
      }
    } catch { if (token === sequence.current) setLoadError(true); }
    finally { if (token === sequence.current) setBusy(false); }
  };
  const patch = (next: Partial<InputState>) => { sequence.current++; setBusy(false); setInput(current => ({ ...current, ...next })); setError(false); };
  const simulate = async () => {
    const token = ++sequence.current; setBusy(true); setError(false); setResult(null);
    try {
      const value = await simulateOrderingAvailability(rid, input);
      if (value.calendar && (!value.calendar.slots_by_date || typeof value.calendar.slots_by_date !== 'object' || !Number.isFinite(value.calendar.lead_time_minutes))) throw new Error('Incomplete calendar');
      if (token === sequence.current) setResult({ signature, value });
    } catch { if (token === sequence.current) setError(true); }
    finally { if (token === sequence.current) setBusy(false); }
  };
  const current = result?.signature === signature ? result.value : null;
  const calendar = current?.calendar, policy = calendar?.delivery_day_policies?.[input.date];
  const windows = calendar?.slots_by_date[input.date] ?? [];
  const zone = zones.find(zone => zone.id === current?.zone_id);
  const mode = policy?.mode ?? calendar?.delivery_mode ?? 'customer';
  const nextDate = Object.keys(calendar?.slots_by_date ?? {}).filter(date => date > input.date && calendar!.slots_by_date[date]?.length).sort()[0];
  const valid = (input.service === 'pickup' ? pickupEnabled : deliveryEnabled) && !!input.date && input.items.length > 0 && input.items.every(item => Number.isInteger(item.quantity) && item.quantity > 0) && (input.service !== 'delivery' || !!input.address.trim());
  return <details id="ordering-simulation" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5" open={open} onToggle={event => { const expanded = event.currentTarget.open; setOpen(expanded); if (expanded && !loaded && !busy && !loadError) void load(); }}>
    <summary className="cursor-pointer py-1 text-base font-semibold">{t('orderingSimulationTitle')}</summary>
    <div className="mt-5 space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">{t('orderingSimulationHint')}</p>
      {!(input.service === 'pickup' ? pickupEnabled : deliveryEnabled) && <p role="status" className="text-sm">{t('orderingSimulationServiceDisabled')}</p>}
      {dirty && <p role="status" className="text-sm font-medium">{t('orderingSimulationDirty')}</p>}
      {loadError ? <div role="alert" className="space-y-3"><p>{t('orderingSimulationLoadError')}</p><Button type="button" variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : !loaded ? <p role="status">{t('loading')}</p> : <>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={t('orderingSimulationService')}><Select value={input.service} disabled={busy} onChange={event => patch({ service: event.target.value as InputState['service'] })}><option value="pickup" disabled={!pickupEnabled}>{t('pickup')}</option><option value="delivery" disabled={!deliveryEnabled}>{t('delivery')}</option></Select></Field><Field label={t('orderingSimulationDate')}><Input type="date" dir="ltr" value={input.date} disabled={busy} onChange={event => patch({ date: event.target.value })} /></Field></div>
        {input.service === 'delivery' && <Field label={t('orderingSimulationAddress')}><Input value={input.address} disabled={busy} onChange={event => patch({ address: event.target.value })} /></Field>}
        <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">{t('orderingSimulationBasket')}</legend>
          {input.items.map((line, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-end gap-2"><Field label={t('item')}><Select value={line.id} disabled={busy} onChange={event => patch({ items: input.items.map((value, i) => i === index ? { ...value, id: Number(event.target.value) } : value) })}>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field><Field label={t('quantity')}><Input type="number" dir="ltr" min="1" step="1" value={line.quantity || ''} disabled={busy} onChange={event => patch({ items: input.items.map((value, i) => i === index ? { ...value, quantity: Number(event.target.value) } : value) })} /></Field><Button type="button" variant="ghost" disabled={busy} aria-label={`${t('remove')} ${index + 1}`} onClick={() => patch({ items: input.items.filter((_, i) => i !== index) })}>×</Button></div>)}
          <Button type="button" variant="secondary" disabled={busy || !items.length} onClick={() => patch({ items: [...input.items, { id: items[0].id, quantity: 1 }] })}>{t('addItem')}</Button>
        </fieldset>
        <Button type="button" variant="primary" disabled={busy || !valid || dirty} onClick={() => void simulate()}>{t(busy ? 'loading' : 'orderingSimulationRun')}</Button>
      </>}
      {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('orderingSimulationError')}</p>}
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
