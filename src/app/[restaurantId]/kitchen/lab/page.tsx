'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { labGetDraft, labCommitDraft, labDiscardDraft, labPatchDraft } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
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
import type { DraftPayload, Draft } from './types';

/**
 * Recipe Lab — AI-assisted recipe generation entry point.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Header: Recipe Lab title                                  │
 *   ├──────────┬───────────────────────────────────────────────┤
 *   │ Left     │ Main (draft reviewer)                         │
 *   │ aside    │                                               │
 *   │ Input    │  ┌──────────────────────────────────────────┐ │
 *   │ rail     │  │ CostSummaryHeader                        │ │
 *   │ ──────── │  │ RecipeTree                               │ │
 *   │ Drafts   │  │ ── sticky footer: Discard | Save ──      │ │
 *   │ queue    │  └──────────────────────────────────────────┘ │
 *   └──────────┴───────────────────────────────────────────────┘
 */
export default function RecipeLabPage() {
  const params = useParams<{ restaurantId: string }>();
  const restaurantId = parseInt(params.restaurantId, 10);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManage = hasAnyPermission('kitchen.manage');

  const { refetch: refetchQueue } = useDraftQueue(restaurantId);

  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);

  // ── Fetch the active draft whenever the selection changes ──────────────

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
      .then((d) => {
        if (cancelled) return;
        setDraft(d);
        setPayload(d.payload ? normalizePayload(d.payload) : null);
        setAutosaveState('idle');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error('Failed to load draft', e);
        setLoadError(e instanceof Error ? e.message : 'Failed to load draft');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
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

  // ── Commit (save) the current draft ────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!payload || activeDraftId == null) return;

    // Re-running on an existing menu item → confirm replace.
    if (draft?.menu_item_id != null) {
      const ok = window.confirm(
        t('labReplaceConfirm').replace('{name}', draft.dish_name),
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const recalculated = await labPatchDraft(restaurantId, activeDraftId, payload);
      await labCommitDraft(restaurantId, activeDraftId, recalculated);
      setActiveDraftId(null);
      refetchQueue();
    } catch (e: unknown) {
      console.error('Commit failed', e);
      window.alert(t('labSaveFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [restaurantId, activeDraftId, payload, draft, refetchQueue, t]);

  // ── Discard the current draft ───────────────────────────────────────────

  const handleDiscard = useCallback(async () => {
    if (activeDraftId == null) return;
    setSubmitting(true);
    try {
      await labDiscardDraft(restaurantId, activeDraftId);
      setActiveDraftId(null);
      refetchQueue();
    } catch (e: unknown) {
      console.error('Discard failed', e);
    } finally {
      setSubmitting(false);
    }
  }, [restaurantId, activeDraftId, refetchQueue]);

  // ── Selling-price change helper ─────────────────────────────────────────

  const handleSellingPriceChange = useCallback(
    (sp: number | undefined) => {
      if (!payload) return;
      updatePayload({
        ...payload,
        cost_summary: { ...payload.cost_summary, selling_price: sp },
      });
    },
    [payload, updatePayload],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--fg)]">✨ {t('labTitle')}</h1>
        <FoodCostTargetSetting restaurantId={restaurantId} canManage={canManage} />
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left aside: input rail + drafts queue */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-[var(--line)] p-4 lg:block lg:space-y-6">
          <DraftInputRail
            restaurantId={restaurantId}
            onAfterGenerate={refetchQueue}
            canManage={canManage}
          />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
              Drafts
            </p>
            <DraftQueue
              restaurantId={restaurantId}
              activeDraftId={activeDraftId}
              onSelect={setActiveDraftId}
            />
          </div>
        </aside>

        {/* Main panel: draft reviewer */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <details className="mb-4 rounded-xl border border-[var(--line)] p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--fg)]">{t('labAddDishes')}</summary>
            <div className="mt-4 space-y-5">
              <DraftInputRail restaurantId={restaurantId} onAfterGenerate={refetchQueue} canManage={canManage} />
              <DraftQueue restaurantId={restaurantId} activeDraftId={activeDraftId} onSelect={setActiveDraftId} />
            </div>
          </details>
          {/* Empty state */}
          {activeDraftId == null && (
            <div
              className="flex h-full items-center justify-center"
              style={{ color: 'var(--fg-muted)' }}
            >
              <p className="text-sm">{t('labEmptyState')}</p>
            </div>
          )}

          {/* Loading state */}
          {activeDraftId != null && loading && (
            <p className="text-sm" style={{ color: 'var(--fg-muted)' }}>
              {t('labLoading')}
            </p>
          )}

          {/* Error state */}
          {activeDraftId != null && !loading && loadError && (
            <div style={{ color: 'rgb(220,38,38)' }}>
              <p className="text-sm">{loadError}</p>
              <button
                onClick={() => {
                  // Re-trigger the effect by momentarily clearing + restoring.
                  const id = activeDraftId;
                  setActiveDraftId(null);
                  requestAnimationFrame(() => setActiveDraftId(id));
                }}
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid rgb(220,38,38)',
                  background: 'transparent',
                  color: 'rgb(220,38,38)',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Loaded state */}
          {activeDraftId != null && !loading && !loadError && payload && (
            <div className="mx-auto grid max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="min-w-0">
                <div className="mb-2 flex justify-end text-[11px] text-[var(--fg-muted)]">
                  {autosaveState === 'saving' && t('labAutosaving')}
                  {autosaveState === 'saved' && t('labAutosaved')}
                  {autosaveState === 'error' && <span className="text-red-600">{t('labAutosaveFailed')}</span>}
                </div>
                <CostSummaryHeader
                  payload={payload}
                  onSellingPriceChange={handleSellingPriceChange}
                  canManage={canManage}
                />

                <RecipeTree payload={payload} onChange={updatePayload} canManage={canManage} />

              {/* Sticky action footer */}
                <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  marginTop: 24,
                  padding: '12px 0',
                  borderTop: '1px solid var(--line)',
                  background: 'var(--bg, white)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                }}
                >
                {canManage && (
                  <button
                    onClick={() => setRefineOpen(true)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid var(--line)',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 14,
                      color: 'var(--fg)',
                    }}
                  >
                    {t('labRefineTitle')}
                  </button>
                )}

                <div style={{ flex: 1 }} />

                {canManage && (
                  <button
                    onClick={handleDiscard}
                    disabled={submitting}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      border: '1px solid var(--line)',
                      background: 'transparent',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      opacity: submitting ? 0.5 : 1,
                      color: 'var(--fg)',
                    }}
                  >
                    {t('labDiscard')}
                  </button>
                )}

                {canManage && (
                  <button
                    onClick={handleSave}
                    disabled={submitting}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 6,
                      background: 'rgb(22,163,74)',
                      color: 'white',
                      border: 'none',
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      fontWeight: 500,
                      opacity: submitting ? 0.5 : 1,
                    }}
                  >
                    {submitting ? t('labSaving') : t('labSaveRecipe')}
                  </button>
                )}
                </div>
              </div>

              <aside className="space-y-4">
                <IntelligencePanel payload={payload} />
                <ImageStudio
                  restaurantId={restaurantId}
                  draftId={activeDraftId}
                  currentImage={payload.selected_image_url}
                  disabled={!canManage || autosaveState === 'saving'}
                  onConfirmed={(url) => setPayload((current) => current ? { ...current, selected_image_url: url } : current)}
                />
                {draft?.menu_item_id != null && (
                  <VersionHistory
                    restaurantId={restaurantId}
                    menuItemId={draft.menu_item_id}
                    canManage={canManage}
                    onRestored={(restored) => updatePayload(normalizePayload(restored))}
                  />
                )}
              </aside>
            </div>
          )}
        </main>
      </div>

      <RefineDrawer
        restaurantId={restaurantId}
        draftId={activeDraftId}
        open={refineOpen && canManage}
        onClose={() => setRefineOpen(false)}
        onPatches={(patches) => {
          if (payload) updatePayload(applyPatches(payload, patches));
        }}
      />
    </div>
  );
}

function normalizePayload(payload: DraftPayload): DraftPayload {
  return {
    ...payload,
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
