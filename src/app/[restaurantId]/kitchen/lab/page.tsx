'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { labGetDraft, labCommitDraft, labDiscardDraft } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useDraftQueue } from './hooks/useDraftQueue';
import { DraftInputRail } from './components/DraftInputRail';
import { DraftQueue } from './components/DraftQueue';
import { CostSummaryHeader } from './components/CostSummaryHeader';
import { RecipeTree } from './components/RecipeTree';
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

  const { refetch: refetchQueue } = useDraftQueue(restaurantId);

  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [payload, setPayload] = useState<DraftPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        setPayload(d.payload ?? null);
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
      await labCommitDraft(restaurantId, activeDraftId, payload);
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
      setPayload({
        ...payload,
        cost_summary: { ...payload.cost_summary, selling_price: sp },
      });
    },
    [payload],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <h1 className="text-xl font-semibold text-[var(--fg)]">Recipe Lab</h1>
        {/* FoodCostTargetSetting goes here in Task 9 */}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left aside: input rail + drafts queue */}
        <aside className="w-80 border-r border-[var(--line)] overflow-y-auto p-4 space-y-6">
          <DraftInputRail
            restaurantId={restaurantId}
            onAfterGenerate={refetchQueue}
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
        <main className="flex-1 overflow-y-auto p-6">
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
            <>
              <CostSummaryHeader
                payload={payload}
                onSellingPriceChange={handleSellingPriceChange}
              />

              <RecipeTree payload={payload} onChange={setPayload} />

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
                {/* Refine button — wired in Task 8 */}
                <div style={{ flex: 1 }} />

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
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
