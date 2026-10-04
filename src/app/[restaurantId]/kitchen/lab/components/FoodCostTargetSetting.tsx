'use client';
import { useEffect, useRef, useState } from 'react';
import { getFoodCostTarget, setFoodCostTarget } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

/** Read and update the server target, preserving historical percentage choices. */
export function FoodCostTargetSetting({restaurantId,canManage}:{restaurantId:number;canManage:boolean}) {
  const {t}=useI18n();
  const [pct,setPct]=useState<number|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [attempt,setAttempt]=useState(0);
  const lock=useRef(false);
  useEffect(()=>{let active=true;setBusy(true);setError(null);getFoodCostTarget(restaurantId).then(r=>{if(active)setPct(r.food_cost_target_pct);}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:String(cause));}).finally(()=>{if(active)setBusy(false);});return()=>{active=false;};},[restaurantId,attempt]);
  const change=async(value:number)=>{if(!canManage||lock.current||busy)return;lock.current=true;setBusy(true);setError(null);try{const saved=await setFoodCostTarget(restaurantId,value);setPct(saved.food_cost_target_pct);}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{lock.current=false;setBusy(false);}};
  const choices=Array.from(new Set([.25,.30,.35,.40,...(pct!=null?[pct]:[])])).sort((a,b)=>a-b);
  return <div><label className="flex flex-wrap items-center gap-2 text-sm"><span className="text-[var(--fg-muted)]">{t('labTargetSetting')}</span>{canManage?<select dir="ltr" value={pct??''} disabled={busy||pct==null} onChange={e=>void change(Number(e.target.value))} className="h-11 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-semibold"><option disabled value="">{busy?t('loading'):'—'}</option>{choices.map(value=><option key={value} value={value}>≤ {Number((value*100).toFixed(2))}%</option>)}</select>:<span dir="ltr" className="font-semibold tabular-nums">{pct==null?'—':`≤ ${Number((pct*100).toFixed(2))}%`}</span>}</label><p className="mt-1 max-w-xs text-xs leading-5 text-[var(--fg-muted)]">{t('labTargetApplies')}</p>{error&&<div role="alert" className="mt-2 max-w-sm text-sm text-[var(--danger-500)]"><p>{error}</p><Button variant="secondary" disabled={busy} onClick={()=>setAttempt(x=>x+1)}>{t('retry')}</Button></div>}</div>;
}
