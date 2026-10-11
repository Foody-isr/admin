'use client';

import { useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, Package } from 'lucide-react';
import type { StockItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
import StockFiltersDrawer, { type FilterCategory } from './StockFiltersDrawer';

export interface StockItemPickerModalProps {
  stockItems:StockItem[];
  mode:'add'|'swap';
  excludeIds?:Set<number>;
  initialSelectedId?:number;
  title?:string;
  onConfirm:(selectedIds:number[])=>void;
  onClose:()=>void;
}

/** Pick raw ingredients without changing the recipe until selection is confirmed. */
export default function StockItemPickerModal({stockItems,mode,excludeIds,initialSelectedId,title,onConfirm,onClose}:StockItemPickerModalProps) {
  const {t,locale}=useI18n();
  const [search,setSearch]=useState('');
  const [categories,setCategories]=useState<Set<string>>(new Set());
  const [filters,setFilters]=useState(false);
  const [picked,setPicked]=useState<Set<number>>(()=>initialSelectedId?new Set([initialSelectedId]):new Set());
  const first=useRef<HTMLInputElement>(null);
  const options:FilterCategory[]=useMemo(()=>Array.from(new Set(stockItems.map(item=>item.category).filter(Boolean))).sort().map(name=>({name})),[stockItems]);
  const query=search.trim().toLocaleLowerCase(locale);
  const visible=stockItems.filter(item=>(!query||item.name.toLocaleLowerCase(locale).includes(query))&&(!categories.size||categories.has(item.category))).sort((a,b)=>a.name.localeCompare(b.name,locale));
  const toggle=(id:number)=>{if(excludeIds?.has(id))return;setPicked(previous=>{if(mode==='swap')return new Set([id]);const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});};
  const confirm=()=>{if(!picked.size)return;onConfirm(Array.from(picked));onClose();};
  return <>
    <Modal title={title??t('selectIngredients')} initialFocusRef={first} onClose={onClose} closeDisabled={filters} size="2xl"
      footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" onClick={onClose}>{t('cancel')}</Button><Button size="lg" disabled={!picked.size} onClick={confirm}>{mode==='swap'?t('confirm'):t('addSelected').replace('{count}',String(picked.size))}</Button></div>}>
      <div className="mb-4 flex flex-wrap gap-3"><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-secondary"/><input ref={first} type="search" aria-label={t('searchItems')} value={search} onChange={event=>setSearch(event.target.value)} placeholder={t('searchItems')} className="input min-h-11 w-full pe-3 ps-10 text-base"/></label><Button size="lg" variant="secondary" onClick={()=>setFilters(true)}><SlidersHorizontal/>{t('category')} · {categories.size||t('all')}</Button></div>
      {!visible.length?<p className="py-10 text-center text-sm text-fg-secondary">{stockItems.length?t('tryAdjustingFilters'):t('noStockItems')}</p>:<div className="max-h-[50dvh] overflow-y-auto"><fieldset className="min-w-0 divide-y divide-[var(--line)]"><legend className="sr-only">{title??t('selectIngredients')}</legend>{visible.map(item=>{
        const disabled=excludeIds?.has(item.id)??false;
        return <label key={item.id} className={`flex min-w-0 cursor-pointer items-center gap-3 rounded-r-sm px-3 py-4 text-start ${disabled?'cursor-not-allowed opacity-60':picked.has(item.id)?'bg-[var(--brand-soft)]':'hover:bg-[var(--surface-2)]'}`}>
          <input type={mode==='swap'?'radio':'checkbox'} name={mode==='swap'?'stock-item':undefined} checked={picked.has(item.id)} disabled={disabled} onChange={()=>toggle(item.id)} aria-label={item.name} className="size-5 shrink-0 accent-[var(--brand-ink)]"/>
          {item.image_url?(
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image_url} alt="" className="size-10 shrink-0 rounded-r-md object-cover"/>):<span className="grid size-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-fg-secondary"><Package className="size-5"/></span>}
          <span className="min-w-0 flex-1 space-y-1"><span className="block break-words text-sm font-medium"><bdi>{item.name}</bdi></span><span className="block text-xs text-fg-secondary"><bdi>{item.category||'—'} · {item.unit}</bdi></span>{disabled&&<span className="block text-xs text-fg-secondary">{t('alreadyAdded')}</span>}</span>
        </label>;
      })}</fieldset></div>}
    </Modal>
    <StockFiltersDrawer open={filters} initialView="category" onClose={()=>setFilters(false)} categories={options} selectedCategories={categories} onCategoryChange={setCategories}/>
  </>;
}
