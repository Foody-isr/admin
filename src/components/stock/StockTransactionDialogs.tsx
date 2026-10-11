'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowRightLeft, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import { Badge, Button, ConfirmDialog, Field, NumberField, Textarea } from '@/components/ds';
import { createStockTransaction, listStockTransactions, type StockItem, type StockTransaction, type StockTransactionType } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

/** Existing receive/waste/downward-adjustment operations, with confirmed-write recovery. */
export function StockTransactionDialog({rid,item,defaultType,onClose,onSaved}: {
  rid:number;item:StockItem;defaultType?:StockTransactionType;onClose:()=>void;onSaved:()=>Promise<void>;
}) {
  const {t} = useI18n();
  const {hasAnyPermission} = usePermissions();
  const canManage=hasAnyPermission('kitchen.manage');
  const [type,setType]=useState<StockTransactionType>(defaultType??'receive');
  const [qty,setQty]=useState(0);
  const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [error,setError]=useState('');
  const [discard,setDiscard]=useState(false);
  const lock=useRef(false);
  const receipt=useRef<StockTransaction|null>(null);
  const first=useRef<HTMLInputElement>(null);
  const formId=useId();
  const dirty=qty!==0||notes!==''||type!==(defaultType??'receive');
  const close=()=>{if(lock.current)return;if(dirty&&!receipt.current)setDiscard(true);else onClose();};
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if((dirty&&!receipt.current)||lock.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(!canManage||lock.current||(!receipt.current&&qty<=0))return;
    lock.current=true;setSaving(true);setError('');
    try{
      if(!receipt.current){
        receipt.current=await createStockTransaction(rid,{stock_item_id:item.id,type,quantity_delta:type==='receive'?qty:-qty,notes});
        setConfirmed(true);
      }
      await onSaved();onClose();
    }catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSaving(false);}
  };
  const after=Math.max(0,type==='receive'?item.quantity+qty:item.quantity-qty);
  const options=[{value:'receive',label:t('receive'),icon:ArrowDown},{value:'waste',label:t('waste'),icon:Trash2},{value:'adjust',label:t('adjust'),icon:ArrowRightLeft}] as const;
  return <>
    <Modal title={t('stockTransaction').replace('{name}',item.name)} initialFocusRef={first} onClose={close} closeDisabled={saving} size="lg"
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={saving} onClick={close}>{t(confirmed?'close':'cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={!canManage||saving||(!confirmed&&qty<=0)}>{t(saving?'saving':confirmed?'retry':'confirm')}</Button></div>}>
      <form id={formId} onSubmit={save}><fieldset disabled={!canManage||saving||confirmed} className="min-w-0 space-y-5">
        <div role="group" aria-label={t('type')} className="flex flex-wrap gap-2">{options.map(option=><Button type="button" key={option.value} size="lg" variant="secondary" aria-pressed={type===option.value} className={type===option.value?'border-[var(--brand-ink)] bg-[var(--brand-soft)] text-[var(--brand-ink)]':''} onClick={()=>setType(option.value)}><option.icon/>{option.label}</Button>)}</div>
        {type==='adjust'&&<p className="text-sm text-fg-secondary">{t('stockAdjustmentHint')}</p>}
        <Field label={t('quantityUnit').replace('{unit}',item.unit)}><NumberField ref={first} className="min-h-11" min={0} format={String} value={qty} onChange={setQty}/></Field>
        <Field label={t('notes')}><Textarea value={notes} onChange={event=>setNotes(event.target.value)} rows={3}/></Field>
      </fieldset></form>
      <dl className="mt-5 grid grid-cols-2 gap-4 rounded-r-md bg-[var(--info-50)] p-4 text-sm">
        <div><dt className="text-fg-secondary">{t('stockCurrentQuantity')}</dt><dd className="mt-1 text-lg font-semibold"><bdi dir="ltr">{item.quantity} {item.unit}</bdi></dd></div>
        <div><dt className="text-fg-secondary">{t('stockAfterQuantity')}</dt><dd className="mt-1 text-lg font-semibold"><bdi dir="ltr">{after} {item.unit}</bdi></dd></div>
      </dl>
      {type!=='receive'&&qty>item.quantity&&<p className="mt-3 text-sm text-fg-secondary">{t('stockQuantityFloorHint')}</p>}
      {confirmed&&<p role="status" className="mt-4 text-sm">{t('stockMovementSavedRefresh')}</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-[var(--danger-500)]">{error}</p>}
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose}/>
  </>;
}

/** Recent persisted stock movements; a load error remains distinct from an empty history. */
export function StockHistoryDialog({rid,item,onClose,timeZone}: {rid:number;item:StockItem;onClose:()=>void;timeZone?:string}) {
  const {t,locale}=useI18n();
  const [transactions,setTransactions]=useState<StockTransaction[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    listStockTransactions(rid,{stock_item_id:item.id,limit:50}).then(result=>{if(active)setTransactions(result);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:t('workspaceLoadError'));}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[rid,item.id,attempt,t]);
  const formatDate=(value:string)=>new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',...(timeZone?{timeZone}:{})}).format(new Date(value));
  return <Modal title={t('stockHistoryTitle')} subtitle={item.name} onClose={onClose} size="xl">
    <p className="mb-4 text-sm text-fg-secondary">{t('stockHistoryLimit')}</p>
    {loading?<p role="status" className="py-10 text-center text-fg-secondary">{t('loading')}</p>:error?<div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button size="lg" variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</Button></div>:transactions.length===0?<p className="py-10 text-center text-sm text-fg-secondary">{t('noTransactions')}</p>:<ol className="divide-y divide-[var(--line)]">{transactions.map(transaction=><li key={transaction.id} className="space-y-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><Badge tone={transaction.type==='receive'?'info':transaction.type==='waste'?'warning':'neutral'}>{t(transaction.type)}</Badge><bdi dir="ltr" className="text-base font-semibold tabular-nums">{transaction.quantity_delta>0?'+':''}{transaction.quantity_delta} {item.unit}</bdi></div>
      <p className="break-words whitespace-pre-line text-sm">{transaction.notes||'—'}</p><time dateTime={transaction.created_at} className="block text-xs text-fg-secondary"><bdi>{formatDate(transaction.created_at)}</bdi></time>
    </li>)}</ol>}
  </Modal>;
}
