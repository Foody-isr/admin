'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { labListDrafts } from '@/lib/api';
import { useWs, type WsEvent } from '@/lib/ws-context';
import type { Draft } from '../types';

export interface DraftQueueState {
  drafts: Draft[];
  loading: boolean;
  error: string | null;
  /** Manually trigger a refetch (e.g. after an optimistic mutation). */
  refetch: () => void;
}

/**
 * useDraftQueue — source of truth for the "active" draft list.
 *
 * Polling strategy:
 *   - Fetches drafts with status `generating | ready | error` on mount.
 *   - While any draft is `generating`, re-polls every 3 s to pick up
 *     status transitions quickly.
 *   - When all drafts are settled the interval clears itself.
 *
 * WebSocket strategy:
 *   - Listens to `lastEvent` from the shared WsContext (ws-context.tsx).
 *   - `lab.draft.*` events trigger an immediate refetch so the UI reflects
 *     server state without waiting for the next poll cycle.
 *   - `lab.draft.committed` additionally removes the draft from local state
 *     optimistically to avoid a flash of stale UI.
 *   - WS is best-effort — polling is the safety net.
 */
export function useDraftQueue(restaurantId: number): DraftQueueState {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { lastEvent } = useWs();
  const prevEvent = useRef<WsEvent | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchDrafts = useCallback(async () => {
    try {
      const data = await labListDrafts(restaurantId, {
        status: ['generating', 'ready', 'error'],
      });
      setDrafts(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drafts');
      return null;
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  // ── Initial fetch ──────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    fetchDrafts();
  }, [fetchDrafts]);

  // ── Adaptive polling: active while any draft is `generating` ───────────

  useEffect(() => {
    // Clear any existing interval first (restaurantId may have changed).
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const anyGenerating = drafts.some((d) => d.status === 'generating');
    if (!anyGenerating) return;

    intervalRef.current = setInterval(async () => {
      const updated = await fetchDrafts();
      // Stop polling once no drafts are generating.
      if (updated && !updated.some((d) => d.status === 'generating')) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [drafts, fetchDrafts]);

  // ── WebSocket subscription ─────────────────────────────────────────────

  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;

    const { type, payload } = lastEvent;
    if (!type?.startsWith('lab.draft.')) return;

    if (type === 'lab.draft.committed') {
      // Optimistically remove the committed draft so the queue updates
      // instantly without waiting for the refetch round-trip.
      const draftId =
        typeof payload?.draft_id === 'number' ? payload.draft_id : undefined;

      if (draftId !== undefined) {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      }
    }

    // Always refetch to reconcile with server state after any lab.draft.* event.
    fetchDrafts();
  }, [lastEvent, fetchDrafts]);

  return { drafts, loading, error, refetch: fetchDrafts };
}
