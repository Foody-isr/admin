'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveComboStepPreview, type ComboStepPreviewItem } from '@/lib/api';
import type { ComboStepDraft } from './types';

export interface StepPreview {
  items: ComboStepPreviewItem[];
  count: number;
  loading: boolean;
  error?: string;
  retry?: () => void;
}

function sourceSignature(restaurantId: number, step: ComboStepDraft): string | null {
  return step.source_type === 'group' && step.source_group_id
    ? `${restaurantId}:group:${step.source_group_id}:${step.source_variant_label ?? ''}`
    : null;
}

/** Fetches authoritative group availability, scoped to a restaurant, with explicit retry. */
export function useComboStepPreviews(restaurantId: number, steps: ComboStepDraft[]): Map<string, StepPreview> {
  const [cache, setCache] = useState<Map<string, StepPreview>>(new Map());
  const inFlight = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const fetchPreview = useCallback((signature: string, sourceId: number, variantLabel?: string) => {
    if (inFlight.current.has(signature)) return;
    inFlight.current.add(signature);
    setCache(current => new Map(current).set(signature, { items: [], count: 0, loading: true }));
    resolveComboStepPreview(restaurantId, { sourceType: 'group', sourceId, variantLabel }).then(result => {
      if (mounted.current) setCache(current => new Map(current).set(signature, { ...result, loading: false }));
    }).catch(cause => {
      if (mounted.current) setCache(current => new Map(current).set(signature, {
        items: [], count: 0, loading: false, error: cause instanceof Error ? cause.message : String(cause),
      }));
    }).finally(() => { inFlight.current.delete(signature); });
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    for (const step of steps) {
      const signature = sourceSignature(restaurantId, step);
      if (signature && !cache.has(signature)) fetchPreview(signature, step.source_group_id!, step.source_variant_label ?? undefined);
    }
  }, [restaurantId, steps, cache, fetchPreview]);

  const byKey = new Map<string, StepPreview>();
  for (const step of steps) {
    const signature = sourceSignature(restaurantId, step);
    if (!signature) continue;
    byKey.set(step.key, {
      ...(cache.get(signature) ?? { items: [], count: 0, loading: true }),
      retry: () => fetchPreview(signature, step.source_group_id!, step.source_variant_label ?? undefined),
    });
  }
  return byKey;
}
