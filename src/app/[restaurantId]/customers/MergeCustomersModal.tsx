'use client';

import { useState } from 'react';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import { useCustomerFormSession } from '@/components/customers/CustomerForms';
import { useI18n } from '@/lib/i18n';
import { mergeCustomers } from '@/lib/api';

export interface MergeRow {phone:string;name:string;orders:number;}
interface MergeCustomersModalProps {restaurantId:number;rows:MergeRow[];onClose:()=>void;onMerged:()=>Promise<void>;}

/** Confirm identity links with an explicit primary phone and retry only unsaved phases. */
export function MergeCustomersModal({restaurantId,rows,onClose,onMerged}:MergeCustomersModalProps) {
 const {t}=useI18n();
 // Most active record first; stable input order breaks equal-order ties.
 const [primary,setPrimary]=useState([...rows].sort((a,b)=>b.orders-a.orders)[0]?.phone??'');
 const session=useCustomerFormSession(primary,onClose);
 const totalOrders=rows.reduce((sum,row)=>sum+row.orders,0);
 const valid=rows.length>=2&&rows.some(row=>row.phone===primary)&&new Set(rows.map(row=>row.phone)).size===rows.length;
 const submit=()=>{if(valid)void session.run(()=>mergeCustomers(restaurantId,primary,rows.filter(row=>row.phone!==primary).map(row=>row.phone)),onMerged);};
 return <><Modal title={t('mergeCustomers')} onClose={session.close} closeDisabled={session.busy} footer={<div className="space-y-3">{session.feedback}<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={session.busy} onClick={session.close}>{t(session.saved?'close':'cancel')}</Button><Button disabled={session.busy||!session.canManage||!valid} onClick={submit}>{t(session.saved?'retry':'mergeCustomersConfirm')}</Button></div></div>}>
  <fieldset disabled={session.frozen} className="space-y-3"><legend className="mb-3 text-sm text-[var(--fg-muted)]">{t('mergeCustomersPrimary')}</legend>{rows.map(row=><label key={row.phone} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-[var(--line)] p-3"><input type="radio" name="primary-phone" value={row.phone} checked={primary===row.phone} onChange={()=>setPrimary(row.phone)} className="mt-1 size-4 shrink-0 accent-[var(--action)]"/><span className="min-w-0"><span dir="auto" className="block break-words font-semibold">{row.name||row.phone}</span><span className="mt-1 block text-sm text-[var(--fg-muted)]"><bdi dir="ltr">{row.phone}</bdi> · {t('orders')} {row.orders}</span></span></label>)}</fieldset>
  <p className="mt-5 rounded-lg bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('mergeCustomersSummary').replace('{orders}',String(totalOrders)).replace('{n}',String(rows.length))}</p>
 </Modal>{session.confirmation}</>;
}
