'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, getRestaurantSettings, updateRestaurantSettings, type DeliverySameDayPolicy, type DeliveryZone, type RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, Input, Section, Select } from '@/components/ds';

function policyFrom(settings: RestaurantSettings, rid: number): DeliverySameDayPolicy {
  const policy = settings.delivery_same_day_policy;
  if (settings.restaurant_id !== rid || !settings.ordering_settings_merge_supported || !policy || !Array.isArray(policy.allowed_days) || !Array.isArray(policy.restricted_days) || !Array.isArray(policy.coverage_zone_ids) || !Number.isInteger(policy.transit_minutes) || typeof policy.enabled !== 'boolean' || !['inherit','restaurant'].includes(policy.time_mode)) throw new Error('Same-day policy unavailable');
  return policy;
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const toggle = (values: number[], value: number) => values.includes(value) ? values.filter(day => day !== value) : [...values,value].sort((a,b)=>a-b);

/** Configure one optional same-day policy without copying calendars or tariffs. */
export function SameDayDeliverySettings({ rid, zones, zonesLoaded }: { rid: number; zones: DeliveryZone[]; zonesLoaded: boolean }) {
  const { t } = useI18n(), { hasAnyPermission } = usePermissions();
  const canRead = hasAnyPermission('settings.view','settings.edit'), canEdit = hasAnyPermission('settings.edit') && hasAnyPermission('orders.manage');
  const [draft,setDraft] = useState<DeliverySameDayPolicy|null>(null), [base,setBase] = useState<DeliverySameDayPolicy|null>(null);
  const [busy,setBusy] = useState(false), [error,setError] = useState<string|null>(null), [saved,setSaved] = useState(false), [uncertain,setUncertain] = useState(false), [reload,setReload] = useState(false);
  const [transit,setTransit] = useState('0');
  const alive = useRef(true), lock = useRef(false);
  const dirty = !!draft && !!base && (!equal(draft,base) || transit !== String(base.transit_minutes));
  const frozen = busy || uncertain;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(!dirty&&!uncertain)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty,uncertain]);
  const load = useCallback(async()=>{
    if(!canRead||lock.current)return;lock.current=true;setBusy(true);setError(null);
    try { const current=policyFrom(await getRestaurantSettings(rid),rid);if(alive.current){setDraft(current);setBase(current);setTransit(String(current.transit_minutes));setUncertain(false);setSaved(false);} }
    catch {if(alive.current)setError('sameDayLoadError');}
    finally {lock.current=false;if(alive.current)setBusy(false);}
  },[rid,canRead]);
  useEffect(()=>{void load();},[load]);
  const patch = (value:Partial<DeliverySameDayPolicy>)=>{if(!canEdit||frozen)return;setDraft(current=>current?{...current,...value}:current);setSaved(false);setError(null);};
  const save = async()=>{
    if(!draft||!base||!canEdit||!dirty||lock.current||uncertain||!zonesLoaded)return;
    const minutes=Number(transit);
    if(!/^\d+$/.test(transit)||!Number.isSafeInteger(minutes)||minutes<0||minutes>1440||draft.enabled&&(!draft.allowed_days.length||!zones.some(zone=>zone.is_active)||draft.restricted_days.length>0&&!draft.coverage_zone_ids.length)){setError('sameDayInvalid');return;}
    const next={...draft,transit_minutes:minutes};lock.current=true;setBusy(true);setSaved(false);setError(null);
    try{const current=policyFrom(await updateRestaurantSettings(rid,{delivery_same_day_policy:next,delivery_same_day_policy_base:base}),rid);if(alive.current){setBase(current);setDraft(current);setTransit(String(current.transit_minutes));setSaved(true);}}
    catch(reason){if(alive.current){const known=reason instanceof ApiError&&[400,409,422].includes(reason.status);setUncertain(!known);setError(reason instanceof ApiError&&reason.status===409?'orderingSettingsConflict':known?'sameDayInvalid':'sameDayUncertain');}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  const verify = async()=>{
    if(lock.current||!draft)return;lock.current=true;setBusy(true);
    try{const current=policyFrom(await getRestaurantSettings(rid),rid);if(alive.current){setUncertain(false);if(equal(current,{...draft,transit_minutes:Number(transit)})){setBase(current);setDraft(current);setTransit(String(current.transit_minutes));setSaved(true);setError(null);}else setError('orderingSettingsConflict');}}
    catch{if(alive.current)setError('sameDayLoadError');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  if(!canRead)return null;
  return <Section role="region" aria-label={t('sameDayTitle')} title={t('sameDayTitle')} desc={t('sameDayDescription')}><div className="space-y-5">
    <p className="text-fs-sm text-[var(--fg-muted)]">{t('deliverySettingsPriority')} <Link className="underline" href={`/${rid}/settings/orders`}>{t('ordersAvailabilityTitle')}</Link></p>
    {draft&&<fieldset disabled={!canEdit||frozen||!zonesLoaded} className="space-y-5">
      <label className="flex items-center gap-3"><input type="checkbox" checked={draft.enabled} onChange={event=>patch({enabled:event.target.checked})}/><span>{t('sameDayEnable')}</span></label>
      {draft.enabled && <>
      <div className="grid gap-5 md:grid-cols-2"><Field label={t('sameDayAllowedDays')}><div className="flex flex-wrap gap-3">{[1,2,3,4,5,6,0].map(day=><label key={day} className="flex items-center gap-2"><input type="checkbox" checked={draft.allowed_days.includes(day)} onChange={()=>{const days=toggle(draft.allowed_days,day);patch({allowed_days:days,restricted_days:draft.restricted_days.filter(value=>days.includes(value))});}}/>{t(`weekday_${day}`)}</label>)}</div></Field>
      <Field label={t('sameDayRestrictedDays')}><div className="flex flex-wrap gap-3">{draft.allowed_days.map(day=><label key={day} className="flex items-center gap-2"><input type="checkbox" checked={draft.restricted_days.includes(day)} onChange={()=>patch({restricted_days:toggle(draft.restricted_days,day)})}/>{t(`weekday_${day}`)}</label>)}</div></Field></div>
      {draft.restricted_days.length>0&&<Field label={t('sameDayCoverage')}><p className="mb-2 text-fs-sm text-[var(--fg-muted)]">{t('sameDayCoverageHint')}</p><div className="space-y-2">{zones.filter(zone=>zone.is_active||draft.coverage_zone_ids.includes(zone.id)).map(zone=><label key={zone.id} className="flex items-start gap-3"><input type="checkbox" className="mt-1" disabled={!zone.is_active} checked={draft.coverage_zone_ids.includes(zone.id)} onChange={()=>patch({coverage_zone_ids:toggle(draft.coverage_zone_ids,zone.id)})}/><span><span dir="auto">{zone.name}</span>{!zone.schedule&&<span className="block text-fs-xs text-[var(--fg-muted)]">{t('zoneCalendarInherited')}</span>}</span></label>)}</div></Field>}
      <div className="grid gap-4 md:grid-cols-2"><Field label={t('sameDayTransit')}><Input type="number" min="0" max="1440" step="1" value={transit} onChange={event=>{setTransit(event.target.value);setSaved(false);}}/></Field><Field label={t('sameDayTimeMode')}><Select value={draft.time_mode} onChange={event=>patch({time_mode:event.target.value as DeliverySameDayPolicy['time_mode']})}><option value="inherit">{t('sameDayTimeInherit')}</option><option value="restaurant">{t('sameDayTimeRestaurant')}</option></Select></Field></div>
      <p className="text-fs-sm text-[var(--fg-muted)]">{t('sameDayEstimateHint')}</p>
      </>}
    </fieldset>}
    {!canEdit&&draft&&<p className="text-fs-sm">{t('sameDayPermissions')}</p>}
    {error&&<p role="alert" className="text-fs-sm text-[var(--danger-500)]">{t(error)}</p>}
    {saved&&<p role="status" className="text-fs-sm text-[var(--success-500)]">{t('saved')}</p>}
    <div className="flex flex-wrap gap-3">{canEdit&&draft&&<Button variant="primary" size="sm" disabled={frozen||!dirty||!zonesLoaded} onClick={()=>void save()}>{t(busy?'saving':'save')}</Button>}{uncertain?<Button variant="secondary" size="sm" disabled={busy} onClick={()=>void verify()}>{t('deliveryVerifySaved')}</Button>:<Button variant="secondary" size="sm" disabled={busy} onClick={()=>dirty?setReload(true):void load()}>{t('refresh')}</Button>}</div>
  </div><ConfirmDialog open={reload} onOpenChange={setReload} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{setReload(false);void load();}}/></Section>;
}
