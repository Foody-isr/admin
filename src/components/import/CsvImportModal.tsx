'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCurrency, useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { importStockCsv, importMenuItemsCsv, type CsvImportStockResult, type CsvImportLibraryResult, type StockUnit } from '@/lib/api';
import { parseColumnarCsv, type ParsedCsv, CsvParseError } from '@/lib/csv/columnar';
import Modal from '@/components/Modal';
import { Badge, Button, ConfirmDialog, Field, Textarea } from '@/components/ds';

type Result=CsvImportStockResult|CsvImportLibraryResult;
interface Props {
  mode:'stock'|'library';restaurantId:number;onClose:()=>void;onImported:(result:Result)=>void|Promise<void>;
  existingCategories:string[];
  /** Lowercase category::name pairs already stored in the active restaurant. */
  existingItemKeys:Set<string>;
}
const stockUnits:StockUnit[]=['unit','g','kg','ml','l'];
const rowKey=(category:string,item:string)=>`${category.toLowerCase()}::${item.toLowerCase()}`;

/** CSV review, duplicate selection and a receipt that can refresh without importing twice. */
export default function CsvImportModal({mode,restaurantId,onClose,onImported,existingCategories,existingItemKeys}:Props) {
  const {t}=useI18n();
  const {money}=useCurrency();
  const {hasAnyPermission}=usePermissions();
  const canImport=hasAnyPermission(mode==='stock'?'kitchen.manage':'menu.edit');
  const router=useRouter();
  const [step,setStep]=useState<'input'|'review'>('input');
  const [text,setText]=useState('');
  const [parsed,setParsed]=useState<ParsedCsv|null>(null);
  const [selection,setSelection]=useState<Map<string,boolean>>(new Map());
  const [unit,setUnit]=useState<StockUnit>('unit');
  const [reading,setReading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [result,setResult]=useState<Result|null>(null);
  const [refreshed,setRefreshed]=useState(false);
  const [discard,setDiscard]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const first=useRef<HTMLTextAreaElement>(null);
  const reader=useRef<FileReader|null>(null);
  const lock=useRef(false);
  const receipt=useRef<Result|null>(null);
  const busy=reading||saving;
  const close=()=>{if(lock.current||reading)return;if(text.trim()&&!receipt.current)setDiscard(true);else onClose();};
  useEffect(()=>{
    const warn=(event:BeforeUnloadEvent)=>{if((text.trim()&&!receipt.current)||lock.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[text]);
  useEffect(()=>()=>{reader.current?.abort();},[]);
  const existing=useMemo(()=>new Set(existingCategories.map(category=>category.toLowerCase())),[existingCategories]);
  const selected=(parsed?.categories??[]).map(category=>({...category,items:category.items.filter(item=>selection.get(rowKey(category.name,item.name)))})).filter(category=>category.items.length>0);
  const count=selected.reduce((sum,category)=>sum+category.items.length,0);
  const newCategories=selected.filter(category=>!existing.has(category.name.toLowerCase())).map(category=>category.name);
  const duplicates=(parsed?.categories??[]).reduce((sum,category)=>sum+category.items.filter(item=>existingItemKeys.has(rowKey(category.name,item.name))&&!selection.get(rowKey(category.name,item.name))).length,0);
  const handleFile=(file:File)=>{
    if(!canImport||busy)return;setError('');
    if(/\.xlsx?$/i.test(file.name)){setError(t('csvImportErrorXlsx'));return;}
    if(file.size>5*1024*1024){setError(t('csvImportSizeLimit'));return;}
    setReading(true);const next=new FileReader();reader.current=next;
    next.onload=()=>{setText(String(next.result??''));setReading(false);};
    next.onerror=()=>{setError(t('csvImportErrorRead'));setReading(false);};next.readAsText(file);
  };
  const parse=()=>{
    if(!canImport||busy)return;setError('');
    try{const next=parseColumnarCsv(text);setParsed(next);setSelection(new Map(next.categories.flatMap(category=>category.items.map(item=>{const key=rowKey(category.name,item.name);return [key,!existingItemKeys.has(key)] as const;}))));setStep('review');}
    catch(cause){setError(cause instanceof CsvParseError?`${t('csvImportErrorBadFormat')} ${cause.message}`:t('csvImportErrorBadFormat'));}
  };
  const submit=async()=>{
    if(!canImport||lock.current||reading||(!receipt.current&&count===0))return;lock.current=true;setSaving(true);setError('');
    try{
      if(!receipt.current){
        receipt.current=mode==='stock'?await importStockCsv(restaurantId,{default_unit:unit,categories:selected.map(category=>({name:category.name,items:category.items.map(item=>item.name)}))}):await importMenuItemsCsv(restaurantId,{categories:selected,carte_name:t('importCarteNameDefault')});
        setResult(receipt.current);
      }
      await onImported(receipt.current);setRefreshed(true);
    }catch(cause){setError(cause instanceof Error?cause.message:t('saveFailed'));}
    finally{lock.current=false;setSaving(false);}
  };
  const finish=()=>{if(busy||!result)return;onClose();if(mode==='library'&&'carte_id'in result&&result.carte_id)router.push(`/${restaurantId}/menu/menus/${result.carte_id}`);};
  const failures=result&&'image_failures'in result?result.image_failures:[];
  return <>
    <Modal title={t(mode==='stock'?'csvImportStockTitle':'csvImportLibraryTitle')} size="3xl" onClose={close} closeDisabled={busy} initialFocusRef={first}
      footer={<div className="flex flex-wrap justify-between gap-3">
        {!result&&step==='review'?<Button size="lg" variant="secondary" disabled={busy} onClick={()=>{setStep('input');setError('');}}>{t('csvImportBack')}</Button>:<span/>}
        <div className="flex flex-wrap gap-2"><Button size="lg" variant="secondary" disabled={busy} onClick={close}>{t(result?'close':'cancel')}</Button>
          {result?<Button size="lg" disabled={busy} onClick={refreshed?finish:()=>void submit()}>{t(saving?'saving':refreshed?'done':'retry')}</Button>:<Button size="lg" disabled={!canImport||busy||(step==='input'?!text.trim():count===0)} onClick={step==='input'?parse:()=>void submit()}>{t(busy?'loading':step==='input'?'csvImportParse':'csvImportButton')}</Button>}
        </div>
      </div>}>
      {result?<div className="space-y-5">
        <p role="status" className="rounded-r-md bg-[var(--info-50)] p-4 text-sm">{t('csvImportCompleted').replace('{created}',String(result.created.length)).replace('{skipped}',String(result.skipped.length))}</p>
        {!refreshed&&<p className="text-sm text-fg-secondary">{t('csvImportRefreshPending')}</p>}
        {result.skipped.length>0&&<section><h3 className="mb-3 font-semibold">{t('csvImportDuplicate')}</h3><ul className="divide-y divide-[var(--line)]">{result.skipped.map((item,index)=><li key={index} className="py-3 text-sm"><p className="break-words font-medium">{item.name}</p><p className="break-words text-fg-secondary">{item.category} · {item.reason}</p></li>)}</ul></section>}
        {failures.length>0&&<section className="rounded-r-md border border-[var(--warning-500)] p-4"><h3 className="text-sm font-semibold">{t('csvImportImageFailures').replace('{n}',String(failures.length))}</h3><ul className="mt-3 space-y-2 text-sm">{failures.map(item=><li key={item.item_id} className="break-words">{item.name} · {item.reason}</li>)}</ul></section>}
      </div>:step==='input'?<div className="space-y-5">
        <p className="text-sm text-fg-secondary">{t(mode==='stock'?'csvImportStockStep1':'csvImportStep1')}</p>
        <div className="space-y-3 rounded-r-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] p-5"><Button size="lg" variant="secondary" disabled={!canImport||busy} onClick={()=>fileRef.current?.click()}><Upload/>{t('csvImportChooseFile')}</Button><p className="text-xs text-fg-secondary">{t('csvImportSizeLimit')}</p><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event=>{const file=event.target.files?.[0];if(file)handleFile(file);event.target.value='';}}/></div>
        <Field label={t('csvImportPaste')}><Textarea ref={first} dir="auto" rows={8} disabled={!canImport||busy} value={text} onChange={event=>setText(event.target.value)} placeholder={mode==='library'?'category,name,price,image_url\nDesserts,Tarte,32,https://…':'Légumes,Épicerie\nTomate,Farine'} className="font-mono"/></Field>
      </div>:<fieldset disabled={!canImport||busy} className="min-w-0 space-y-5">
        <div className="flex flex-wrap gap-2"><Badge tone="info">{t('csvImportCountItems').replace('{n}',String(count))}</Badge>{newCategories.length>0&&<p className="text-sm text-fg-secondary">{t('csvImportCountCategories').replace('{n}',String(newCategories.length)).replace('{list}',newCategories.join(', '))}</p>}{duplicates>0&&<Badge tone="warning">{t('csvImportCountDuplicates').replace('{n}',String(duplicates))}</Badge>}</div>
        {mode==='stock'&&<Field label={t('csvImportDefaultUnit')}><select className="min-h-11 max-w-56 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm" value={unit} onChange={event=>setUnit(event.target.value as StockUnit)}>{stockUnits.map(value=><option key={value} value={value}>{value}</option>)}</select></Field>}
        {parsed?.categories.map(category=><section key={category.name} className="overflow-hidden rounded-r-md border border-[var(--line)]"><div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-2)] px-4 py-3"><h3 className="break-words text-sm font-semibold">{category.name}</h3>{!existing.has(category.name.toLowerCase())&&<Badge tone="info">{t('csvImportNew')}</Badge>}</div><ul className="divide-y divide-[var(--line)]">{category.items.map(item=>{const key=rowKey(category.name,item.name);const duplicate=existingItemKeys.has(key);return <li key={key}><label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3 selection-row"><input type="checkbox" className="size-5 shrink-0" checked={selection.get(key)??false} onChange={()=>setSelection(previous=>{const next=new Map(previous);next.set(key,!next.get(key));return next;})}/>{item.image_url&&/* eslint-disable-next-line @next/next/no-img-element */
        <img src={item.image_url} alt="" className="size-11 shrink-0 rounded-r-sm object-cover"/>}<span className="min-w-0 flex-1 break-words text-sm">{item.name}{item.price!==undefined&&<bdi className="mt-1 block text-xs text-fg-secondary">{money(item.price)}</bdi>}</span>{duplicate&&<span className="text-xs text-[var(--warning-600)]">{t('csvImportDuplicate')}</span>}</label></li>;})}</ul></section>)}
      </fieldset>}
      {error&&<p role="alert" className="mt-5 text-sm text-[var(--danger-500)]">{error}</p>}
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose}/>
  </>;
}
