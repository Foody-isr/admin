 'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRestaurantSettings, updateRestaurantSettings, type FullServiceSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { fulfillmentSaveConfirmed, validFulfillment } from '@/lib/pos-fulfillment';

/** Stage restaurant POS policies; preserve other settings and discard on explicit navigation. */
export function usePOSSettings(rid: number, internalPath?: string) {
 const { t } = useI18n(), { hasAnyPermission } = usePermissions(), router = useRouter();
 const [draft,setDraft]=useState<FullServiceSettings|null>(null),[baseline,setBaseline]=useState<FullServiceSettings|null>(null);
 const [customDiningSupported,setCustomDiningSupported]=useState(false),[customerInformationSupported,setCustomerInformationSupported]=useState(false);
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),[leaving,setLeaving]=useState<string|null>(null),[retry,setRetry]=useState(0);
 const lock=useRef(false),generation=useRef(0),editable=hasAnyPermission('settings.edit');
 const dirty=JSON.stringify(draft)!==JSON.stringify(baseline);
 useEffect(()=>{const current=++generation.current;setDraft(null);setBaseline(null);setError('');
  getRestaurantSettings(rid).then(result=>{if(!result.full_service)throw new Error('Missing POS policy');if(current===generation.current){setDraft(result.full_service);setBaseline(result.full_service);setCustomDiningSupported(result.pos_custom_dining_supported===true);setCustomerInformationSupported(result.pos_fulfillment_customer_information_supported===true);}}).catch(()=>{if(current===generation.current)setError(t('tableSettingsLoadFailed'));});
  return()=>{generation.current++;};
 },[rid,retry,t]);
 useEffect(()=>{
  const unload=(e:BeforeUnloadEvent)=>{if(dirty||saving){e.preventDefault();e.returnValue='';}};
  const navigate=(e:MouseEvent)=>{if((!dirty&&!saving)||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
   const a=(e.target as Element).closest?.('a[href]');if(!(a instanceof HTMLAnchorElement)||a.target==='_blank'||a.hasAttribute('download')||a.origin!==location.origin||a.href===location.href)return;
   if(internalPath&&(a.pathname===internalPath||a.pathname.startsWith(internalPath+'/')))return;
   e.preventDefault();e.stopPropagation();if(!saving)setLeaving(a.pathname+a.search+a.hash);
  };
  window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true);
  return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true);};
 },[dirty,saving,internalPath]);
 const patch=useCallback((value:Partial<FullServiceSettings>)=>{if(editable&&!lock.current){setDraft(previous=>previous?{...previous,...value}:null);setError('');}},[editable]);
 async function save(){
  if(!draft||!editable||!dirty||lock.current)return false;
  if(draft.fulfillment?.methods&&!validFulfillment(draft.fulfillment)){setError(t('fullServiceInvalid'));return false;}
  if(draft.fulfillment?.methods&&!customDiningSupported){setError(t('posDiningUnavailable'));return false;}
  if(draft.fulfillment?.methods?.some(method=>method.show_customer_information!==undefined)&&!customerInformationSupported){setError(t('posDiningCustomerUnavailable'));return false;}
  for(const key of ['courses','comp_reasons','void_reasons'] as const){const list=draft[key];if(!list.length||list.length>(key==='courses'?12:30)||list.some(value=>!value.trim()||Array.from(value.trim()).length>80)||new Set(list.map(value=>value.trim().toLowerCase())).size!==list.length){setError(t('fullServiceInvalid'));return false;}}
  lock.current=true;setSaving(true);setError('');const current=generation.current;
  try {const normalized={...draft,courses:draft.courses.map(v=>v.trim()),comp_reasons:draft.comp_reasons.map(v=>v.trim()),void_reasons:draft.void_reasons.map(m=>m.trim()),modes:draft.modes?.map(m=>({...m,name:m.name.trim()}))};const result=await updateRestaurantSettings(rid,{full_service:normalized});if(!result.full_service)throw new Error('Incomplete save');if(current!==generation.current)return false;setCustomerInformationSupported(result.pos_fulfillment_customer_information_supported===true);if(normalized.fulfillment?.methods?.some(method=>method.show_customer_information!==undefined)&&result.pos_fulfillment_customer_information_supported!==true||!fulfillmentSaveConfirmed(normalized.fulfillment,result.full_service.fulfillment)){setError(t('posDiningSaveUnconfirmed'));return false;}setDraft(result.full_service);setBaseline(result.full_service);return true;}
  catch {if(current===generation.current)setError(t('tableSettingsSaveFailed'));return false;}
  finally {lock.current=false;if(current===generation.current)setSaving(false);}
 }
 return {draft,baseline,customDiningSupported,customerInformationSupported,patch,save,error,setError,saving,dirty,editable,leaving,setLeaving,reload:()=>setRetry(n=>n+1),discard:()=>{const path=leaving;setLeaving(null);setDraft(baseline);if(path)router.push(path);}};
}
