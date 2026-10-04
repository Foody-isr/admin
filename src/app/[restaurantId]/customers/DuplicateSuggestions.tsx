'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Badge, Button } from '@/components/ds';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { getCustomerDuplicates, dismissCustomerDuplicate, type DuplicateGroup } from '@/lib/api';
import { MergeCustomersModal } from './MergeCustomersModal';

interface DuplicateSuggestionsProps {restaurantId:number;onChanged:()=>Promise<void>;}
const groupKey=(group:DuplicateGroup)=>`${group.reason}|${group.value}|${group.customers.map(customer=>customer.phone).sort().join('|')}`;

/** Review duplicate suggestions and retain each acknowledged dismissal on retry. */
export function DuplicateSuggestions({restaurantId,onChanged}:DuplicateSuggestionsProps) {
 const {money}=useCurrency();const {t}=useI18n();const {hasAnyPermission}=usePermissions();
 const [groups,setGroups]=useState<DuplicateGroup[]>([]);const [open,setOpen]=useState(false);const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);const [actionError,setActionError]=useState('');const [mergeGroup,setMergeGroup]=useState<DuplicateGroup|null>(null);
 const request=useRef({value:0});const lock=useRef(false);const receipts=useRef(new Set<string>());
 const load=useCallback(async()=>{const sequence=++request.current.value;setLoading(true);setError('');try{const next=await getCustomerDuplicates(restaurantId);if(sequence===request.current.value)setGroups(next);}catch(cause){if(sequence===request.current.value)setError(cause instanceof Error?cause.message:t('customerLoadFailed'));throw cause;}finally{if(sequence===request.current.value)setLoading(false);}},[restaurantId,t]);
 useEffect(()=>{const scope=request.current;void load().catch(()=>{/* Visible error state below. */});return()=>{scope.value+=1;};},[load]);
 useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(lock.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[]);
 const dismiss=async(group:DuplicateGroup)=>{
  if(lock.current||!hasAnyPermission('customers.manage'))return;lock.current=true;setBusy(true);setActionError('');
  try{
   for(let i=0;i<group.customers.length;i++)for(let j=i+1;j<group.customers.length;j++){
    const pair=[group.customers[i].phone,group.customers[j].phone].sort();const key=JSON.stringify(pair);
    if(!receipts.current.has(key)){await dismissCustomerDuplicate(restaurantId,pair[0],pair[1]);receipts.current.add(key);}
   }
   await load();
  }catch(cause){setActionError(cause instanceof Error?cause.message:t('failedToUpdateCustomer'));}finally{lock.current=false;setBusy(false);}
 };
 if(!loading&&!error&&!groups.length&&!mergeGroup)return null;
 return <section aria-label={t('customerDuplicateSuggestions')} className="rounded-xl border border-[var(--line)] bg-[var(--surface)]">
  {error?<div role="alert" className="p-4"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button className="mt-2" variant="secondary" disabled={busy} onClick={()=>void load().catch(()=>{/* Visible error state above. */})}>{t('retry')}</Button></div>:loading?<p role="status" className="p-4 text-sm text-[var(--fg-muted)]">{t('loading')}</p>:<button type="button" aria-expanded={open} aria-controls="duplicate-groups" onClick={()=>setOpen(value=>!value)} className="flex min-h-14 w-full items-center justify-between gap-3 p-4 text-start text-sm font-semibold"><span>{t('duplicatesBanner').replace('{n}',String(groups.length))}</span><ChevronDownIcon aria-hidden="true" className={`size-4 shrink-0 ${open?'rotate-180':''}`}/></button>}
  {open&&<div id="duplicate-groups" className="divide-y divide-[var(--line)] border-t border-[var(--line)]">{groups.map(group=><article key={groupKey(group)} className="space-y-4 p-4">
   <Badge tone="neutral">{t(group.reason==='same_name'?'duplicatesReasonSameName':'duplicatesReasonSameAddress')}</Badge>
   <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{group.customers.map(customer=><li key={customer.phone} className="min-w-0"><p dir="auto" className="break-words text-sm font-semibold">{customer.name||customer.phone}</p><p className="mt-1 text-sm text-[var(--fg-muted)]"><bdi dir="ltr">{customer.phone}</bdi> · {customer.order_count} {t('orders')} · <bdi>{money(customer.total_spent,{decimals:0})}</bdi></p></li>)}</ul>
   <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy||loading||!!mergeGroup||!hasAnyPermission('customers.manage')} onClick={()=>void dismiss(group)}>{t('duplicatesDismiss')}</Button><Button disabled={busy||loading||!!mergeGroup||!hasAnyPermission('customers.manage')} onClick={()=>setMergeGroup(group)}>{t('mergeCustomersSelected').replace('{n}',String(group.customers.length))}</Button></div>
  </article>)}</div>}
  {actionError&&<p role="alert" className="px-4 pb-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
  {mergeGroup&&<MergeCustomersModal restaurantId={restaurantId} rows={mergeGroup.customers.map(customer=>({phone:customer.phone,name:customer.name,orders:customer.order_count}))} onClose={()=>setMergeGroup(null)} onMerged={async()=>{await Promise.all([load(),onChanged()]);}}/>}
 </section>;
}
