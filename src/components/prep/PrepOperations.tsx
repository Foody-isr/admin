'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Modal from '@/components/Modal';
import { Badge, Button, Field, NumberField, Textarea } from '@/components/ds';
import { useKitchenMutation } from '@/components/kitchen/useKitchenMutation';
import { createPrepTransaction, deletePrepItem, getDailyPrepPlan, previewPrepBatch, producePrepBatch, type DailyPlanItem, type PrepItem, type PrepTransactionType, type ProduceBatchResult } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
type MutationProps = {rid:number;item:PrepItem;onClose:()=>void;onSaved:()=>Promise<void>};

/** Preview ingredient consumption before recording a production batch. */
export function BatchProduceDialog({rid,item,onClose,onSaved}:MutationProps) {
  const {t,locale}=useI18n();
  const [quantity,setQuantity]=useState(item.yield_per_batch);
  const [preview,setPreview]=useState<ProduceBatchResult|null>(null);
  const [checking,setChecking]=useState(false);
  const [previewError,setPreviewError]=useState('');
  const request=useRef(0);
  const previewLock=useRef(false);
  const first=useRef<HTMLInputElement>(null);
  const session=useKitchenMutation<ProduceBatchResult>(String(quantity),onClose);
  const valid=Number.isFinite(quantity)&&quantity>0&&item.yield_per_batch>0;
  const format=(value:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:3}).format(value);
  useEffect(()=>()=>{request.current++;},[]);
  const check=async()=>{
    if(!valid||!session.canManage||previewLock.current)return;
    const current=++request.current;previewLock.current=true;setChecking(true);setPreviewError('');
    try{const result=await previewPrepBatch(rid,item.id,{quantity});if(current===request.current)setPreview(result);}
    catch(cause){if(current===request.current)setPreviewError(cause instanceof Error?cause.message:t('loadFailed'));}
    finally{if(current===request.current){previewLock.current=false;setChecking(false);}}
  };
  const close=()=>{if(!checking)session.close();};
  return <>
    <Modal title={t('produce').replace('{name}',item.name)} size="2xl" initialFocusRef={first} onClose={close} closeDisabled={checking||session.busy}
      footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={checking||session.busy} onClick={close}>{t(session.saved?'close':'cancel')}</Button>{session.saved?<Button size="lg" disabled={session.busy} onClick={()=>void session.run(()=>producePrepBatch(rid,item.id,{quantity}),onSaved)}>{t('retry')}</Button>:preview?<Button size="lg" disabled={session.frozen||checking||!valid||(preview.insufficient??[]).length>0} onClick={()=>void session.run(()=>producePrepBatch(rid,item.id,{quantity}),onSaved)}>{t(session.busy?'producing':'confirmProduce')}</Button>:<Button size="lg" disabled={session.frozen||checking||!valid} onClick={()=>void check()}>{t(checking?'checking':'preview')}</Button>}</div></div>}>
      <fieldset disabled={session.frozen||checking} className="min-w-0 space-y-4">
        <Field label={t('quantityToProduce').replace('{unit}',item.unit)}><NumberField ref={first} min={item.unit==='unit'?1:0.01} integer={item.unit==='unit'} value={quantity} onChange={value=>{setQuantity(value);setPreview(null);setPreviewError('');}} className="min-h-11"/></Field>
        {item.yield_per_batch>0?<p className="text-sm text-fg-secondary">{t('batchEquivalent').replace('{batches}',format(quantity/item.yield_per_batch)).replace('{yield}',format(item.yield_per_batch)).replace('{unit}',item.unit)}</p>:<p role="alert" className="text-sm text-[var(--danger-500)]">{t('prepYieldRequired')}</p>}
      </fieldset>
      {previewError&&<p role="alert" className="mt-4 text-sm text-[var(--danger-500)]">{previewError}</p>}
      {preview&&<section aria-label={t('ingredientsToConsume')} className="mt-6 space-y-4"><h3 className="text-base font-semibold">{t('ingredientsToConsume')}</h3>
        {(preview.ingredients??[]).length===0?<p className="text-sm text-fg-secondary">{t('prepNoConsumption')}</p>:<ul className="divide-y divide-[var(--line)]">{preview.ingredients.map(ingredient=><li key={ingredient.stock_item_id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words font-medium"><bdi>{ingredient.stock_item_name}</bdi></span><div className="space-y-1 text-end tabular-nums"><p><bdi dir="ltr">−{format(ingredient.quantity_used)} {ingredient.unit}</bdi></p><p className="text-fg-secondary">{t('remainingAmount').replace('{amount}',format(ingredient.remaining)).replace('{unit}',ingredient.unit)}</p></div></li>)}</ul>}
        {(preview.insufficient??[]).length>0&&<div role="alert" className="space-y-2 rounded-r-md border border-[var(--danger-500)]/30 bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]"><p className="font-semibold">{t('insufficientStock')}</p>{preview.insufficient.map(shortage=><p key={shortage.stock_item_id}>{t('insufficientDetail').replace('{name}',shortage.stock_item_name).replace('{required}',format(shortage.required)).replace('{available}',format(shortage.available)).replaceAll('{unit}',shortage.unit)}</p>)}</div>}
        <p className="text-sm text-fg-secondary">{t('prepProduceImpact')}</p>
      </section>}
    </Modal>{session.confirmation}
  </>;
}

/** Preserve the existing downward waste/adjustment contract and show its stock impact. */
export function PrepTransactionDialog({rid,item,onClose,onSaved}:MutationProps) {
  const {t}=useI18n();
  const [type,setType]=useState<PrepTransactionType>('waste');
  const [quantity,setQuantity]=useState(0);
  const [notes,setNotes]=useState('');
  const formId=useId();
  const first=useRef<HTMLInputElement>(null);
  const session=useKitchenMutation(JSON.stringify({type,quantity,notes}),onClose);
  const valid=Number.isFinite(quantity)&&quantity>0;
  return <>
    <Modal title={t('adjustItem').replace('{name}',item.name)} initialFocusRef={first} size="lg" onClose={session.close} closeDisabled={session.busy}
      footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button><Button size="lg" type="submit" form={formId} disabled={session.busy||!session.canManage||(!session.saved&&!valid)}>{t(session.busy?'saving':session.saved?'retry':'confirm')}</Button></div></div>}>
      <form id={formId} onSubmit={event=>{event.preventDefault();if(valid||session.saved)void session.run(()=>createPrepTransaction(rid,{prep_item_id:item.id,type,quantity_delta:-quantity,notes}),onSaved);}}><fieldset disabled={session.frozen} className="min-w-0 space-y-5">
        <div role="group" aria-label={t('type')} className="flex flex-wrap gap-2">{(['waste','adjust']as const).map(value=><Button key={value} type="button" size="lg" variant="secondary" aria-pressed={type===value} className={type===value?'border-[var(--brand-ink)] bg-[var(--brand-soft)] text-[var(--brand-ink)]':''} onClick={()=>setType(value)}>{t(value)}</Button>)}</div>
        {type==='adjust'&&<p className="text-sm text-fg-secondary">{t('stockAdjustmentHint')}</p>}
        <Field label={t('quantityUnit').replace('{unit}',item.unit)}><NumberField ref={first} min={0} value={quantity} onChange={setQuantity} className="min-h-11"/></Field>
        <Field label={t('notes')}><Textarea value={notes} onChange={event=>setNotes(event.target.value)} rows={3}/></Field>
      </fieldset></form>
      <dl className="mt-5 grid grid-cols-2 gap-4 rounded-r-md bg-[var(--info-50)] p-4 text-sm"><div><dt className="text-fg-secondary">{t('stockCurrentQuantity')}</dt><dd className="mt-1 text-lg font-semibold"><bdi dir="ltr">{item.quantity} {item.unit}</bdi></dd></div><div><dt className="text-fg-secondary">{t('stockAfterQuantity')}</dt><dd className="mt-1 text-lg font-semibold"><bdi dir="ltr">{Math.max(0,item.quantity-quantity)} {item.unit}</bdi></dd></div></dl>
      {quantity>item.quantity&&<p className="mt-3 text-sm text-fg-secondary">{t('stockQuantityFloorHint')}</p>}
    </Modal>{session.confirmation}
  </>;
}

/** Confirm one or more soft deletions, retaining each successful deletion on retry. */
export function PrepDeleteDialog({rid,items,onClose,onSaved}:{rid:number;items:PrepItem[];onClose:()=>void;onSaved:()=>Promise<void>}) {
  const {t}=useI18n();
  const completed=useRef(new Set<number>());
  const [count,setCount]=useState(0);
  const session=useKitchenMutation<void>('',onClose);
  const remove=()=>session.run(async()=>{for(const item of items){if(completed.current.has(item.id))continue;await deletePrepItem(rid,item.id);completed.current.add(item.id);setCount(completed.current.size);}},onSaved);
  return <Modal title={items.length===1?t('deletePrepItemConfirm'):t('bulkDeleteConfirm').replace('{count}',String(items.length))} onClose={session.close} closeDisabled={session.busy} size="lg"
    footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" disabled={session.busy} onClick={session.close}>{t('cancel')}</Button><Button size="lg" variant="danger" disabled={session.busy||!session.canManage} onClick={()=>void remove()}>{t(session.busy?'saving':session.saved||count>0?'retry':'delete')}</Button></div>}>
    <ul className="mb-4 max-h-52 space-y-2 overflow-auto text-sm">{items.map(item=><li key={item.id}><bdi>{item.name}</bdi></li>)}</ul>
    {count>0&&<p role="status" className="mb-3 text-sm">{t('stockDeleteProgress').replace('{done}',String(count)).replace('{total}',String(items.length))}</p>}{session.feedback}
  </Modal>;
}

/** Daily recommendations with an independent request generation for each selected day. */
export function DailyPrepPlanDialog({rid,onClose}:{rid:number;onClose:()=>void}) {
  const {t,locale}=useI18n();
  const [day,setDay]=useState(new Date().getDay());
  const [plan,setPlan]=useState<DailyPlanItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');getDailyPrepPlan(rid,{day_of_week:day}).then(value=>{if(active)setPlan(value);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:t('loadFailed'));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[rid,day,attempt,t]);
  const format=(value:number)=>new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(value);
  return <Modal title={t('dailyPrepPlan')} size="3xl" onClose={onClose} footer={<div className="flex justify-end"><Button size="lg" variant="secondary" onClick={onClose}>{t('close')}</Button></div>}>
    <Field label={t('day')}><select value={day} onChange={event=>setDay(Number(event.target.value))} className="input min-h-11 w-full">{DAYS.map((key,index)=><option key={key} value={index}>{t(key)}</option>)}</select></Field>
    {loading?<p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>:error?<div role="alert" className="mt-5 space-y-3"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button size="lg" variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</Button></div>:plan.length===0?<p className="py-12 text-center text-sm text-fg-secondary">{t('noPrepRecommendations')}</p>:<div className="mt-5 overflow-x-auto rounded-r-md border border-[var(--line)]" role="region" aria-label={t('dailyPrepPlan')} tabIndex={0}><table className="w-full min-w-[540px] text-sm"><thead className="border-b border-[var(--line)] bg-[var(--surface-2)]"><tr>{['prepItem','current','demand','batches'].map(key=><th scope="col" key={key} className="px-4 py-3 text-start font-medium text-fg-secondary">{t(key)}</th>)}</tr></thead><tbody className="divide-y divide-[var(--line)]">{plan.map(item=><tr key={item.prep_item_id}><th scope="row" className="max-w-72 space-y-2 px-4 py-4 text-start font-medium"><p className="break-words"><bdi>{item.prep_item_name}</bdi></p><Badge tone={item.priority==='high'?'danger':item.priority==='medium'?'warning':'neutral'}>{t(`prepPriority_${item.priority}`)}</Badge></th><td className="px-4 py-4"><bdi dir="ltr">{format(item.current_qty)} {item.unit}</bdi></td><td className="px-4 py-4"><bdi dir="ltr">{format(item.required_qty)} {item.unit}</bdi></td><td className="px-4 py-4 font-semibold text-[var(--brand-ink)]">{item.batches_needed}</td></tr>)}</tbody></table></div>}
  </Modal>;
}
