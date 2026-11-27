'use client';
import {useCallback,useEffect,useState} from 'react';
import {saveKitchenStation,defaultKitchenSettings,type KitchenStationSettings,type KitchenStation,type KitchenSelection} from '@/lib/api';
import {KitchenTablets} from './KitchenTablets';
import {loadKdsConfiguration,type KdsConfiguration} from '@/lib/kds-tablets';
import {useI18n} from '@/lib/i18n';
import {Button,Field,Section,ConfirmDialog} from '@/components/ds';
import {BooleanInput} from '@/components/ds/Selection';

function RoutingChoices<T extends string | number>({label, futureLabel, choices, rule, update}: {
  label: string;
  futureLabel: string;
  choices: {id: T; name: string}[];
  rule: KitchenSelection<T>;
  update: (rule: KitchenSelection<T>) => void;
}) {
  const {t} = useI18n();
  const exceptions = rule.exceptions ?? [];
  const includes = (id: T) => rule.include_future !== exceptions.includes(id);
  const known = Array.from(new Set([...choices.map(c => c.id), ...exceptions]));
  function setListed(enabled: boolean) {
    const listed = new Set(choices.map(c => c.id));
    update({...rule, exceptions: known.filter(id => (listed.has(id) ? enabled : includes(id)) !== rule.include_future)});
  }
  return <fieldset className="space-y-3">
    <legend className="font-semibold">{label}</legend>
    <label className="flex items-center justify-between gap-4">{futureLabel}
      <BooleanInput checked={rule.include_future} onChange={e => update({include_future: e.target.checked, exceptions: known.filter(id => includes(id) !== e.target.checked)})}/>
    </label>
    <div className="flex gap-3">
      <Button type="button" onClick={() => setListed(true)}>{t('selectAll')}</Button>
      <Button type="button" onClick={() => setListed(false)}>{t('deselectAll')}</Button>
    </div>
    <div className="grid gap-3 md:grid-cols-2">{choices.map(c => <label key={c.id} className="flex items-center gap-2">
      <input type="checkbox" checked={includes(c.id)} onChange={e => update({...rule, exceptions: [...exceptions.filter(id => id !== c.id), ...(e.target.checked === rule.include_future ? [] : [c.id])]})}/>{c.name}
    </label>)}</div>
  </fieldset>;
}

function KitchenListOrder({label, choices, order, update}:{
  label:string; choices: {id:number;name:string}[]; order:number[]; update:(next:number[])=>void;
}) {
  const {t}=useI18n();
  const names=new Map(choices.map(c=>[c.id,c.name]));
  const ids=Array.from(new Set([...order.filter(id=>names.has(id)),...Array.from(names.keys())]));
  function move(index:number,step:number) {
    const next=[...ids];
    next.splice(index+step,0,next.splice(index,1)[0]);
    update(next);
  }
  return <fieldset className="space-y-2"><legend className="font-semibold">{label}</legend>
    {ids.map((id,i)=><div key={id} className="flex items-center justify-between">
      <span>{names.get(id)}</span><span className="flex gap-2">
        <Button type="button" disabled={i===0} onClick={()=>move(i,-1)} aria-label={t('kdsMoveUp')}>↑</Button>
        <Button type="button" disabled={i+1===ids.length} onClick={()=>move(i,1)} aria-label={t('kdsMoveDown')}>↓</Button>
      </span></div>)}</fieldset>;
}

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
 const methods = config?.dining_options ?? ['dine_in','pickup','delivery'].map(id => ({id, name:'', order_type:id}));
 const allDining = draft?.order_types.length === 3;
 const diningChoices = methods.map(m => ({id:m.id, name:m.name || t(m.id==='dine_in'?'dineIn':m.id==='delivery'?'delivery':m.id==='collect'?'kdsCollect':'pickup')}));
 const input='w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3';
 return <><Section title={t('kdsStations')}>
  {loading?<p role="status">{t('loading')}</p>:<div className="space-y-5">
   <Field label={t('kdsDevice')}><select className={input} value={id} disabled={saving} onChange={e=>dirty?setPending(e.target.value):select(e.target.value)}><option value="">{t('kdsChooseStation')}</option>{devices.map(d=><option key={d.id} value={d.id}>{d.display_name||d.system_name}</option>)}</select></Field>
   {!devices.length&&<p>{t('kdsNoDevices')}</p>}
   {draft&&<fieldset disabled={!editable||saving} className="space-y-5">
    <div className="grid gap-4 md:grid-cols-2">{([
     ['layout','kdsLayout',[['auto','kdsAdaptive'],['flex','kdsFlex'],['tiles','kdsTiles'],['one','kdsOneRail'],['two','kdsTwoRails'],['three','kdsThreeRails']]],['role','kdsRole',[['prep','kdsPrep'],['expo','kdsExpo']]],['completion_scope','kdsScope',[['all','kdsAllDevices'],['device','kdsThisDevice']]],['text_size','kdsTextSize',[['small','kdsSmall'],['medium','kdsMedium'],['large','kdsLarge']]],['sort_items','kdsSort',[['entry','fullServiceSortEntry'],['seat','fullServiceSortSeat'],['alpha','kdsAlpha'],['category','kdsCategorySort'],['custom_category','kdsCustomCategorySort']]],
    ] as const).map(([key,label,options])=><Field key={key} label={t(label)}><select className={input} value={draft[key]??'auto'} onChange={e=>patch({[key]:e.target.value})}>{options.map(([v,l])=><option key={v} value={v}>{t(l)}</option>)}</select></Field>)}</div>
    <div className="grid gap-4 md:grid-cols-3">{([['columns','kdsColumns',4,10],['yellow_minutes','kdsYellow',1,239],['red_minutes','kdsRed',2,240]] as const).map(([key,label,min,max])=><Field key={key} label={t(label)}><input className={input} type="number" min={min} max={max} value={draft[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></Field>)}</div>
    {([['sound_on_arrival','kdsArrivalSound'],['show_drafts','kdsDraftStation'],['stagger_prep','kdsStaggerPrep'],['show_held','fullServiceKdsHeld'],['separate_held_counts','kdsHeldCounts'],['show_pos','kdsPosOrders'],['show_online','kdsOnlineOrders']] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-5 border-b border-[var(--line)] py-3"><span>{t(label)}</span><BooleanInput checked={draft[key]??false} onChange={e=>patch({[key]:e.target.checked})}/></label>)}
    {draft.sort_items==='custom_category'&&<KitchenListOrder label={t('kdsCustomCategorySort')} choices={[...categories,{id:0,name:t('uncategorized')}]} order={draft.category_order??[]} update={next=>patch({category_order:next})}/>}
    {(config?.modifier_sets?.length??0)>1&&<details><summary>{t('kdsModifierOrder')}</summary><KitchenListOrder label={t('kdsModifierOrder')} choices={config!.modifier_sets!} order={draft.modifier_order??[]} update={next=>patch({modifier_order:next})}/></details>}
    {draft.sound_on_arrival&&<Field label={t('kdsSoundVolume')}><input type="range" min={0} max={100} step={1} value={draft.sound_volume??75} onChange={e=>patch({sound_volume:Number(e.target.value)})}/> {draft.sound_volume??75}%</Field>}
    {draft.show_pos&&<RoutingChoices label={t('kdsRegisterFilter')} futureLabel={t('kdsFutureRegisters')} choices={devices.filter(d=>['tablet','phone','computer'].includes(d.kind)).map(d=>({id:d.id,name:d.display_name||d.system_name}))} rule={draft.register_filter??{include_future:!draft.register_ids?.length,exceptions:draft.register_ids??[]}} update={rule=>patch({register_filter:rule,register_ids:[]})}/>}
    {draft.show_online&&<Field label={t('kdsOnlineTiming')}><select className={input} value={draft.online_timing||'fired'} onChange={e=>patch({online_timing:e.target.value as KitchenStationSettings['online_timing']})}>{([['fired','kdsWhenFired'],['placed','kdsWhenPlaced'],['pickup','kdsWhenPickup']] as const).map(([v,label])=><option key={v} value={v}>{t(label)}</option>)}</select></Field>}
    {draft.show_online&&draft.online_timing==='pickup'&&<Field label={t('kdsPickupLead')}><input className={input} type="number" min={0} max={240} value={draft.pickup_lead_minutes??0} onChange={e=>patch({pickup_lead_minutes:Number(e.target.value)})}/></Field>}
    <RoutingChoices label={t('kdsDiningOptions')} futureLabel={t('kdsFutureDining')} choices={diningChoices} rule={draft.dining_filter??{include_future:allDining,exceptions:methods.filter(m=>draft.order_types.includes(m.order_type)!==allDining).map(m=>m.id)}} update={rule=>patch({dining_filter:rule})}/>
    <RoutingChoices label={t('kdsCategories')} futureLabel={t('kdsFutureCategories')} choices={[...categories,{id:0,name:t('uncategorized')}]} rule={draft.category_filter??{include_future:!draft.category_ids?.length,exceptions:draft.category_ids??[]}} update={rule=>patch({category_filter:rule,category_ids:[]})}/>
    <Button type="button" disabled={!dirty||saving} onClick={save}>{t(saving?'saving':'saveChanges')}</Button>
   </fieldset>}
  </div>}
  {error&&<div role="alert"><p>{error}</p>{!draft&&<Button onClick={()=>setRetry(x=>x+1)}>{t('retry')}</Button>}</div>}
  <ConfirmDialog open={pending!==null} onOpenChange={open=>{if(!open)setPending(null);}} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{const value=pending;setPending(null);if(value!==null)select(value);}}/>
 </Section>{config&&<KitchenTablets rid={rid} config={{...config,stations}} editable={editable && config.manager} refresh={refresh}/>}</>;
}
