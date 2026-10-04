'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { listIngredientIcons, type IngredientIcon } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import Modal from '@/components/Modal';
import { Button, Input } from '@/components/ds';

export interface IngredientIconPickerProps {
  restaurantId:number;
  /** Initial ingredient search. */
  initialQuery?:string;
  onPick:(icon:IngredientIcon)=>void;
  onClose:()=>void;
}

/** Read-only curated ingredient library with scoped requests and explicit load recovery. */
export default function IngredientIconPicker({restaurantId,initialQuery='',onPick,onClose}:IngredientIconPickerProps) {
  const {t}=useI18n();
  const [search,setSearch]=useState(initialQuery);
  const [icons,setIcons]=useState<IngredientIcon[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const first=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');
    const timer=setTimeout(async()=>{
      try{const result=await listIngredientIcons(restaurantId,{q:search.trim()||undefined,limit:200});if(active)setIcons(result);}
      catch(cause){if(active)setError(cause instanceof Error?cause.message:t('workspaceLoadError'));}
      finally{if(active)setLoading(false);}
    },200);
    return()=>{active=false;clearTimeout(timer);};
  },[restaurantId,search,attempt,t]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return q?icons.filter(icon=>[icon.name,icon.category,...(icon.aliases??[])].some(text=>text.toLowerCase().includes(q))):icons;},[icons,search]);
  return <Modal title={t('pickFromLibrary')} icon={<Sparkles/>} size="3xl" onClose={onClose} initialFocusRef={first}>
    <Input ref={first} type="search" aria-label={t('searchIcons')} placeholder={t('searchIcons')} className="mb-5 min-h-11" value={search} onChange={event=>setSearch(event.target.value)}/>
    {loading?<p role="status" className="py-12 text-center text-sm text-fg-secondary">{t('loading')}</p>:error?<div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{error}</p><Button size="lg" variant="secondary" onClick={()=>setAttempt(value=>value+1)}>{t('retry')}</Button></div>:filtered.length===0?<p role="status" className="py-12 text-center text-sm text-fg-secondary">{t(search.trim()?'noIconsFound':'noIconsAvailable')}</p>:<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {filtered.map(icon=><button type="button" key={icon.id} onClick={()=>onPick(icon)} className="flex min-w-0 flex-col gap-3 rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-3 text-start hover:border-[var(--brand-ink)] hover:bg-[var(--brand-soft)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon.image_url} alt="" className="aspect-square w-full rounded-r-sm object-contain" loading="lazy"/>
        <span className="break-words text-sm font-semibold">{icon.name}</span>{icon.category&&<span className="break-words text-xs text-fg-secondary">{icon.category}</span>}
      </button>)}
    </div>}
  </Modal>;
}
