'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  CheckIcon,
  FlaskConicalIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import { labGetDraft, labCommitDraft, labDiscardDraft, labRefineDraft } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog } from '@/components/ds';
import { useDraftQueue } from './hooks/useDraftQueue';
import { applyPatches } from './hooks/useDraftPatches';
import { DraftInputRail } from './components/DraftInputRail';
import { DraftQueue } from './components/DraftQueue';
import { CostSummaryHeader } from './components/CostSummaryHeader';
import { RecipeTree } from './components/RecipeTree';
import { RefineDrawer } from './components/RefineDrawer';
import { FoodCostTargetSetting } from './components/FoodCostTargetSetting';
import { IntelligencePanel } from './components/IntelligencePanel';
import { ImageStudio } from './components/ImageStudio';
import { VersionHistory } from './components/VersionHistory';
import { LabEntryChoice, type LabEntryMode } from './components/LabEntryChoice';
import { ManualRecipeStarter } from './components/ManualRecipeStarter';
import { ManualValidationPanel } from './components/ManualValidationPanel';
import { RecipeTextImporter } from './components/RecipeTextImporter';
import { normalizeLabDraftPayload } from './normalizePayload';
import type { DraftPayload, Draft } from './types';

import { useDraftAutosave } from './hooks/useDraftAutosave';

/** Restaurant-scoped workspace for reviewing and saving manual or assisted recipes. */
export default function RecipeLabPage() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  return <LabWorkspace key={restaurantId} restaurantId={Number(restaurantId)} />;
}

function LabWorkspace({ restaurantId }: { restaurantId: number }) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const queue = useDraftQueue(restaurantId);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [entryMode, setEntryMode] = useState<LabEntryMode | null>(null);
  const [entryBusy, setEntryBusy] = useState(false);
  const [entryDirty,setEntryDirty]=useState(false);
  const [entryAction,setEntryAction]=useState<(() => void) | null>(null);
  const leaveEntry=(action:()=>void)=>{if(entryDirty)setEntryAction(()=>action);else action();};
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(entryBusy||entryDirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[entryBusy,entryDirty]);
  const [notice, setNotice] = useState<string | null>(null);
  const completed = (id: number, message: string) => { queue.remove(id); setActiveDraftId(null); setNotice(message); void queue.refetch(); };
  return <div className="min-h-full min-w-0 text-[var(--fg)]">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] pb-5">
      <div className="flex items-start gap-3"><span className="rounded-[8px] bg-[var(--summary-bg)] p-3 text-[var(--summary-fg)]"><FlaskConicalIcon className="h-5 w-5" /></span><div><h1 className="text-2xl font-semibold tracking-tight">{t('labTitle')}</h1><p className="mt-1 text-sm text-[var(--fg-muted)]">{t('labSubtitle')}</p></div></div>
      <FoodCostTargetSetting restaurantId={restaurantId} canManage={canManage && !entryBusy && activeDraftId == null} />
    </header>
    {notice && <p role="status" className="mb-4 rounded-[8px] border border-[var(--line)] bg-[var(--success-50)] p-3 text-sm text-[var(--fg)]">{notice}</p>}
    {activeDraftId == null ? <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div>{entryMode == null ? <LabEntryChoice onChoose={mode => { setNotice(null); setEntryMode(mode); }} /> : <>
        <Button variant="ghost" disabled={entryBusy} className="mb-4" onClick={() => leaveEntry(() => setEntryMode(null))}><ArrowLeftIcon className="rtl:rotate-180" />{t('labBackToChoices')}</Button>
        {entryMode === 'manual' ? <ManualRecipeStarter restaurantId={restaurantId} canManage={canManage} onBusyChange={setEntryBusy} onCreated={id => { setActiveDraftId(id); void queue.refetch(); }} /> : <>
          <div className="mb-4"><h2 className="text-xl font-semibold">{t('labBriefHeading')}</h2><p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">{t('labBriefIntro')}</p></div>
          <DraftInputRail onDirtyChange={setEntryDirty} restaurantId={restaurantId} canManage={canManage} onBusyChange={setEntryBusy} onAfterGenerate={drafts => { queue.add(drafts); void queue.refetch(); }} />
        </>}
      </>}</div>
      <aside aria-label={t('labDraftsTitle')} className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-4 xl:sticky xl:top-5"><h2 className="text-base font-semibold">{t('labDraftsTitle')}</h2><p className="mb-4 mt-1 text-sm leading-5 text-[var(--fg-muted)]">{t('labDraftsHelp')}</p><DraftQueue state={queue} activeDraftId={activeDraftId} disabled={entryBusy} onSelect={id => leaveEntry(() => {setNotice(null);setActiveDraftId(id);})} /></aside>
    </div> : <DraftLoader key={activeDraftId} restaurantId={restaurantId} draftId={activeDraftId} canManage={canManage} onBack={() => { setActiveDraftId(null); void queue.refetch(); }} onDone={message => completed(activeDraftId, message)} />}
    <ConfirmDialog open={entryAction!=null} onOpenChange={open=>{if(!open)setEntryAction(null);}} title={t('discardChanges')} description={t('labLeaveUnsaved')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={()=>{entryAction?.();setEntryAction(null);setEntryDirty(false);}} />
  </div>;
}

function DraftLoader({ restaurantId, draftId, canManage, onBack, onDone }: { restaurantId: number; draftId: number; canManage: boolean; onBack: () => void; onDone: (message: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => { try { const next = await labGetDraft(restaurantId, draftId); if (active) { setDraft(next); setError(null); if (next.status === 'generating') timer = setTimeout(load, 3000); } } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : t('labOperationFailed')); } };
    void load(); return () => { active = false; clearTimeout(timer); };
  }, [restaurantId, draftId, attempt, t]);
  if (draft?.status === 'ready' && draft.payload && !error) return <DraftEditor key={draft.id} restaurantId={restaurantId} draft={draft} canManage={canManage} onBack={onBack} onDone={onDone} />;
  return <div className="space-y-4"><Button variant="ghost" onClick={onBack}><ArrowLeftIcon className="rtl:rotate-180" />{t('labBackToBriefs')}</Button>{error ? <div role="alert" className="text-[var(--danger-500)]"><p>{error}</p><Button variant="secondary" onClick={() => setAttempt(x => x+1)}>{t('retry')}</Button></div> : <div role="status" className="rounded-[8px] border border-[var(--line)] p-6"><p className="font-semibold" dir="auto">{draft?.dish_name}</p><p>{draft ? t(`labDraftStatus_${draft.status}`) : t('labLoading')}</p>{draft?.error_message && <p>{draft.error_message}</p>}{draft?.status === 'error' && <Button variant="secondary" onClick={() => setAttempt(x => x+1)}>{t('retry')}</Button>}</div>}</div>;
}

function DraftEditor({ restaurantId, draft, canManage, onBack, onDone }: { restaurantId: number; draft: Draft; canManage: boolean; onBack: () => void; onDone: (message: string) => void }) {
  const { t } = useI18n();
  const save = useDraftAutosave(restaurantId, draft.id, draft.payload!, canManage);
  const { payload } = save;
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'commit' | 'discard' | 'leave' | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [captureDirty,setCaptureDirty]=useState(false);
  const [refineDirty,setRefineDirty]=useState(false);
  const [commitUncertain, setCommitUncertain] = useState(false);
  const isManual = payload.creation_mode === 'manual';
  const editable = canManage && !busy && !commitUncertain;

  useEffect(() => { const beforeUnload = (event: BeforeUnloadEvent) => { if (save.dirty || busy || commitUncertain || captureDirty || refineDirty) {event.preventDefault();event.returnValue='';} }; window.addEventListener('beforeunload', beforeUnload);return () => window.removeEventListener('beforeunload', beforeUnload); }, [save.dirty,busy,commitUncertain,captureDirty,refineDirty]);

  const runAction = async <T,>(action: (canonical: DraftPayload) => Promise<T>, persist = true): Promise<T> => {
    if (!canManage || lock.current || commitUncertain) throw new Error(t('labActionPending'));
    lock.current = true;setBusy(true);setError(null);
    try { if (!persist) await save.settle(); return await action(persist ? await save.flush() : payload); } finally { lock.current=false;setBusy(false); }
  };
  const back = async () => {
    if (lock.current || commitUncertain) return;
    lock.current=true;setBusy(true);
    try {await save.flush();if(captureDirty || refineDirty)setConfirm('leave');else onBack();} catch {setConfirm('leave');} finally {lock.current=false;setBusy(false);}
  };
  const commit = async () => {
    if (!canManage || lock.current) return;
    lock.current=true;setBusy(true);setError(null);setConfirm(null);
    try {
      if (commitUncertain) {
        const current = await labGetDraft(restaurantId,draft.id);
        if (current.status === 'committed') { onDone(t('labRecipeSaved')); return; }
        if (current.status !== 'ready') throw new Error(t(`labDraftStatus_${current.status}`));
        setCommitUncertain(false);
      }
      const canonical = await save.flush();
      // A lost commit response must be reconciled with GET before any further PATCH.
      setCommitUncertain(true);
      await labCommitDraft(restaurantId,draft.id,canonical);
      onDone(t('labRecipeSaved'));
    } catch (cause) {setError(cause instanceof Error ? cause.message : t('labSaveFailed'));} finally {lock.current=false;setBusy(false);}
  };
  const requestCommit = () => { if (draft.menu_item_id != null && payload.has_existing_recipe !== false) setConfirm('commit'); else void commit(); };
  const discard = async () => {
    setConfirm(null);
    try { await runAction(async () => { await labDiscardDraft(restaurantId,draft.id);onDone(t('labDraftRemoved')); }, false); }
    catch (cause) {setError(cause instanceof Error ? cause.message : t('labOperationFailed'));}
  };
  const refine = (message: string) => runAction(async canonical => {
    const result = await labRefineDraft(restaurantId,draft.id,message);
    if (result.patches.length) save.update(applyPatches(canonical,result.patches));
    return result;
  });
  return <div className="min-w-0">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => void back()} disabled={busy || commitUncertain}><ArrowLeftIcon className="rtl:rotate-180" />{t('labBackToBriefs')}</Button><div className="flex flex-wrap items-center gap-2"><AutosaveStatus state={save.state} />{save.state === 'error' && <Button variant="secondary" disabled={busy || commitUncertain} onClick={() => void save.flush().catch(() => undefined)}>{t('retry')}</Button>}</div></div>
    {save.error && <p role="alert" className="mb-4 text-sm text-[var(--danger-500)]">{save.error}</p>}
    {error && <div role="alert" className="mb-4 rounded-[8px] border border-[var(--danger-action)] p-3 text-sm"><p>{error}</p>{commitUncertain && <><p className="mt-1">{t('labCommitCheckHint')}</p><Button className="mt-2" disabled={busy} onClick={() => void commit()}>{t('retry')}</Button></>}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="order-1 xl:col-span-2"><CostSummaryHeader payload={payload} canManage={editable} onSellingPriceChange={selling_price => save.update({...payload,cost_summary:{...payload.cost_summary,selling_price}})} /></div>
      {canManage && <div className="sticky z-10 order-2 flex items-center justify-between gap-3 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface)] p-3 xl:hidden" style={{top:'calc(var(--topbar-total-h) + 8px)'}}><span className="text-sm">{t('labFoodCostPct')}<strong dir="ltr" className="ms-2 tabular-nums">{payload.cost_summary.food_cost_pct == null ? '—' : `${(payload.cost_summary.food_cost_pct*100).toFixed(0)}%`}</strong></span><Button onClick={requestCommit} disabled={!editable || payload.components.length===0}>{busy ? <LoaderCircleIcon className="animate-spin" /> : <CheckIcon />}{isManual ? t('labSaveManualRecipe') : t('labSaveRecipe')}</Button></div>}
      <aside className="order-4 space-y-4 xl:order-3 xl:sticky xl:top-5">{isManual ? <ManualValidationPanel payload={payload} canManage={canManage} submitting={!editable} onSave={requestCommit} /> : <IntelligencePanel payload={payload} canManage={canManage} submitting={!editable || payload.components.length===0} onSave={requestCommit} onRefine={() => setRefineOpen(true)} />}
        {draft.menu_item_id != null && <VersionHistory restaurantId={restaurantId} menuItemId={draft.menu_item_id} canManage={editable} runAction={runAction} onRestored={async restored => { if(restored) save.update(normalizeLabDraftPayload(restored)); await save.flush(); }} />}
      </aside>
      <div className="order-3 min-w-0 space-y-4 xl:order-2">{isManual && <RecipeTextImporter onDirtyChange={setCaptureDirty} restaurantId={restaurantId} draftId={draft.id} payload={payload} canManage={editable} onChange={save.update} />}
        <RecipeTree restaurantId={restaurantId} payload={payload} onChange={save.update} canManage={editable} />
        {!isManual && <ImageStudio restaurantId={restaurantId} draftId={draft.id} currentImage={payload.selected_image_url} disabled={!editable} runAction={runAction} onConfirmed={(url, canonical) => save.accept({...canonical,selected_image_url:url})} />}
        {canManage && <div className="flex justify-end"><Button variant="ghost" onClick={() => setConfirm('discard')} disabled={!editable}><Trash2Icon />{t('labDeleteDraft')}</Button></div>}
      </div>
    </div>
    <RefineDrawer onDirtyChange={setRefineDirty} open={refineOpen && canManage && !isManual} initialHistory={draft.chat_history ?? []} onClose={() => setRefineOpen(false)} onSend={refine} />
    <ConfirmDialog open={confirm != null} onOpenChange={open => {if (!open) setConfirm(null);}} title={confirm === 'discard' ? t('labDeleteDraft') : confirm === 'leave' ? t('discardChanges') : t('labSaveRecipe')} description={confirm === 'discard' ? t('labDiscardConfirm') : confirm === 'leave' ? t('labLeaveUnsaved') : t('labReplaceConfirm').replace('{name}',draft.dish_name)} confirmLabel={confirm === 'discard' ? t('delete') : confirm === 'leave' ? t('discardChanges') : t('labSaveRecipe')} cancelLabel={t('cancel')} danger={confirm !== 'commit'} onConfirm={() => {if(confirm==='discard') void discard();else if(confirm==='leave')onBack();else void commit();}} />
  </div>;
}

function AutosaveStatus({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  const { t } = useI18n();
  if (state === 'idle') return null;
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 text-xs ${state === 'error' ? 'text-[var(--danger-500)]' : 'text-[var(--fg-muted)]'}`}>
      {state === 'saving' && <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin" />}
      {state === 'saved' && <CheckIcon className="h-3.5 w-3.5 text-[var(--success-500)]" />}
      {state === 'saving' ? t('labAutosaving') : state === 'saved' ? t('labAutosaved') : t('labAutosaveFailed')}
    </span>
  );
}
