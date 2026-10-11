'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getRestaurantSettings, updateRestaurantSettings, type FullServiceSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, Field, PageHead, Section } from '@/components/ds';
import { ConfirmDialog } from '@/components/ds';
import { KitchenStationSettingsEditor } from '@/components/settings/KitchenStationSettings';
import { BooleanInput } from '@/components/ds/Selection';

/** Shared service policy used by the floor plan, order entry and kitchen. */
export default function FullServicePage() {
 const {restaurantId}=useParams();
 return <FullServiceWorkspace key={String(restaurantId)} rid={Number(restaurantId)}/>;
}
function FullServiceWorkspace({rid}:{rid:number}) {
 const {t}=useI18n();
 const router=useRouter();
 const [leaving,setLeaving]=useState<string|null>(null);
 const {hasAnyPermission}=usePermissions();
 const editable=hasAnyPermission('settings.edit');
 const [draft,setDraft]=useState<FullServiceSettings|null>(null);
 const [baseline,setBaseline]=useState<FullServiceSettings|null>(null);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState(false);
 const [reload,setReload]=useState(0);
 const [kitchenDirty,setKitchenDirty]=useState(false),[kitchenSaving,setKitchenSaving]=useState(false);
 const serviceDirty=JSON.stringify(draft)!==JSON.stringify(baseline);
 const dirty=serviceDirty||kitchenDirty;
 useEffect(()=>{let active=true;setError('');getRestaurantSettings(rid).then(settings=>{
  if(!settings.full_service)throw new Error('Missing full-service API');
  if(active){setDraft(settings.full_service);setBaseline(settings.full_service);}
 }).catch(()=>{if(active)setError(t('tableSettingsLoadFailed'));});return()=>{active=false;};},[rid,reload,t]);
 useEffect(()=>{
  const guard=(event:BeforeUnloadEvent)=>{if(dirty||saving||kitchenSaving){event.preventDefault();event.returnValue='';}};
  const navigate=(event:MouseEvent)=>{
   if ((!dirty&&!saving&&!kitchenSaving)||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
   const link=(event.target as Element).closest?.('a[href]');
   if(!(link instanceof HTMLAnchorElement)||link.target==='_blank'||link.hasAttribute('download')||link.origin!==location.origin||link.href===location.href)return;
   event.preventDefault();event.stopPropagation();
   if(!saving&&!kitchenSaving)setLeaving(link.pathname+link.search+link.hash);
  };
  window.addEventListener('beforeunload',guard);document.addEventListener('click',navigate,true);
  return()=>{window.removeEventListener('beforeunload',guard);document.removeEventListener('click',navigate,true);};
 },[dirty,saving,kitchenSaving]);
 function patch(value:Partial<FullServiceSettings>){if(editable&&!saving)setDraft(previous=>previous?{...previous,...value}:null);setError('');}
 async function save(event:React.FormEvent){event.preventDefault();if(!draft||!serviceDirty||saving||!editable)return;
  for(const key of ['courses','comp_reasons','void_reasons'] as const){const list=draft[key];if(!list.length||list.length>(key==='courses'?12:30)||list.some(value=>!value.trim()||value.length>80)||new Set(list.map(value=>value.trim().toLocaleLowerCase())).size!==list.length){setError(t('fullServiceInvalid'));return;}}
  const normalized={...draft,courses:draft.courses.map(value=>value.trim()),comp_reasons:draft.comp_reasons.map(value=>value.trim()),void_reasons:draft.void_reasons.map(value=>value.trim())};
  setSaving(true);setError('');
  try{const response=await updateRestaurantSettings(rid,{full_service:normalized});if(!response.full_service)throw new Error('Incomplete save');setDraft(response.full_service);setBaseline(response.full_service);}
  catch{setError(t('tableSettingsSaveFailed'));}finally{setSaving(false);}
 }
 return <div className="max-w-4xl space-y-6">
  <PageHead title={t('fullServiceTitle')} desc={t('fullServiceSharedHint')} actions={editable&&<Button type="submit" form="full-service" disabled={!serviceDirty||saving}>{t(saving?'saving':'saveChanges')}</Button>}/>
  {!draft?error?<div role="alert"><p>{error}</p><Button onClick={()=>setReload(value=>value+1)}>{t('retry')}</Button></div>:<p role="status">{t('loading')}</p>:<form id="full-service" onSubmit={save} className="space-y-6">
   <Section title={t('fullServiceSeating')}><Field label={t('fullServiceSeating')}><select className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4" value={draft.seating_mode} disabled={!editable||saving} onChange={event=>patch({seating_mode:event.target.value as FullServiceSettings['seating_mode']})}>
    <option value="disabled">{t('disabled')}</option><option value="coversOnly">{t('fullServiceCoversOnly')}</option><option value="optionalSeats">{t('fullServiceOptionalSeats')}</option><option value="requiredSeats">{t('fullServiceRequiredSeats')}</option>
   </select></Field></Section>
   <Section title={t('fullServiceTitle')}><div className="divide-y divide-[var(--line)]">{([
    ['send_and_stay','fullServiceSendStay'],['coursing_enabled','fullServiceCoursing'],
   ] as const).map(([key,label])=><label key={key} className="flex items-center justify-between gap-6 py-5"><span>{t(label)}</span><BooleanInput aria-label={t(label)} checked={draft[key]} disabled={!editable||saving} onChange={event=>patch({[key]:event.target.checked})}/></label>)}</div>
   <Field label={t('fullServiceSort')}><select className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4" value={draft.sort_cart} disabled={!editable||saving} onChange={event=>patch({sort_cart:event.target.value as FullServiceSettings['sort_cart']})}>{(['course','seat','entry'] as const).map((key,index)=><option key={key} value={key}>{t(['fullServiceSortCourse','fullServiceSortSeat','fullServiceSortEntry'][index])}</option>)}</select></Field></Section>
   <Section title={t('fullServiceFastEntry')} desc={t('fullServiceFastEntryHint')}>
    <label className="flex items-start justify-between gap-6 py-2">
     <span className="min-w-0"><span className="block">{t('fullServiceAutoProgression')}</span><span className="mt-1 block text-fs-sm text-[var(--fg-muted)]">{t('fullServiceAutoProgressionHint')}</span></span>
     <BooleanInput aria-label={t('fullServiceAutoProgression')} checked={draft.auto_progression ?? false} disabled={!editable||saving} onChange={event=>patch({auto_progression:event.target.checked})}/>
    </label>
   </Section>
   {([
    ['courses','fullServiceCourses'],['comp_reasons','fullServiceCompReasons'],['void_reasons','fullServiceVoidReasons'],
   ] as const).map(([key,label])=><Section key={key} title={t(label)} desc={key==='courses'?t('fullServiceListHint'):undefined}><textarea aria-label={t(label)} value={draft[key].join('\n')} rows={Math.max(3,draft[key].length)} disabled={!editable||saving} onChange={event=>patch({[key]:event.target.value.split('\n')})} className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 leading-8"/></Section>)}
   {error&&<p role="alert" className="text-[var(--danger-500)]">{error}</p>}
   <div className="flex items-center justify-between border-t border-[var(--line)] pt-5"><p role="status">{t(serviceDirty?'settingsUnsaved':'settingsUnchanged')}</p><Button type="submit" disabled={!editable||!serviceDirty||saving}>{t(saving?'saving':'saveChanges')}</Button></div>
  </form>}
  <KitchenStationSettingsEditor key={rid} rid={rid} editable={editable} onDirtyChange={setKitchenDirty} onBusyChange={setKitchenSaving}/>
  <ConfirmDialog open={leaving!==null} onOpenChange={open=>{if(!open)setLeaving(null);}} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={()=>{const target=leaving;setLeaving(null);setDraft(baseline);if(target)router.push(target);}}/>
 </div>;
}
