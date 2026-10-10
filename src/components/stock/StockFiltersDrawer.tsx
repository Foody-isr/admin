'use client';

import { SelectionIndicator } from '@/components/ds/Selection';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, ArrowLeft } from 'lucide-react';
import { Button, Drawer, Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

export type FilterView = 'index' | 'category' | 'status';
export interface FilterCategory { name:string; color?:string; }
export interface FilterStatusOption { value:string; label:string; color?:string; }
interface Props {
  open:boolean;initialView:FilterView;onClose:()=>void;
  categories:FilterCategory[];selectedCategories:Set<string>;onCategoryChange:(next:Set<string>)=>void;
  statuses?:FilterStatusOption[];selectedStatuses?:Set<string>;onStatusChange?:(next:Set<string>)=>void;statusLabel?:string;
}

/** Immediate catalogue/stock filters with accessible nested navigation and preserved selections. */
export default function StockFiltersDrawer({open,initialView,onClose,categories,selectedCategories,onCategoryChange,statuses,selectedStatuses,onStatusChange,statusLabel}:Props) {
  const {t} = useI18n();
  const [view,setView] = useState<FilterView>(initialView);
  const [search,setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {if (open) {setView(initialView);setSearch('');}},[open,initialView]);
  useEffect(() => {if (open && view !== 'index') {const id=requestAnimationFrame(()=>searchInput.current?.focus());return ()=>cancelAnimationFrame(id);}},[open,view]);
  const options = useMemo(() => {
    const query=search.trim().toLowerCase();
    return (view === 'category' ? categories.map(category=>({value:category.name,label:category.name,color:category.color})) : statuses ?? []).filter(option=>!query||option.label.toLowerCase().includes(query));
  },[categories,statuses,search,view]);
  const title=view==='index'?t('filterBy'):view==='category'?t('category'):statusLabel??t('status');
  const selected=view==='category'?selectedCategories:selectedStatuses??new Set<string>();
  const toggle=(value:string)=>{
    const next=new Set(selected);if(next.has(value))next.delete(value);else next.add(value);
    if(view==='category')onCategoryChange(next);else onStatusChange?.(next);
  };
  const go=(next:FilterView)=>{setSearch('');setView(next);};
  return <Drawer open={open} onOpenChange={value=>{if(!value)onClose();}} title={title} subtitle={t('filtersImmediateHint')} width={440}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button size="lg" variant="secondary" onClick={()=>{onCategoryChange(new Set());onStatusChange?.(new Set());}}>{t('reset')}</Button><Button size="lg" onClick={onClose}>{t('close')}</Button></div>}>
    <div className="space-y-4">
      {view!=='index' && initialView==='index' && <Button size="lg" variant="ghost" onClick={()=>go('index')}><ArrowLeft className="rtl:rotate-180"/>{t('back')}</Button>}
      {view==='index' ? <div className="space-y-3">
        <FilterIndexRow label={t('category')} summary={selectedCategories.size?Array.from(selectedCategories).join(', '):t('allCategories')} count={selectedCategories.size} onClick={()=>go('category')}/>
        {statuses?.length && onStatusChange ? <FilterIndexRow label={statusLabel??t('status')} summary={selectedStatuses?.size?statuses.filter(status=>selectedStatuses.has(status.value)).map(status=>status.label).join(', '):t('all')} count={selectedStatuses?.size??0} onClick={()=>go('status')}/> : null}
      </div> : <>
        <Input type="search" ref={searchInput} className="min-h-11" aria-label={t(view==='category'?'searchCategory':'searchStatus')} placeholder={t(view==='category'?'searchCategory':'searchStatus')} value={search} onChange={event=>setSearch(event.target.value)}/>
        {options.length===0 ? <p role="status" className="py-8 text-center text-sm text-fg-secondary">{t('noResults')}</p> : <div className="space-y-2">{options.map(option=>{
          const active=selected.has(option.value);
          return <button type="button" key={option.value} aria-pressed={active} onClick={()=>toggle(option.value)} className="selection-button"><span className="choice-copy">
            {option.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{background:option.color}}/>}<span className="min-w-0 flex-1 break-words">{option.label}</span>
          </span><SelectionIndicator checked={active} multiple /></button>;
        })}</div>}
      </>}
    </div>
  </Drawer>;
}

function FilterIndexRow({label,summary,count,onClick}: {label:string;summary:string;count:number;onClick:()=>void}) {
  return <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-4 text-start hover:bg-[var(--surface-2)]">
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block break-words text-sm text-fg-secondary">{summary}</span></span>
    {count>0&&<bdi className="rounded-r-sm bg-[var(--brand-soft)] px-2 py-1 text-xs font-semibold text-[var(--brand-ink)]">{count}</bdi>}<ChevronRight aria-hidden className="size-5 shrink-0 rtl:rotate-180"/>
  </button>;
}
