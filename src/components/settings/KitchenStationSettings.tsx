'use client';
import {useCallback,useEffect,useState} from 'react';
import {saveKitchenStation,defaultKitchenSettings,type KitchenStationSettings,type KitchenStation} from '@/lib/api';
import {KitchenTablets} from './KitchenTablets';
import {loadKdsConfiguration,type KdsConfiguration} from '@/lib/kds-tablets';
import {useI18n} from '@/lib/i18n';
import {Button,Field,Section,ConfirmDialog} from '@/components/ds';
import {BooleanInput} from '@/components/ds/Selection';

/** Per-device kitchen profiles; completion never changes the restaurant's bills. */
export function KitchenStationSettingsEditor({rid,editable,onDirtyChange,onBusyChange}:{rid:number;editable:boolean;onDirtyChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void}) {
 const {t}=useI18n();
 const [config,setConfig]=useState<KdsConfiguration|null>(null),[stations,setStations]=useState<KitchenStation[]>([]);
 const devices=config?.devices??[],categories=config?.categories??[];
 const refresh=useCallback(async()=>{const next=await loadKdsConfiguration(rid);setConfig(next);setStations(next.stations);},[rid]);
 const [id,setId]=useState(''),[pending,setPending]=useState<string|null>(null),[draft,setDraft]=useState<KitchenStationSettings|null>(null),[base,setBase]=useState<KitchenStationSettings|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0);
 const dirty=JSON.stringify(draft)!==JSON.stringify(base);
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 useEffect(()=>{onBusyChange?.(saving);return()=>onBusyChange?.(false);},[saving,onBusyChange]);
 useEffect(()=>{let active=true;setLoading(true);loadKdsConfiguration(rid).then(next=>{if(active){setConfig(next);setStations(next.stations);setError('');}}).catch(()=>{if(active)setError(t('tableSettingsLoadFailed'));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[rid,retry,t]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty||saving){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty,saving]);
 function select(value:string){setId(value);setError('');if(!value){setDraft(null);setBase(null);return;}const config=stations.find(s=>s.device_id===value)?.settings??defaultKitchenSettings;setDraft({...config});setBase(stations.some(s=>s.device_id===value)?{...config}:null);}
 function patch(value:Partial<KitchenStationSettings>){if(editable&&!saving)setDraft(d=>d?{...d,...value}:d);}
 async function save(){if(!draft||!id||!editable||saving)return;if(![draft.yellow_minutes,draft.red_minutes].every(Number.isInteger)||draft.yellow_minutes<1||draft.red_minutes<=draft.yellow_minutes||draft.red_minutes>240){setError(t('kdsInvalidTimers'));return;}if(!Number.isInteger(draft.columns)||draft.columns<4||draft.columns>10||!draft.order_types.length||!Number.isInteger(draft.pickup_lead_minutes??0)||(draft.pickup_lead_minutes??0)<0||(draft.pickup_lead_minutes??0)>240){setError(t('fullServiceInvalid'));return;}setSaving(true);setError('');try{const saved=await saveKitchenStation(rid,id,draft);const row={...saved,name:devices.find(d=>d.id===id)?.display_name||devices.find(d=>d.id===id)?.system_name};setStations(all=>[...all.filter(s=>s.device_id!==id),row]);setDraft(row.settings);setBase(row.settings);}catch{setError(t('tableSettingsSaveFailed'));}finally{setSaving(false);}}
 const input='w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3';
 return <><Section title={t('kdsStations')}>
  {loading?<p role="status">{t('loading')}</p>:<div className="space-y-5">
   <Field label={t('kdsDevice')}><select className={input} value={id} disabled={saving} onChange={e=>dirty?setPending(e.target.value):select(e.target.value)}><option value="">{t('kdsChooseStation')}</option>{devices.map(d=><option key={d.id} value={d.id}>{d.display_name||d.system_name}</option>)}</select></Field>
   {!devices.length&&<p>{t('kdsNoDevices')}</p>}
   {draft&&<fieldset disabled={!editable||saving} className="space-y-5">
    <div className="grid gap-4 md:grid-cols-2">{([
     ['layout','kdsLayout',[['auto','kdsAdaptive'],['flex','kdsFlex'],['tiles','kdsTiles'],['one','kdsOneRail'],['two','kdsTwoRails'],['three','kdsThreeRails']]],['role','kdsRole',[['prep','kdsPrep'],['expo','kdsExpo']]],['completion_scope','kdsScope',[['all','kdsAllDevices'],['device','kdsThisDevice']]],['text_size','kdsTextSize',[['small','kdsSmall'],['medium','kdsMedium'],['large','kdsLarge']]],['sort_items','kdsSort',[['entry','fullServiceSortEntry'],['seat','fullServiceSortSeat'],['alpha','kdsAlpha']]],
    ] as const).map(([key,label,options])=><Field key={key} label={t(label)}><select className={input} value={draft[key]??'auto'} onChange={e=>patch({[key]:e.target.value})}>{options.map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></Field>)}</div>
    <div className="grid gap-4 md:grid-cols-3">{([['columns','kdsColumns',4,10],['yellow_minutes','kdsYellow',1,239],['red_minutes','kdsRed',2,240]] as const).map(([key,label,min,max])=><Field key={key} label={t(label)}><input className={input} type="number" min={min} max={max} value={draft[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></Field>)}</div>
    {([['sound_on_arrival','kdsArrivalSound'],['show_held','fullServiceKdsHeld'],['separate_held_counts','kdsHeldCounts'],['show_pos','kdsPosOrders'],['show_online','kdsOnlineOrders']] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-5 border-b border-[var(--line)] py-3"><span>{t(label)}</span><BooleanInput checked={draft[key]??false} onChange={e=>patch({[key]:e.target.checked})}/></label>)}
    {draft.sound_on_arrival&&<Field label={t('kdsSoundVolume')}><input type="range" min={0} max={100} step={1} value={draft.sound_volume??75} onChange={e=>patch({sound_volume:Number(e.target.value)})}/> {draft.sound_volume??75}%</Field>}
    {draft.show_pos&&<Field label={t('kdsRegisterFilter')}><div className="grid gap-3 md:grid-cols-2">{devices.filter(d=>['tablet','phone','computer'].includes(d.kind)).map(d=><label key={d.id} className="flex items-center gap-2"><input type="checkbox" checked={(draft.register_ids??[]).includes(d.id)} onChange={e=>{const ids=draft.register_ids??[];patch({register_ids:e.target.checked?[...ids,d.id]:ids.filter(v=>v!==d.id)});}}/>{d.display_name||d.system_name}</label>)}</div></Field>}
    {draft.show_online&&<Field label={t('kdsOnlineTiming')}><select className={input} value={draft.online_timing||'fired'} onChange={e=>patch({online_timing:e.target.value as KitchenStationSettings['online_timing']})}>{([['fired','kdsWhenFired'],['placed','kdsWhenPlaced'],['pickup','kdsWhenPickup']] as const).map(([v,label])=><option key={v} value={v}>{t(label)}</option>)}</select></Field>}
    {draft.show_online&&draft.online_timing==='pickup'&&<Field label={t('kdsPickupLead')}><input className={input} type="number" min={0} max={240} value={draft.pickup_lead_minutes??0} onChange={e=>patch({pickup_lead_minutes:Number(e.target.value)})}/></Field>}
    <Field label={t('kdsDiningOptions')}><div className="flex flex-wrap gap-5">{['dine_in','pickup','delivery'].map(value=><label key={value} className="flex items-center gap-2"><input type="checkbox" checked={draft.order_types.includes(value)} onChange={e=>patch({order_types:e.target.checked?[...draft.order_types,value]:draft.order_types.filter(v=>v!==value)})}/>{t(value==='dine_in'?'dineIn':value)}</label>)}</div></Field>
    <Field label={t('kdsCategories')}><div className="grid gap-3 md:grid-cols-2">{categories.map(c=><label key={c.id} className="flex items-center gap-2"><input type="checkbox" checked={(draft.category_ids??[]).includes(c.id)} onChange={e=>patch({category_ids:e.target.checked?[...draft.category_ids,c.id]:(draft.category_ids??[]).filter(v=>v!==c.id)})}/>{c.name}</label>)}</div></Field>
    <Button type="button" disabled={!dirty||saving} onClick={save}>{t(saving?'saving':'saveChanges')}</Button>
   </fieldset>}
  </div>}
  {error&&<div role="alert"><p>{error}</p>{!draft&&<Button onClick={()=>setRetry(x=>x+1)}>{t('retry')}</Button>}</div>}
  <ConfirmDialog open={pending!==null} onOpenChange={open=>{if(!open)setPending(null);}} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{const value=pending;setPending(null);if(value!==null)select(value);}}/>
 </Section>{config&&<KitchenTablets rid={rid} config={{...config,stations}} editable={editable && config.manager} refresh={refresh}/>}</>;
}
