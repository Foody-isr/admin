'use client';

// Server-backed preview for dynamic (category/group) combo steps.
//
// The combo editor used to estimate "N article(s) disponible(s) au client"
// client-side (classifyCategoryItems + buildAnyCarteItemIdSet), which ignored
// the menu_group_items date window and so over-counted future-series items.
// This hook instead asks the server's real resolver, so the editor preview is
// exactly what a customer would currently see.

import { useEffect, useRef, useState } from 'react';
import { resolveComboStepPreview, type ComboStepPreviewItem } from '@/lib/api';
import type { ComboStepDraft } from './types';

export interface StepPreview {
  items: ComboStepPreviewItem[];
  count: number;
  loading: boolean;
  error?: string;
}

/** Stable cache key for a step's group source. null = not a group step. */
function sourceSignature(s: ComboStepDraft): string | null {
  if (s.source_type === 'group' && s.source_group_id) {
    return `group:${s.source_group_id}:${s.source_variant_label ?? ''}`;
  }
  return null;
}

/** Fetches the server-resolved preview for every dynamic step, keyed by
 *  step.key. Results are cached by source signature, so editing one step never
 *  refetches the others and a given source is fetched once until it changes. */
export function useComboStepPreviews(
  restaurantId: number,
  steps: ComboStepDraft[],
): Map<string, StepPreview> {
  const [cache, setCache] = useState<Map<string, StepPreview>>(new Map());
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!restaurantId) return;
    const seen = new Set<string>();
    for (const s of steps) {
      const sig = sourceSignature(s);
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      if (cache.has(sig) || inFlight.current.has(sig)) continue;

      const sourceId = s.source_group_id!;
      const variantLabel = s.source_variant_label ?? undefined;

      inFlight.current.add(sig);
      setCache((prev) => new Map(prev).set(sig, { items: [], count: 0, loading: true }));
      resolveComboStepPreview(restaurantId, { sourceType: 'group', sourceId, variantLabel })
        .then((res) =>
          setCache((prev) => new Map(prev).set(sig, { items: res.items, count: res.count, loading: false })),
        )
        .catch((e) =>
          setCache((prev) =>
            new Map(prev).set(sig, { items: [], count: 0, loading: false, error: String(e?.message ?? e) }),
          ),
        )
        .finally(() => inFlight.current.delete(sig));
    }
    // cache is intentionally omitted: we read it as a "already fetched?" guard;
    // adding it would re-run the effect on every resolution.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, steps]);

  const byKey = new Map<string, StepPreview>();
  for (const s of steps) {
    const sig = sourceSignature(s);
    const hit = sig ? cache.get(sig) : undefined;
    if (hit) byKey.set(s.key, hit);
  }
  return byKey;
}
