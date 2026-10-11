'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HistoryIcon, RotateCcwIcon } from 'lucide-react';
import { Button, ConfirmDialog } from '@/components/ds';
import { labListRecipeVersions, labRestoreRecipeVersion } from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import type { DraftPayload, RecipeVersion } from '../types';

/** Restore the actual item recipe and resume later phases without restoring twice. */
export function VersionHistory({restaurantId,menuItemId,canManage,runAction,onRestored}:{restaurantId:number;menuItemId:number;canManage:boolean;runAction:<T>(task:(canonical:DraftPayload)=>Promise<T>)=>Promise<T>;onRestored:(payload?:DraftPayload)=>Promise<void>}) {
  const {t,locale}=useI18n();const {money}=useCurrency();
  const [versions,setVersions]=useState<RecipeVersion[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [pending,setPending]=useState<RecipeVersion|null>(null);
  const [busy,setBusy]=useState(false);
  const [resume,setResume]=useState(false);
  const receipt=useRef<{payload:DraftPayload;draftQueued:boolean;draftSaved:boolean}|null>(null);
  const request=useRef({value:0});
  const load=useCallback(async()=>{const sequence=++request.current.value;setLoading(true);try{const items=await labListRecipeVersions(restaurantId,menuItemId);if(sequence===request.current.value){setVersions(items);setError(null);}}finally{if(sequence===request.current.value)setLoading(false);}},[restaurantId,menuItemId]);
  useEffect(()=>{const scope=request.current;void load().catch(cause=>setError(cause instanceof Error?cause.message:String(cause)));return()=>{scope.value+=1;};},[load]);
  const restore=async(version?:RecipeVersion)=>{if(!canManage||busy)return;setPending(null);setBusy(true);setError(null);try{await runAction(async()=>{if(!receipt.current){if(!version)return;receipt.current={payload:await labRestoreRecipeVersion(restaurantId,menuItemId,version.id),draftQueued:false,draftSaved:false};}setResume(true);if(!receipt.current.draftSaved){const payload=receipt.current.draftQueued?undefined:receipt.current.payload;receipt.current.draftQueued=true;await onRestored(payload);receipt.current.draftSaved=true;}await load();receipt.current=null;setResume(false);});}catch(cause){setError(cause instanceof Error?cause.message:String(cause));}finally{setBusy(false);}};
  return <section className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4"><h3 className="flex items-center gap-2 text-base font-semibold"><HistoryIcon className="h-4 w-4" />{t('labVersions')}</h3>{loading&&<p role="status" className="mt-3 text-sm">{t('loading')}</p>}{error&&<div role="alert" className="mt-3 text-sm text-[var(--danger-500)]"><p>{error}</p>{resume&&<p>{t('labRestoreSavedHint')}</p>}<Button variant="secondary" disabled={busy} onClick={()=>{if(resume)void restore();else void load().catch(cause=>setError(cause instanceof Error?cause.message:String(cause)));}}>{t('retry')}</Button></div>}{!loading&&!error&&versions.length===0&&<p className="mt-3 text-sm text-[var(--fg-muted)]">{t('labNoVersions')}</p>}
    <ul className="mt-3 space-y-2">{versions.map(version=><li key={version.id} className="flex items-center gap-2 border-t border-[var(--line)] py-2"><div className="min-w-0 flex-1"><p className="text-sm font-semibold"><bdi>v{version.version}</bdi> · <bdi>{money(version.food_cost)}</bdi></p><p className="text-xs text-[var(--fg-muted)]">{new Date(version.created_at).toLocaleString(locale)}</p>{version.change_summary&&<p dir="auto" className="mt-1 text-sm">{version.change_summary}</p>}</div><Button icon variant="ghost" aria-label={`${t('labRestore')} v${version.version}`} onClick={()=>setPending(version)} disabled={!canManage||busy||resume}><RotateCcwIcon /></Button></li>)}</ul>
    <ConfirmDialog open={pending!=null} onOpenChange={value=>{if(!value)setPending(null);}} title={t('labRestore')} description={<>{t('labRestoreConfirm').replace('{version}',String(pending?.version??''))} {t('labRestoreLiveHint')}</>} confirmLabel={t('labRestore')} cancelLabel={t('cancel')} danger onConfirm={()=>{if(pending)void restore(pending);}} />
  </section>;
}
