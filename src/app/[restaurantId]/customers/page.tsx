'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getAnalyticsCustomers, listTrustedCustomers, type CustomerListResult, type TrustedCustomer } from '@/lib/api';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { Button, Badge } from '@/components/ds';
import { ListToolbar, ListPagination, DataTable, DataTableHead, DataTableHeadCell, DataTableHeadSpacerCell, DataTableBody, DataTableRow, DataTableCell } from '@/components/data-table';
import { MergeCustomersModal } from './MergeCustomersModal';
import { DuplicateSuggestions } from './DuplicateSuggestions';
import { CustomerAddModal, CustomerEditor, type CustomerEditorTarget } from '@/components/customers/CustomerForms';

const PER_PAGE=25;
// Keep the same canonical key used by the existing analytics/trusted-list join.
function phoneKey(phone:string){let digits=phone.replace(/\D/g,'');if(digits.startsWith('972'))digits=digits.slice(3);if(digits.startsWith('0'))digits=digits.slice(1);return digits;}
interface CustomerRow extends CustomerEditorTarget {orders:number;lastOrderAt:string|null;address?:string;city?:string;floor?:string;apt?:string;entryCode?:string;}

/** Scope the customer workspace and its open forms to the active restaurant. */
export default function CustomersPage(){const {restaurantId}=useParams();const rid=Number(restaurantId);return <CustomerWorkspace key={rid} rid={rid}/>;}

function CustomerWorkspace({rid}:{rid:number}) {
 const {t,locale}=useI18n();const {hasAnyPermission}=usePermissions();const canManage=hasAnyPermission('customers.manage');
 const [data,setData]=useState<CustomerListResult|null>(null);const [trusted,setTrusted]=useState<TrustedCustomer[]>([]);
 const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [page,setPage]=useState(1);const [search,setSearch]=useState('');const [searchInput,setSearchInput]=useState('');
 const [selected,setSelected]=useState<Set<string>>(new Set());const [mergeRows,setMergeRows]=useState<CustomerRow[]|null>(null);const [addOpen,setAddOpen]=useState(false);const [editRow,setEditRow]=useState<CustomerRow|null>(null);
 const request=useRef({value:0});
 const reload=useCallback(async()=>{
  const sequence=++request.current.value;setLoading(true);setError('');
  try{const [result,cash]=await Promise.all([getAnalyticsCustomers(rid,{search:search||undefined,page,per_page:PER_PAGE,sort_by:'total_spent',sort_dir:'desc'}),listTrustedCustomers(rid)]);if(sequence===request.current.value){setData(result);setTrusted(cash);}}
  catch(cause){if(sequence===request.current.value)setError(cause instanceof Error?cause.message:t('customerLoadFailed'));throw cause;}
  finally{if(sequence===request.current.value)setLoading(false);}
 },[rid,search,page,t]);
 useEffect(()=>{const scope=request.current;void reload().catch(()=>{/* Rendered by the workspace error state. */});return()=>{scope.value+=1;};},[reload]);
 useEffect(()=>{const timer=setTimeout(()=>{setSearch(searchInput.trim());setPage(1);},300);return()=>clearTimeout(timer);},[searchInput]);
 useEffect(()=>setSelected(new Set()),[page,search]);
 const trustedByKey=useMemo(()=>new Map(trusted.map(customer=>[phoneKey(customer.phone),customer])),[trusted]);
 const rows=useMemo<CustomerRow[]>(()=>{
  const analyticsRows=(data?.customers??[]).map(customer=>({phone:customer.customer_phone,name:customer.customer_name,orders:customer.total_orders,lastOrderAt:customer.last_order_date,trusted:trustedByKey.get(phoneKey(customer.customer_phone))??null,address:customer.address,city:customer.city,floor:customer.floor,apt:customer.apt,entryCode:customer.entry_code,phones:customer.phones}));
  const seen=new Set(analyticsRows.map(row=>phoneKey(row.phone)));
  const extras=page===1&&!search?trusted.filter(customer=>!seen.has(phoneKey(customer.phone))).map(customer=>({phone:customer.phone,name:customer.name,orders:0,lastOrderAt:null,trusted:customer})):[];
  return [...extras,...analyticsRows];
 },[data,trusted,trustedByKey,page,search]);
 const totalPages=Math.max(1,Math.ceil((data?.total??0)/PER_PAGE));
 const selectedRows=rows.filter(row=>selected.has(phoneKey(row.phone)));
 const toggle=(key:string)=>setSelected(current=>{const next=new Set(current);if(next.has(key))next.delete(key);else next.add(key);return next;});
 const refreshAfterMerge=async()=>{await reload();setSelected(new Set());};
 const date=(value:string|null)=>value?new Intl.DateTimeFormat(locale).format(new Date(value)):t('never');
 return <div>
  <h1 className="sr-only">{t('customers')}</h1>
  <ListToolbar search={{ value: searchInput, onChange: setSearchInput, label: t('search') }}
    actions={<ActionsDropdown actions={[
      { label: t('refresh'), onClick: () => void reload().catch(() => {}) },
      ...(canManage && selectedRows.length >= 2 && !loading && !error ? [{ label: t('mergeCustomersSelected').replace('{n}',String(selectedRows.length)), onClick: () => setMergeRows(selectedRows) }] : []),
      ...(selectedRows.length ? [{ label: t('listClearSelection'), onClick: () => setSelected(new Set()) }] : []),
    ]} />}
    primaryAction={canManage && <Button onClick={() => setAddOpen(true)}>{t('addCustomer')}</Button>} />
  {canManage&&<DuplicateSuggestions restaurantId={rid} onChanged={refreshAfterMerge}/>}
  {error?<div role="alert" className="rounded-xl border border-[var(--line)] p-5"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button className="mt-3" variant="secondary" onClick={()=>void reload().catch(()=>{/* Error is displayed above. */})}>{t('retry')}</Button></div>:loading?<p role="status" className="py-12 text-center text-sm text-[var(--fg-muted)]">{t('loading')}</p>:rows.length===0?<div className="rounded-xl border border-[var(--line)] p-8 text-center text-[var(--fg-muted)]">{t('noCustomers')}</div>:<>
   <DataTable className="list-table">
    <DataTableHead>{canManage&&<DataTableHeadSpacerCell><label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" className="size-4 accent-[var(--action)]" aria-label={t('selectAll')} checked={rows.every(row=>selected.has(phoneKey(row.phone)))} onChange={event=>setSelected(event.target.checked?new Set(rows.map(row=>phoneKey(row.phone))):new Set())}/></label></DataTableHeadSpacerCell>}{['phone','name','address','orders','lastOrder','canPayCash'].map(key=><DataTableHeadCell key={key}>{t(key)}</DataTableHeadCell>)}</DataTableHead>
    <DataTableBody>{rows.map((row,index)=>{
     const address=formatDeliveryAddress({address:row.address,city:row.city,floor:row.floor,apt:row.apt,entryCode:row.entryCode},t,{compact:true});const key=phoneKey(row.phone);
     return <DataTableRow key={key||index} index={index}>
      {canManage&&<DataTableCell data-mobile-select=""><label className="inline-flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" className="size-4 accent-[var(--action)]" aria-label={`${t('select')} ${row.name||row.phone}`} checked={selected.has(key)} onChange={()=>toggle(key)}/></label></DataTableCell>}
      <DataTableCell mobilePrimary><div className="flex flex-wrap items-center gap-2">{canManage?<button type="button" className="min-h-11 text-start font-semibold text-[var(--action)] underline-offset-4 hover:underline" aria-label={`${t('editCustomer')} · ${row.name||row.phone}`} onClick={()=>setEditRow(row)}><bdi dir="ltr">{row.phone}</bdi></button>:<bdi dir="ltr" className="font-semibold">{row.phone}</bdi>}{(row.phones?.length??1)>1&&<Badge tone="neutral">{t('mergeCustomersNumbers').replace('{n}',String(row.phones!.length))}</Badge>}</div></DataTableCell>
      <DataTableCell mobileLabel={t('name')}><span dir="auto" className="break-words">{row.name||'—'}</span></DataTableCell>
      <DataTableCell mobileLabel={t('address')}>{address?<div dir="auto" className="text-sm"><p>{address.line1}</p>{address.line2&&<p className="mt-1 text-[var(--fg-muted)]">{address.line2}</p>}</div>:'—'}</DataTableCell>
      <DataTableCell mobileLabel={t('orders')} className="tabular-nums">{row.orders}</DataTableCell><DataTableCell mobileLabel={t('lastOrder')}>{date(row.lastOrderAt)}</DataTableCell><DataTableCell mobileLabel={t('canPayCash')}><Badge tone={row.trusted?'success':'neutral'}>{t(row.trusted?'yes':'no')}</Badge></DataTableCell>
     </DataTableRow>;
    })}</DataTableBody>
   </DataTable>
   <ListPagination page={page} totalPages={totalPages} pageSize={PER_PAGE} onPageChange={setPage} />
  </>}
  {editRow&&<CustomerEditor key={editRow.phone} restaurantId={rid} row={editRow} onClose={()=>setEditRow(null)} onSaved={reload}/>}
  {addOpen&&<CustomerAddModal restaurantId={rid} onClose={()=>setAddOpen(false)} onSaved={reload}/>}
  {mergeRows&&<MergeCustomersModal restaurantId={rid} rows={mergeRows} onClose={()=>setMergeRows(null)} onMerged={refreshAfterMerge}/>}
 </div>;
}
