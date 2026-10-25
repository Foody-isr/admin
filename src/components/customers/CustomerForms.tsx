'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { Button, ConfirmDialog, Field, Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { addTrustedCustomer, getCustomerProfile, removeTrustedCustomer, updateCustomerProfile, type TrustedCustomer } from '@/lib/api';
import { normalizeCustomerPhone } from '@/lib/customer-phone';
import { CustomerPhoneFields, type CustomerPhoneDraft } from './CustomerPhoneFields';
import { CustomerDeliveryFields, EMPTY_DELIVERY, type CustomerDeliveryValue } from './CustomerDeliveryFields';

export interface CustomerEditorTarget { phone: string; name: string; trusted: TrustedCustomer | null; phones?: string[]; }
interface ProfileForm { name: string; cash: boolean; notes: string; delivery: CustomerDeliveryValue; phones: CustomerPhoneDraft[]; }

/** Edit one restaurant customer and retain confirmed steps across a failed save. */
export function CustomerEditor({restaurantId,row,onClose,onSaved}:{restaurantId:number;row:CustomerEditorTarget;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const {t}=useI18n();
  const [form,setForm]=useState<ProfileForm>({name:row.name||row.trusted?.name||'',cash:!!row.trusted,notes:row.trusted?.notes||'',delivery:EMPTY_DELIVERY,phones:(row.phones??[row.phone]).map((phone,index)=>({id:`existing-${index}`,originalPhone:phone,phone:normalizeCustomerPhone(phone)??phone,isWhatsApp:index===0}))});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState('');
  const [attempted,setAttempted]=useState(false);
  const savedPhone=useRef(row.phone);
  const [phase,setPhase]=useState(0);
  const progress=useRef({profile:false,removed:false,cash:false});
  const session=useCustomerFormSession(JSON.stringify(form)+`|${phase}`,onClose);
  const {setBaseline}=session;
  const request=useRef({value:0});
  const load=useCallback(async()=>{
    const sequence=++request.current.value;setLoading(true);setLoadError('');
    try {
      const profile=await getCustomerProfile(restaurantId,row.phone);
      if(sequence!==request.current.value)return;
      const seed=profile.last_delivery;
      const next={name:profile.name||row.name||row.trusted?.name||'',cash:!!row.trusted,notes:row.trusted?.notes||'',delivery:{address:profile.address||seed?.address||'',city:profile.city||seed?.city||'',floor:profile.floor||seed?.floor||'',apt:profile.apt||seed?.apt||'',entryCode:profile.entry_code||seed?.entry_code||'',deliveryNotes:profile.delivery_notes||seed?.delivery_notes||''},phones:(profile.phones?.length?profile.phones:(row.phones??[row.phone]).map((phone,index)=>({phone,is_whatsapp:index===0}))).map((contact,index)=>({id:`existing-${index}`,originalPhone:contact.phone,phone:normalizeCustomerPhone(contact.phone)??contact.phone,isWhatsApp:contact.is_whatsapp}))};
      setForm(next);setBaseline(JSON.stringify(next)+'|0');
    } catch(cause){if(sequence===request.current.value)setLoadError(cause instanceof Error?cause.message:t('customerLoadFailed'));}
    finally{if(sequence===request.current.value)setLoading(false);}
  },[restaurantId,row,setBaseline,t]);
  useEffect(()=>{const scope=request.current;void load();return()=>{scope.value+=1;};},[load]);
  const blocked=session.frozen||loading||!!loadError||phase>0;
  const save=()=>{
    setAttempted(true);
    const normalized=form.phones.map(contact=>normalizeCustomerPhone(contact.phone));
    if(normalized.some(phone=>!phone)||new Set(normalized).size!==normalized.length)return;
    return session.run(async()=>{
    if(!progress.current.profile){
      try {
        const saved=await updateCustomerProfile(restaurantId,row.phone,{name:form.name,address:form.delivery.address,city:form.delivery.city,floor:form.delivery.floor,apt:form.delivery.apt,entry_code:form.delivery.entryCode,delivery_notes:form.delivery.deliveryNotes,phones:form.phones.map((contact,index)=>({phone:normalized[index]!,original_phone:contact.originalPhone,is_whatsapp:contact.isWhatsApp}))});
        savedPhone.current=saved.phone;
      } catch(error) {
        const code=error instanceof Error?error.message:'';
        if(['customer_phone_conflict','invalid_customer_phone','customer_phone_not_found'].includes(code))throw new Error(t(code==='customer_phone_conflict'?'customerContactPhoneConflict':code==='customer_phone_not_found'?'customerPhoneNotFound':'invalidCustomerPhone'));
        throw error;
      }
      progress.current.profile=true;setPhase(1);
    }
    if(!progress.current.cash){
      const old=row.trusted;
      const replacing=!!old&&form.cash&&(form.name!==old.name||form.notes!==(old.notes||''));
      if(old&&(!form.cash||replacing)&&!progress.current.removed){await removeTrustedCustomer(restaurantId,old.id);progress.current.removed=true;setPhase(2);}
      if(form.cash&&(!old||replacing))await addTrustedCustomer(restaurantId,{phone:normalizeCustomerPhone(form.phones.find(contact=>contact.originalPhone===old?.phone)?.phone??savedPhone.current)??savedPhone.current,name:form.name||old?.name||row.name||'',notes:form.notes||undefined});
      progress.current.cash=true;setPhase(3);
    }
  },onSaved);
  };
  return <>
    <Modal title={t('editCustomer')} subtitle={<bdi dir="ltr">{row.phone}</bdi>} size="xl" onClose={session.close} closeDisabled={session.busy} footer={<div className="space-y-3">{phase>0&&!session.saved&&<p role="status" className="text-sm">{t('customerPartiallySaved')}</p>}{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button><Button form="customer-edit-form" type="submit" disabled={session.busy||loading||!!loadError||!session.canManage}>{t(session.busy?'saving':phase>0?'retry':'save')}</Button></div></div>}>
      {loading&&<p role="status" className="py-5 text-sm">{t('loading')}</p>}
      {loadError&&<div role="alert" className="mb-4 text-sm text-[var(--danger-500)]"><p>{loadError}</p><Button variant="secondary" onClick={()=>void load()}>{t('retry')}</Button></div>}
      <form id="customer-edit-form" onSubmit={event=>{event.preventDefault();if(!loading&&!loadError)void save();}}><fieldset disabled={blocked} className="min-w-0 space-y-5">
        <Field label={t('nameOptional')}><Input dir="auto" value={form.name} onChange={event=>setForm(current=>({...current,name:event.target.value}))}/></Field>
        <CustomerPhoneFields value={form.phones} attempted={attempted} disabled={blocked} onChange={phones=>setForm(current=>({...current,phones}))}/>
        <fieldset className="min-w-0 space-y-3 border-t border-[var(--line)] pt-4"><legend className="px-1 text-sm font-semibold">{t('deliveryDetails')}</legend><CustomerDeliveryFields value={form.delivery} disabled={blocked} onChange={patch=>setForm(current=>({...current,delivery:{...current.delivery,...patch}}))}/></fieldset>
        <label className="flex min-h-11 items-start justify-between gap-4 border-t border-[var(--line)] pt-4 selection-row"><span><span className="block text-sm font-semibold">{t('allowCashPayment')}</span><span className="mt-1 block text-sm text-[var(--fg-muted)]">{t('allowCashPaymentDesc')}</span></span><input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--action)]" aria-label={t('allowCashPayment')} checked={form.cash} disabled={blocked} onChange={event=>setForm(current=>({...current,cash:event.target.checked}))}/></label>
        {form.cash&&<Field label={t('notesOptional')}><Input dir="auto" value={form.notes} onChange={event=>setForm(current=>({...current,notes:event.target.value}))}/></Field>}
      </fieldset></form>

    </Modal>
    {session.confirmation}
  </>;
}

/** Add a cash-authorized customer without repeating an acknowledged creation. */
export function CustomerAddModal({restaurantId,onClose,onSaved}:{restaurantId:number;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const {t}=useI18n();const [form,setForm]=useState({phone:'',name:'',notes:''});const session=useCustomerFormSession(JSON.stringify(form),onClose);const first=useRef<HTMLInputElement>(null);
  const save=()=>session.run(async()=>{await addTrustedCustomer(restaurantId,{phone:form.phone.trim(),name:form.name,notes:form.notes||undefined});},onSaved);
  return <><Modal title={t('addTrustedCustomer')} onClose={session.close} closeDisabled={session.busy} initialFocusRef={first} footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button><Button form="customer-add-form" type="submit" disabled={session.busy||!session.canManage||!form.phone.trim()}>{t(session.busy?'adding':session.saved?'retry':'addCustomer')}</Button></div></div>}>
    <form id="customer-add-form" onSubmit={event=>{event.preventDefault();void save();}}><fieldset disabled={session.frozen} className="space-y-4"><Field label={t('phoneNumber')}><Input ref={first} type="tel" dir="ltr" autoComplete="tel" required value={form.phone} onChange={event=>setForm(current=>({...current,phone:event.target.value}))}/></Field><Field label={t('nameOptional')}><Input dir="auto" autoComplete="name" value={form.name} onChange={event=>setForm(current=>({...current,name:event.target.value}))}/></Field><Field label={t('notesOptional')}><Input dir="auto" value={form.notes} onChange={event=>setForm(current=>({...current,notes:event.target.value}))}/></Field></fieldset></form>
  </Modal>{session.confirmation}</>;
}

/** Track customer form drafts and distinguish saved mutations from refresh failures. */
export function useCustomerFormSession(fingerprint:string,onClose:()=>void) {
 const {t}=useI18n();const {hasAnyPermission}=usePermissions();const canManage=hasAnyPermission('customers.manage');
 const [baseline,setBaseline]=useState(fingerprint);const [busy,setBusy]=useState(false);const [saved,setSaved]=useState(false);const [error,setError]=useState('');const [discard,setDiscard]=useState(false);const lock=useRef(false);const receipt=useRef(false);const dirty=fingerprint!==baseline;
 const close=()=>{if(lock.current)return;if(dirty&&!receipt.current)setDiscard(true);else onClose();};
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if((dirty&&!receipt.current)||lock.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
 const run=async(persist:()=>Promise<void>,refresh:()=>Promise<void>)=>{if(!canManage||lock.current)return;lock.current=true;setBusy(true);setError('');try{if(!receipt.current){await persist();receipt.current=true;setSaved(true);}await refresh();onClose();}catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}finally{lock.current=false;setBusy(false);}};
 return {setBaseline,busy,saved,error,canManage,frozen:busy||saved||!canManage,close,run,feedback:<>{saved&&<p role="status" className="text-sm">{t('customerSavedRefresh')}</p>}{error&&<p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}</>,confirmation:<ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={onClose}/>};
}
