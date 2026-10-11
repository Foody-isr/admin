'use client';
import {useEffect,useState} from 'react';
import {listDevices,listKitchenStations,saveKitchenStation,getAllCategories,defaultKitchenSettings,type KitchenStationSettings,type KitchenStation,type RestaurantDevice,type MenuCategory} from '@/lib/api';
import {useI18n} from '@/lib/i18n';
import {Button,Field,Section,ConfirmDialog} from '@/components/ds';
import {BooleanInput} from '@/components/ds/Selection';

/** Per-device kitchen profiles; completion never changes the restaurant's bills. */
export function KitchenStationSettingsEditor({rid,editable,onDirtyChange,onBusyChange}:{rid:number;editable:boolean;onDirtyChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void}) {
 const {t}=useI18n();
 const [devices,setDevices]=useState<RestaurantDevice[]>([]),[stations,setStations]=useState<KitchenStation[]>([]),[categories,setCategories]=useState<MenuCategory[]>([]);
 const [id,setId]=useState(''),[pending,setPending]=useState<string|null>(null),[draft,setDraft]=useState<KitchenStationSettings|null>(null),[base,setBase]=useState<KitchenStationSettings|null>(null);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[retry,setRetry]=useState(0);
 const dirty=JSON.stringify(draft)!==JSON.stringify(base);
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 useEffect(()=>{onBusyChange?.(saving);return()=>onBusyChange?.(false);},[saving,onBusyChange]);
 useEffect(()=>{let active=true;setLoading(true);Promise.all([listDevices(rid),listKitchenStations(rid),getAllCategories(rid)]).then(([d,s,c])=>{if(active){setDevices(d.filter(x=>['tablet','phone','computer','display'].includes(x.kind)));setStations(s);setCategories(c);setError('');}}).catch(()=>{if(active)setError(t('tableSettingsLoadFailed'));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[rid,retry,t]);
 useEffect(()=>{const guard=(e:BeforeUnloadEvent)=>{if(dirty||saving){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[dirty,saving]);
 function select(value:string){setId(value);setError('');if(!value){setDraft(null);setBase(null);return;}const config=stations.find(s=>s.device_id===value)?.settings??defaultKitchenSettings;setDraft({...config});setBase(stations.some(s=>s.device_id===value)?{...config}:null);}
 function patch(value:Partial<KitchenStationSettings>){if(editable&&!saving)setDraft(d=>d?{...d,...value}:d);}
 async function save(){if(!draft||!id||!editable||saving)return;if(![draft.yellow_minutes,draft.red_minutes].every(Number.isInteger)||draft.yellow_minutes<1||draft.red_minutes<=draft.yellow_minutes||draft.red_minutes>240){setError(t('kdsInvalidTimers'));return;}if(!Number.isInteger(draft.columns)||draft.columns<4||draft.columns>10||!draft.order_types.length){setError(t('fullServiceInvalid'));return;}setSaving(true);setError('');try{const row=await saveKitchenStation(rid,id,draft);setStations(all=>[...all.filter(s=>s.device_id!==id),row]);setDraft(row.settings);setBase(row.settings);}catch{setError(t('tableSettingsSaveFailed'));}finally{setSaving(false);}}
 const input='w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3';
 return <Section title={t('kdsStations')}>
  {loading?<p role="status">{t('loading')}</p>:<div className="space-y-5">
   <Field label={t('kdsDevice')}><select className={input} value={id} disabled={saving} onChange={e=>dirty?setPending(e.target.value):select(e.target.value)}><option value="">{t('kdsChooseStation')}</option>{devices.map(d=><option key={d.id} value={d.id}>{d.display_name||d.system_name}</option>)}</select></Field>
   {!devices.length&&<p>{t('kdsNoDevices')}</p>}
   {draft&&<fieldset disabled={!editable||saving} className="space-y-5">
    <div className="grid gap-4 md:grid-cols-2">{([
     ['role','kdsRole',[['prep','kdsPrep'],['expo','kdsExpo']]],['completion_scope','kdsScope',[['all','kdsAllDevices'],['device','kdsThisDevice']]],['text_size','kdsTextSize',[['small','kdsSmall'],['medium','kdsMedium'],['large','kdsLarge']]],['sort_items','kdsSort',[['entry','fullServiceSortEntry'],['seat','fullServiceSortSeat'],['alpha','kdsAlpha']]],
    ] as const).map(([key,label,options])=><Field key={key} label={t(label)}><select className={input} value={draft[key]} onChange={e=>patch({[key]:e.target.value})}>{options.map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></Field>)}</div>
    <div className="grid gap-4 md:grid-cols-3">{([['columns','kdsColumns',4,10],['yellow_minutes','kdsYellow',1,239],['red_minutes','kdsRed',2,240]] as const).map(([key,label,min,max])=><Field key={key} label={t(label)}><input className={input} type="number" min={min} max={max} value={draft[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></Field>)}</div>
    {([['show_held','fullServiceKdsHeld'],['separate_held_counts','kdsHeldCounts'],['show_pos','kdsPosOrders'],['show_online','kdsOnlineOrders']] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-5 border-b border-[var(--line)] py-3"><span>{t(label)}</span><BooleanInput checked={draft[key]} onChange={e=>patch({[key]:e.target.checked})}/></label>)}
    <Field label={t('kdsDiningOptions')}><div className="flex flex-wrap gap-5">{['dine_in','pickup','delivery'].map(value=><label key={value} className="flex items-center gap-2"><input type="checkbox" checked={draft.order_types.includes(value)} onChange={e=>patch({order_types:e.target.checked?[...draft.order_types,value]:draft.order_types.filter(v=>v!==value)})}/>{t(value==='dine_in'?'dineIn':value)}</label>)}</div></Field>
    <Field label={t('kdsCategories')}><div className="grid gap-3 md:grid-cols-2">{categories.map(c=><label key={c.id} className="flex items-center gap-2"><input type="checkbox" checked={draft.category_ids.includes(c.id)} onChange={e=>patch({category_ids:e.target.checked?[...draft.category_ids,c.id]:draft.category_ids.filter(v=>v!==c.id)})}/>{c.name}</label>)}</div></Field>
    <Button type="button" disabled={!dirty||saving} onClick={save}>{t(saving?'saving':'saveChanges')}</Button>
   </fieldset>}
  </div>}
  {error&&<div role="alert"><p>{error}</p>{!draft&&<Button onClick={()=>setRetry(x=>x+1)}>{t('retry')}</Button>}</div>}
  <ConfirmDialog open={pending!==null} onOpenChange={open=>{if(!open)setPending(null);}} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{const value=pending;setPending(null);if(value!==null)select(value);}}/>
 </Section>;
}
