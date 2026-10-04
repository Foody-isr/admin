'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { getRestaurant, getRestaurantSettings, previewBatchFulfillment, updateRestaurantSettings, type RestaurantSettings, type BatchFulfillmentDay, type BatchPreviewInput, type BatchCycleSummary } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, Input, Section, Select } from '@/components/ds';
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace';
import { ordersSettingsNavigation } from './navigation';
import { ModeCard, ServiceToggle } from './_components';

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
type Mode = 'off' | 'slots' | 'batch';
type Draft = { mode: Mode; lead: string; horizon: string; duration: string; slotPay: boolean; batchPay: boolean; openDay: number; openTime: string; cutoffDay: number; cutoffTime: string; days: BatchFulfillmentDay[] };
type Invalid = { id: string; group: 'slots' | 'batch'; key: string };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function draftFrom(settings: RestaurantSettings): Draft {
  if (['scheduling_enabled','batch_fulfillment_enabled','scheduling_require_prepayment','batch_require_prepayment'].some(key => typeof settings[key as keyof RestaurantSettings] !== 'boolean') || [settings.scheduling_max_days_ahead, settings.scheduling_slot_duration_minutes].some(value => !Number.isFinite(value))) throw new Error('Incomplete preorder settings');
  const lead = (settings.scheduling_lead_time_minutes ?? 0) > 0 ? settings.scheduling_lead_time_minutes! : Math.max(0, settings.scheduling_min_days_ahead ?? 0) * 1440;
  if (!Number.isFinite(lead) || (settings.batch_fulfillment_days != null && !Array.isArray(settings.batch_fulfillment_days))) throw new Error('Incomplete preorder schedule');
  return { mode: settings.batch_fulfillment_enabled ? 'batch' : settings.scheduling_enabled ? 'slots' : 'off', lead: String(lead), horizon: String(settings.scheduling_max_days_ahead), duration: String(settings.scheduling_slot_duration_minutes), slotPay: settings.scheduling_require_prepayment!, batchPay: settings.batch_require_prepayment!, openDay: settings.batch_order_open_day ?? 0, openTime: settings.batch_order_open_time || '', cutoffDay: settings.batch_cutoff_day ?? 0, cutoffTime: settings.batch_cutoff_time || '', days: settings.batch_fulfillment_days ?? [] };
}
function batchInput(draft: Draft): BatchPreviewInput {
  return { batch_order_open_day: draft.openDay, batch_order_open_time: draft.openTime, batch_cutoff_day: draft.cutoffDay, batch_cutoff_time: draft.cutoffTime, batch_fulfillment_days: draft.days };
}
function batchError(draft: Draft): Invalid | null {
  if (!draft.days.length) return { id: 'preorder-add-day', group: 'batch', key: 'batchFulfillmentNoDays' };
  for (const field of ['open','cutoff'] as const) {
    if (field === 'open' && draft.openTime === '') continue;
    if (!Number.isInteger(draft[`${field}Day`]) || draft[`${field}Day`] < 0 || draft[`${field}Day`] > 6) return { id: `preorder-${field}-day`, group: 'batch', key: 'preorderInvalidDay' };
    if (!validTime(draft[`${field}Time`])) return { id: `preorder-${field}-time`, group: 'batch', key: 'availabilityInvalidTime' };
  }
  const used = new Set<number>();
  for (let index = 0; index < draft.days.length; index++) {
    const day = draft.days[index];
    if (!Number.isInteger(day.day) || day.day < 0 || day.day > 6 || used.has(day.day)) return { id: `preorder-day-${index}`, group: 'batch', key: 'preorderInvalidDay' };
    used.add(day.day);
    for (const channel of ['pickup','delivery'] as const) {
      const start = day[`${channel}_start`] || '', end = day[`${channel}_end`] || '';
      if ((start || end) && (!validTime(start) || !validTime(end))) return { id: `preorder-${index}-${channel}-${!validTime(start) ? 'start' : 'end'}`, group: 'batch', key: 'preorderInvalidWindow' };
    }
  }
  return null;
}

/** Edit preorder modes and preview weekly cycles without altering untouched settings. */
export default function PreorderSettings() {
  const { restaurantId } = useParams();
  return <PreorderWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function PreorderWorkspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n(); const router = useRouter();
  const { hasAnyPermission } = usePermissions(); const canEdit = hasAnyPermission('settings.edit');
  const [draft, setDraft] = useState<Draft | null>(null), [baseline, setBaseline] = useState<Draft | null>(null);
  const [timezone, setTimezone] = useState('');
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(false), [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<Invalid | null>(null), [leaving, setLeaving] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; cycles: BatchCycleSummary[] }>({ status: 'idle', cycles: [] });
  const [previewRetry, setPreviewRetry] = useState(0);
  const lifetime = useRef({ generation: 0, sequence: 0 }); const lock = useRef(false);
  const dirty = !!draft && !equal(draft, baseline);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try { const [restaurant, settings] = await Promise.all([getRestaurant(rid), getRestaurantSettings(rid)]), next = draftFrom(settings); if (current()) { setDraft(next); setBaseline(next); setTimezone(restaurant.timezone || ''); } }
    catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  const previewInput = draft && !batchError(draft) ? JSON.stringify(batchInput(draft)) : null;
  useEffect(() => {
    let current = true;
    if (!previewInput || loading || loadError) { setPreview({ status: 'idle', cycles: [] }); return; }
    setPreview({ status: 'loading', cycles: [] });
    const timer = setTimeout(() => {
      void previewBatchFulfillment(rid, JSON.parse(previewInput)).then(result => {
        if (!Array.isArray(result.upcoming_cycles) || result.upcoming_cycles.some(cycle => !cycle || typeof cycle.open_at !== 'string' || !Number.isFinite(Date.parse(cycle.open_at)) || typeof cycle.cutoff_at !== 'string' || !Number.isFinite(Date.parse(cycle.cutoff_at)) || !Array.isArray(cycle.fulfillment_days) || cycle.fulfillment_days.some(day => !day || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date)))) throw new Error('Incomplete batch preview');
        if (current) setPreview({ status: 'ready', cycles: result.upcoming_cycles });
      }).catch(() => { if (current) setPreview({ status: 'error', cycles: [] }); });
    }, 400);
    return () => { current = false; clearTimeout(timer); };
  }, [rid, previewInput, previewRetry, loading, loadError]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!dirty && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || link.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); if (!lock.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload', guard); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const patch = (values: Partial<Draft>) => { if (!canEdit || lock.current) return; setDraft(current => current ? { ...current, ...values } : current); setSaved(false); setSaveError(false); setInvalid(null); };
  const reject = (error: Invalid) => { setInvalid(error); requestAnimationFrame(() => document.getElementById(error.id)?.focus()); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canEdit || !draft || !baseline || !dirty || lock.current || loading || loadError) return;
    const input: Partial<RestaurantSettings> = {};
    if (draft.mode !== baseline.mode) { input.scheduling_enabled = draft.mode === 'slots'; input.batch_fulfillment_enabled = draft.mode === 'batch'; }
    for (const [field, key, min, step] of [['lead','scheduling_lead_time_minutes',0,1],['horizon','scheduling_max_days_ahead',1,1],['duration','scheduling_slot_duration_minutes',5,5]] as const) {
      const changed = draft[field] !== baseline[field], value = Number(draft[field]);
      if ((changed || (draft.mode === 'slots' && baseline.mode !== 'slots')) && (!/^\d+$/.test(draft[field]) || !Number.isSafeInteger(value) || value < min || value % step !== 0)) { reject({ id: `preorder-${field}`, group: 'slots', key: field === 'duration' ? 'preorderInvalidDuration' : field === 'horizon' ? 'preorderInvalidHorizon' : 'preorderInvalidLead' }); return; }
      if (changed) { input[key] = value; if (field === 'lead') input.scheduling_min_days_ahead = Math.ceil(value / 1440); }
    }
    if ((draft.openTime !== baseline.openTime && !validTime(draft.openTime)) || (draft.openDay !== baseline.openDay && !draft.openTime)) { reject({ id: 'preorder-open-time', group: 'batch', key: 'preorderOpeningRequired' }); return; }
    if (draft.cutoffTime !== baseline.cutoffTime && !validTime(draft.cutoffTime)) { reject({ id: 'preorder-cutoff-time', group: 'batch', key: 'availabilityInvalidTime' }); return; }
    const batchChanged = !equal(batchInput(draft), batchInput(baseline));
    if (batchChanged || (draft.mode === 'batch' && baseline.mode !== 'batch')) {
      const error = batchError(draft);
      // An inactive batch may be cleared completely, while partial/duplicate windows must remain reviewable.
      if (error && !(draft.mode !== 'batch' && draft.days.length === 0 && error.id === 'preorder-add-day')) { reject(error); return; }
    }
    for (const field of ['openDay','openTime','cutoffDay','cutoffTime','days'] as const) if (!equal(draft[field], baseline[field])) {
      if (field === 'openDay') input.batch_order_open_day = draft.openDay;
      else if (field === 'openTime') input.batch_order_open_time = draft.openTime;
      else if (field === 'cutoffDay') input.batch_cutoff_day = draft.cutoffDay;
      else if (field === 'cutoffTime') input.batch_cutoff_time = draft.cutoffTime;
      else input.batch_fulfillment_days = draft.days;
    }
    if (draft.slotPay !== baseline.slotPay) input.scheduling_require_prepayment = draft.slotPay;
    if (draft.batchPay !== baseline.batchPay) input.batch_require_prepayment = draft.batchPay;
    lock.current = true; setSaving(true); setSaved(false); setSaveError(false);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    try { const response = await updateRestaurantSettings(rid, input), next = draftFrom(response); if (current()) { setDraft(next); setBaseline(next); setSaved(true); } }
    catch { if (current()) setSaveError(true); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  const dayLabel = (day: number) => DAYS[day] ? t(DAYS[day]) : String(day);
  const formatDate = (raw: string) => {
    const date = /^\d{4}-\d{2}-\d{2}/.exec(raw)?.[0], parsed = date ? new Date(`${date}T12:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return raw;
    // The resolver returns restaurant-local RFC3339 timestamps and calendar dates. Never shift their day through the browser zone.
    const formatted = new Intl.DateTimeFormat(locale, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
    return raw.length > 10 ? `${formatted} · ${raw.slice(11,16)}` : formatted;
  };
  const fieldProps = (id: string) => ({ id, 'aria-invalid': invalid?.id === id || undefined, 'aria-describedby': invalid?.id === id ? 'preorder-validation' : undefined });
  return <SettingsWorkspace title={t('preorderTitle')} description={t('ordersPreordersDesc')} activeId="preorders" navLabel={t('ordersSettingsNavigation')} items={ordersSettingsNavigation(rid, t)}>
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('preorderLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : draft && <form onSubmit={save} noValidate className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <Section title={t('preorderTitle')} desc={t('preorderExplainer')}><div role="group" aria-label={t('preorderTitle')} className="grid gap-3 md:grid-cols-3">{(['off','slots','batch'] as const).map(mode => <ModeCard key={mode} title={t(mode === 'off' ? 'preorderModeOff' : mode === 'slots' ? 'preorderModeSlots' : 'preorderModeBatch')} desc={t(mode === 'off' ? 'preorderModeOffDesc' : mode === 'slots' ? 'preorderModeSlotsDesc' : 'preorderModeBatchDesc')} selected={draft.mode === mode} onClick={() => patch({ mode })} disabled={!canEdit || saving} />)}</div><p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">{t('preorderRetainedSettings')}</p></Section>
      <details open={draft.mode === 'slots' || invalid?.group === 'slots'} className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5">
        <summary className="cursor-pointer py-1 text-base font-semibold">{t('preorderModeSlots')}</summary>
        <div className="mt-5 space-y-5">
          <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('preorderPreciseDelayHint')}</p>
          <div className="grid gap-5 md:grid-cols-3">{(['lead','horizon','duration'] as const).map(field => <Field key={field} label={t(field === 'lead' ? 'preorderLeadMinutes' : field === 'horizon' ? 'slotMaxDaysAhead' : 'slotDuration')}><Input {...fieldProps(`preorder-${field}`)} type="number" dir="ltr" value={draft[field]} readOnly={!canEdit || saving} onChange={event => patch({ [field]: event.target.value })} /></Field>)}</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('preorderLeadPresets')}>{[0,360,1440,2880,4320].map(minutes => <Button key={minutes} type="button" variant={draft.lead === String(minutes) ? 'primary' : 'secondary'} aria-pressed={draft.lead === String(minutes)} disabled={!canEdit || saving} onClick={() => patch({ lead: String(minutes) })}>{minutes === 0 ? t('itemPreparationSameDay') : `${minutes / 60} ${t('hours')}`}</Button>)}</div>
          <ServiceToggle label={t('slotRequirePrepayment')} sub={t('slotRequirePrepaymentDesc')} checked={draft.slotPay} onChange={slotPay => patch({ slotPay })} disabled={!canEdit || saving} />
          {draft.slotPay && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('cashPrepaymentNote')}</p>}
        </div>
      </details>
      <details open={draft.mode === 'batch' || invalid?.group === 'batch'} className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5">
        <summary className="cursor-pointer py-1 text-base font-semibold">{t('preorderModeBatch')}</summary>
        <div className="mt-5 space-y-5">
          <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('preorderInheritedOpening')}</p>
          <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('availabilityTimezoneHint')} {timezone ? <bdi>{timezone}</bdi> : t('availabilityTimezoneUnknown')}</p>
          <div className="grid gap-5 md:grid-cols-2">{(['open','cutoff'] as const).map(field => <fieldset key={field} disabled={saving} className="min-w-0 space-y-3 rounded-r-md border border-[var(--line)] p-4"><legend className="px-1 text-sm font-semibold">{t(field === 'open' ? 'batchOrderOpens' : 'batchFulfillmentCutoff')}</legend><Field label={t(field === 'open' ? 'batchOrderOpenDay' : 'batchFulfillmentCutoffDay')}><Select {...fieldProps(`preorder-${field}-day`)} value={draft[`${field}Day`]} disabled={!canEdit || saving} onChange={event => patch({ [`${field}Day`]: Number(event.target.value) })}>{(!Number.isInteger(draft[`${field}Day`]) || draft[`${field}Day`] < 0 || draft[`${field}Day`] > 6) && <option value={draft[`${field}Day`]} disabled>{String(draft[`${field}Day`])}</option>}{DAYS.map((day,index) => <option key={day} value={index}>{t(day)}</option>)}</Select></Field><Field label={t(field === 'open' ? 'batchOrderOpenTime' : 'batchFulfillmentCutoffTime')}><Input {...fieldProps(`preorder-${field}-time`)} type="time" dir="ltr" value={draft[`${field}Time`]} readOnly={!canEdit || saving} onChange={event => patch({ [`${field}Time`]: event.target.value })} /></Field></fieldset>)}</div>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">{t('batchFulfillmentDays')}</h2>{canEdit && <Button id="preorder-add-day" type="button" variant="secondary" disabled={saving || DAYS.every((_,index) => draft.days.some(day => day.day === index))} onClick={() => { const day = [5,4,6,0,1,2,3].find(value => !draft.days.some(day => day.day === value)); if (day !== undefined) patch({ days: [...draft.days, { day, pickup_start: '10:00', pickup_end: '14:00', delivery_start: '14:00', delivery_end: '18:00' }] }); }}><Plus className="size-4" aria-hidden="true" />{t('batchFulfillmentAddDay')}</Button>}</div>
          {!draft.days.length && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('batchFulfillmentNoDays')}</p>}
          <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('preorderOptionalWindows')}</p>
          {draft.days.map((day,index) => <fieldset key={index} disabled={saving} className="min-w-0 space-y-4 rounded-r-md border border-[var(--line)] p-4" aria-label={`${t('batchFulfillmentDays')} · ${index+1}`}><legend className="px-1 text-sm font-semibold">{dayLabel(day.day)}</legend><div className="flex items-end gap-3"><Field label={t('day')} grow><Select {...fieldProps(`preorder-day-${index}`)} value={day.day} disabled={!canEdit || saving} onChange={event => patch({ days: draft.days.map((value,i) => i === index ? { ...value, day: Number(event.target.value) } : value) })}>{(!Number.isInteger(day.day) || day.day < 0 || day.day > 6) && <option value={day.day} disabled>{String(day.day)}</option>}{DAYS.map((label,value) => <option key={label} value={value} disabled={value !== day.day && draft.days.some(day => day.day === value)}>{t(label)}</option>)}</Select></Field>{canEdit && <Button type="button" variant="secondary" aria-label={`${t('remove')} · ${dayLabel(day.day)}`} disabled={saving} onClick={() => patch({ days: draft.days.filter((_,i) => i !== index) })}><Trash2 className="size-4" aria-hidden="true" /></Button>}</div>{(['pickup','delivery'] as const).map(channel => <div key={channel}><h3 className="mb-2 text-sm font-medium">{t(channel === 'pickup' ? 'batchFulfillmentPickupWindow' : 'batchFulfillmentDeliveryWindow')}</h3><div className="grid gap-3 min-[520px]:grid-cols-2">{(['start','end'] as const).map(edge => <Field key={edge} label={t(edge === 'start' ? 'availabilityFrom' : 'availabilityUntil')}><Input {...fieldProps(`preorder-${index}-${channel}-${edge}`)} type="time" dir="ltr" aria-label={`${dayLabel(day.day)} · ${t(channel)} · ${t(edge === 'start' ? 'availabilityFrom' : 'availabilityUntil')}`} value={day[`${channel}_${edge}`] ?? ''} readOnly={!canEdit || saving} onChange={event => patch({ days: draft.days.map((value,i) => i === index ? { ...value, [`${channel}_${edge}`]: event.target.value } : value) })} /></Field>)}</div></div>)}</fieldset>)}
          <ServiceToggle label={t('batchFulfillmentRequirePrepayment')} sub={t('batchFulfillmentRequirePrepaymentSubtitle')} checked={draft.batchPay} onChange={batchPay => patch({ batchPay })} disabled={!canEdit || saving} />{draft.batchPay && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('cashPrepaymentNote')}</p>}
          <section aria-label={t('batchPreviewTitle')} className="rounded-r-lg bg-[var(--summary-bg)] p-4 text-[var(--summary-fg)]"><h2 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="size-5 shrink-0" aria-hidden="true" />{t('batchPreviewTitle')}</h2><p className="mt-2 text-sm leading-6">{t('preorderPreviewHint')}</p>{preview.status === 'loading' ? <p role="status" className="mt-4 text-sm">{t('loading')}</p> : preview.status === 'error' ? <div role="alert" className="mt-4 space-y-3"><p className="text-sm">{t('preorderPreviewFailed')}</p><Button type="button" variant="secondary" onClick={() => setPreviewRetry(value => value+1)}>{t('retry')}</Button></div> : preview.status === 'idle' ? <p className="mt-4 text-sm">{t('preorderPreviewIncomplete')}</p> : !preview.cycles.length ? <p className="mt-4 text-sm">{t('preorderPreviewEmpty')}</p> : <ol className="mt-4 space-y-3">{preview.cycles.map((cycle,index) => <li key={index} className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-4 text-[var(--fg)]"><p className="text-xs font-semibold text-[var(--fg-muted)]">{t('batchPreviewOrdering')} · {index+1}</p><p className="mt-1 text-sm leading-6"><bdi>{formatDate(cycle.open_at)}</bdi> — <bdi>{formatDate(cycle.cutoff_at)}</bdi></p><p className="mt-3 text-xs font-semibold text-[var(--fg-muted)]">{t('batchPreviewDelivery')}</p><ul className="mt-1 space-y-1">{cycle.fulfillment_days.map((value, i) => <li key={i} className="text-sm leading-6"><bdi>{formatDate(value.date)}</bdi></li>)}</ul></li>)}</ol>}</section>
        </div>
      </details>
      <Section title={t('productExceptionsTitle')} desc={t('productExceptionsDesc')}><Link href={`/${rid}/menu`} className="inline-flex min-h-10 items-center text-sm font-semibold text-[var(--brand-ink)]">{t('manageProducts')}</Link><p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">{t('preorderHoursHint')}</p><Link href={`/${rid}/settings/orders/availability`} className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-[var(--brand-ink)]">{t('ordersAvailabilityTitle')}</Link></Section>
      {invalid && <p id="preorder-validation" role="alert" className="text-sm text-[var(--danger-500)]">{t(invalid.key)}</p>}
      {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('processingSaveFailed')}</p>}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" className="whitespace-normal" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(baseline); setInvalid(null); setSaveError(false); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </SettingsWorkspace>;
}
