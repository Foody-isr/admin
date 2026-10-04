'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { parsePrice } from '@/lib/delivery-pricing';
import { Button, ConfirmDialog, Field, Input, Section } from '@/components/ds';

function minimumValue(settings: RestaurantSettings, rid: number) {
  if (!settings || settings.restaurant_id !== rid || typeof settings.minimum_order_delivery !== 'number' || !Number.isFinite(settings.minimum_order_delivery)) throw new Error('Invalid delivery minimum');
  return settings.minimum_order_delivery;
}
/** Edit only the restaurant-wide minimum, independently of zone-management permissions. */
export function DeliveryMinimum({ rid }: { rid: number }) {
  const { t } = useI18n(), { money } = useCurrency(), { hasAnyPermission } = usePermissions();
  const canRead = hasAnyPermission('settings.view','settings.edit'), canEdit = hasAnyPermission('settings.edit');
  const [value,setValue] = useState(''), [saved,setSaved] = useState<number|null>(null), [loading,setLoading] = useState(false), [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null), [notice,setNotice] = useState(false), [pending,setPending] = useState<number|null>(null), [serverValue,setServerValue] = useState<number|null>(null), [adopt,setAdopt] = useState(false);
  const alive = useRef(true), sequence = useRef(0), lock = useRef(false);
  const dirty = saved !== null && value !== String(saved), frozen = busy || pending !== null;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const load = useCallback(async()=>{if(!canRead || lock.current)return;const generation=++sequence.current;setLoading(true);setError(null);try{const current=minimumValue(await getRestaurantSettings(rid),rid);if(alive.current&&generation===sequence.current){setSaved(current);setValue(String(current));}}catch{if(alive.current&&generation===sequence.current)setError('deliveryMinimumLoadError');}finally{if(alive.current&&generation===sequence.current)setLoading(false);}},[rid,canRead]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!dirty&&!frozen)return;const guard=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty,frozen]);
  const save = async()=>{
    if(!canEdit||lock.current||pending!==null||!dirty)return;
    const number=parsePrice(value);if(number==null){setError('deliveryMinimumInvalid');return;}
    lock.current=true;sequence.current++;setBusy(true);setError(null);setNotice(false);setServerValue(null);
    try{const current=minimumValue(await updateRestaurantSettings(rid,{minimum_order_delivery:number}),rid);if(current!==number)throw new Error('Unexpected minimum');if(alive.current){setSaved(current);setValue(String(current));setNotice(true);}}
    catch{if(alive.current){setPending(number);setError('deliveryMinimumUncertain');}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  const verify = async()=>{
    if(lock.current||pending===null)return;lock.current=true;setBusy(true);setError(null);
    try{const current=minimumValue(await getRestaurantSettings(rid),rid);if(!alive.current)return;setPending(null);if(current===pending){setSaved(current);setValue(String(current));setNotice(true);}else{setServerValue(current);setError('deliveryMinimumDiffers');}}
    catch{if(alive.current)setError('deliveryMinimumReadbackError');}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  if(!canRead)return null;
  return <Section title={t('defaultMinOrder')} desc={t('defaultMinOrderHint')}><div className="space-y-4">{loading ? <p role="status">{t('loading')}</p> : saved!==null && <div className="flex flex-wrap items-end gap-3"><Field label={t('defaultMinOrder')}><Input type="text" inputMode="decimal" value={value} dir="ltr" disabled={!canEdit||frozen} className="w-40" onChange={event=>{setValue(event.target.value);setNotice(false);setError(null);}} /></Field>{canEdit&&<><Button variant="primary" size="md" disabled={frozen||!dirty} onClick={()=>void save()}>{t(busy?'saving':'save')}</Button>{dirty&&<Button variant="ghost" size="md" disabled={frozen} onClick={()=>setAdopt(true)}>{t('cancel')}</Button>}</>}</div>}{error&&<p role="alert" className="text-fs-sm text-[var(--danger-500)]">{t(error)}</p>}{saved===null&&error&&<Button variant="secondary" size="sm" disabled={loading} onClick={()=>void load()}>{t('retry')}</Button>}{pending!==null&&<Button variant="secondary" size="sm" disabled={busy} onClick={()=>void verify()}>{t('deliveryVerifySaved')}</Button>}{serverValue!==null&&<div className="space-y-3"><p className="text-fs-sm">{t('deliveryMinimumSavedValue')} <bdi className="font-semibold">{money(serverValue)}</bdi></p><Button variant="secondary" size="sm" disabled={!canEdit||frozen} onClick={()=>setAdopt(true)}>{t('deliveryUseSaved')}</Button></div>}{notice&&<p role="status" className="text-fs-sm text-[var(--success-500)]">{t('saved')}</p>}</div><ConfirmDialog open={adopt} onOpenChange={setAdopt} title={t('discardUnsavedChanges')} description={t('discountDiscardHint')} confirmLabel={t('deliveryUseSaved')} cancelLabel={t('cancel')} onConfirm={()=>{if(frozen)return;const current=serverValue??saved;if(current!==null){setValue(String(current));setSaved(current);}setServerValue(null);setError(null);setAdopt(false);}} /></Section>;
}
