'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeftIcon,
  CheckIcon,
  FlaskConicalIcon,
  LoaderCircleIcon,
  Trash2Icon,
} from 'lucide-react';
import { labGetDraft, labCommitDraft, labDiscardDraft, labPatchDraft } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button } from '@/components/ds';
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
import type { DraftPayload, Draft } from './types';

/** AI-assisted creation and review workspace for profitable restaurant recipes. */
export default function RecipeLabPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = parseInt(params.restaurantId, 10);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');
  const { refetch: refetchQueue } = useDraftQueue(restaurantId);

  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [entryMode, setEntryMode] = useState<LabEntryMode | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);

  useEffect(() => {
    if (activeDraftId == null) {
      setDraft(null);
      setPayload(null);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    labGetDraft(restaurantId, activeDraftId)
      .then((nextDraft) => {
        if (cancelled) return;
        setDraft(nextDraft);
        setPayload(nextDraft.payload ? normalizePayload(nextDraft.payload) : null);
        setAutosaveState('idle');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error('Failed to load draft', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to load draft');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [restaurantId, activeDraftId]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const updatePayload = useCallback((next: DraftPayload) => {
    setPayload(next);
    if (!canManage || activeDraftId == null) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const sequence = ++saveSequence.current;
    setAutosaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        const recalculated = await labPatchDraft(restaurantId, activeDraftId, next);
        if (saveSequence.current === sequence) {
          setPayload(normalizePayload(recalculated));
          setAutosaveState('saved');
        }
      } catch (error) {
        console.error('Draft autosave failed', error);
        if (saveSequence.current === sequence) setAutosaveState('error');
      }
    }, 550);
  }, [activeDraftId, canManage, restaurantId]);

  const handleSave = useCallback(async () => {
    if (!payload || activeDraftId == null) return;
    if (draft?.menu_item_id != null && payload.has_existing_recipe !== false && !window.confirm(t('labReplaceConfirm').replace('{name}', draft.dish_name))) return;

    setSubmitting(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const recalculated = await labPatchDraft(restaurantId, activeDraftId, payload);
      await labCommitDraft(restaurantId, activeDraftId, recalculated);
      setActiveDraftId(null);
      refetchQueue();
    } catch (error) {
      console.error('Commit failed', error);
      window.alert(t('labSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [restaurantId, activeDraftId, payload, draft, refetchQueue, t]);

  const handleDiscard = useCallback(async () => {
    if (activeDraftId == null) return;
    setSubmitting(true);
    try {
      await labDiscardDraft(restaurantId, activeDraftId);
      setActiveDraftId(null);
      refetchQueue();
    } catch (error) {
      console.error('Discard failed', error);
    } finally {
      setSubmitting(false);
    }
  }, [restaurantId, activeDraftId, refetchQueue]);

  const handleSellingPriceChange = useCallback((sellingPrice: number | undefined) => {
    if (!payload) return;
    updatePayload({ ...payload, cost_summary: { ...payload.cost_summary, selling_price: sellingPrice } });
  }, [payload, updatePayload]);

  const retryLoad = () => {
    const id = activeDraftId;
    setActiveDraftId(null);
    requestAnimationFrame(() => setActiveDraftId(id));
  };

  const isManual = payload?.creation_mode === 'manual';

  return (
    <div className="min-h-full bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-4 px-5 py-5 sm:px-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--brand-500)] text-white shadow-[var(--shadow-1)]">
              <FlaskConicalIcon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.025em]">{t('labTitle')}</h1>
              <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{t('labSubtitle')}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            {(activeDraftId != null || entryMode != null) && (
              <>
                <ProgressSteps reviewing={activeDraftId != null} manual={isManual || entryMode === 'manual'} />
                <div className="hidden h-7 w-px bg-[var(--line)] sm:block" />
              </>
            )}
            <FoodCostTargetSetting restaurantId={restaurantId} canManage={canManage} />
          </div>
        </div>
      </header>

      {activeDraftId == null ? (
        <main className="mx-auto max-w-[1320px] px-4 py-7 sm:px-7 sm:py-9">
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              {entryMode == null ? (
                <LabEntryChoice onChoose={setEntryMode} />
              ) : (
                <>
                  <button type="button" onClick={() => setEntryMode(null)} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
                    <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" /> {t('labBackToChoices')}
                  </button>
                  {entryMode === 'manual' ? (
                    <ManualRecipeStarter
                      restaurantId={restaurantId}
                      canManage={canManage}
                      onCreated={(draftId) => { setActiveDraftId(draftId); refetchQueue(); }}
                    />
                  ) : (
                    <>
                      <div className="mb-6 max-w-3xl">
                        <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--fg)] sm:text-4xl">{t('labBriefHeading')}</h2>
                        <p className="mt-2 max-w-2xl text-base leading-7 text-[var(--fg-muted)]">{t('labBriefIntro')}</p>
                      </div>
                      <DraftInputRail restaurantId={restaurantId} onAfterGenerate={refetchQueue} canManage={canManage} />
                    </>
                  )}
                </>
              )}
            </div>
            <aside className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)] xl:sticky xl:top-5">
              <h2 className="text-base font-semibold text-[var(--fg)]">{t('labDraftsTitle')}</h2>
              <p className="mt-1 mb-4 text-xs leading-5 text-[var(--fg-muted)]">{t('labDraftsHelp')}</p>
              <DraftQueue restaurantId={restaurantId} activeDraftId={activeDraftId} onSelect={setActiveDraftId} />
            </aside>
          </div>
        </main>
      ) : (
        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 sm:py-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setActiveDraftId(null)} className="inline-flex items-center gap-2 text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
              <ArrowLeftIcon className="h-4 w-4 rtl:rotate-180" /> {t('labBackToBriefs')}
            </button>
            <AutosaveStatus state={autosaveState} />
          </div>

          {loading && (
            <div className="flex min-h-[420px] items-center justify-center gap-2 text-sm text-[var(--fg-muted)]">
              <LoaderCircleIcon className="h-5 w-5 animate-spin" /> {t('labLoading')}
            </div>
          )}

          {!loading && loadError && (
            <div className="rounded-[14px] border border-[var(--danger-500)] bg-[var(--danger-50)] p-5 text-sm text-[var(--danger-500)]">
              <p>{loadError}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={retryLoad}>{t('retry')}</Button>
            </div>
          )}

          {!loading && !loadError && payload && (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
              <div className="order-1 xl:col-span-2">
                <CostSummaryHeader payload={payload} onSellingPriceChange={handleSellingPriceChange} canManage={canManage} />
              </div>

              <aside className="order-2 space-y-4 xl:order-3 xl:sticky xl:top-5">
                {isManual ? (
                  <ManualValidationPanel payload={payload} canManage={canManage} submitting={submitting} onSave={handleSave} />
                ) : (
                  <IntelligencePanel
                    payload={payload}
                    canManage={canManage}
                    submitting={submitting}
                    onSave={handleSave}
                    onRefine={() => setRefineOpen(true)}
                  />
                )}
                {draft?.menu_item_id != null && (
                  <VersionHistory restaurantId={restaurantId} menuItemId={draft.menu_item_id} canManage={canManage} onRestored={(restored) => updatePayload(normalizePayload(restored))} />
                )}
              </aside>

              <div className="order-3 min-w-0 space-y-4 xl:order-2">
                <RecipeTree restaurantId={restaurantId} payload={payload} onChange={updatePayload} canManage={canManage} />
                {!isManual && (
                  <ImageStudio
                    restaurantId={restaurantId}
                    draftId={activeDraftId}
                    currentImage={payload.selected_image_url}
                    disabled={!canManage || autosaveState === 'saving'}
                    onConfirmed={(url) => setPayload((current) => current ? { ...current, selected_image_url: url } : current)}
                  />
                )}
                {canManage && (
                  <div className="flex justify-end pt-2">
                    <button type="button" onClick={handleDiscard} disabled={submitting} className="inline-flex items-center gap-2 rounded-[8px] px-3 py-2 text-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:opacity-50">
                      <Trash2Icon className="h-3.5 w-3.5" /> {t('labDeleteDraft')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      )}

      <RefineDrawer
        restaurantId={restaurantId}
        draftId={activeDraftId}
        open={refineOpen && canManage && !isManual}
        onClose={() => setRefineOpen(false)}
        onPatches={(patches) => { if (payload) updatePayload(applyPatches(payload, patches)); }}
      />
    </div>
  );
}

function ProgressSteps({ reviewing, manual }: { reviewing: boolean; manual: boolean }) {
  const { t } = useI18n();
  const steps = manual
    ? [t('labManualStepDish'), t('labManualStepCompose'), t('labManualStepSave')]
    : [t('labStepBrief'), t('labStepProposals'), t('labStepFinalize')];
  const activeIndex = reviewing ? 1 : 0;
  return (
    <ol className="hidden items-center sm:flex">
      {steps.map((label, index) => (
        <li key={label} className="flex items-center">
          {index > 0 && <span className={`mx-2 h-px w-6 ${index <= activeIndex ? 'bg-[var(--brand-500)]' : 'bg-[var(--line-strong)]'}`} />}
          <span className={`flex items-center gap-1.5 text-xs font-medium ${index === activeIndex ? 'text-[var(--fg)]' : index < activeIndex ? 'text-[var(--brand-500)]' : 'text-[var(--fg-subtle)]'}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${index === activeIndex ? 'bg-[var(--brand-500)] text-white' : index < activeIndex ? 'bg-[color-mix(in_oklab,var(--brand-500)_12%,var(--surface))] text-[var(--brand-500)]' : 'border border-[var(--line-strong)]'}`}>
              {index < activeIndex ? <CheckIcon className="h-3 w-3" /> : index + 1}
            </span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function AutosaveStatus({ state }: { state: 'idle' | 'saving' | 'saved' | 'error' }) {
  const { t } = useI18n();
  if (state === 'idle') return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${state === 'error' ? 'text-[var(--danger-500)]' : 'text-[var(--fg-muted)]'}`}>
      {state === 'saving' && <LoaderCircleIcon className="h-3.5 w-3.5 animate-spin" />}
      {state === 'saved' && <CheckIcon className="h-3.5 w-3.5 text-[var(--success-500)]" />}
      {state === 'saving' ? t('labAutosaving') : state === 'saved' ? t('labAutosaved') : t('labAutosaveFailed')}
    </span>
  );
}

function normalizePayload(payload: DraftPayload): DraftPayload {
  return {
    ...payload,
    creation_mode: payload.creation_mode ?? 'ai',
    brief: payload.brief ?? { objective: 'refresh_menu', stock_policy: 'prefer_existing', creativity: 45 },
    context: payload.context ?? { currency: 'ILS', average_price: 0, min_price: 0, max_price: 0 },
    creative: payload.creative ?? {},
    metrics: payload.metrics ?? { stock_reuse_pct: 0, menu_fit_score: 0, operational_score: 0, complexity_score: 0, prep_count: 0, ingredient_count: payload.components?.length ?? 0 },
    revision: payload.revision ?? 0,
    cost_summary: {
      ...payload.cost_summary,
      verified_cost: payload.cost_summary.verified_cost ?? payload.cost_summary.total_estimated_cost,
      estimated_cost: payload.cost_summary.estimated_cost ?? 0,
      unknown_cost_count: payload.cost_summary.unknown_cost_count ?? 0,
      cost_status: payload.cost_summary.cost_status ?? 'verified',
    },
  };
}
