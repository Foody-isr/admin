'use client';
import { useState, useCallback } from 'react';
import { labRefineDraft } from '@/lib/api';
import type { ChatPatch } from '../types';

/**
 * useRefineDraft — mutation hook for the AI refinement endpoint.
 *
 * Calls POST /api/v1/lab/drafts/:id/refine with a user message and returns
 * the assistant reply + structured diff patches to apply to the draft payload.
 *
 * Usage:
 *   const { refine, submitting, error } = useRefineDraft(restaurantId, draftId);
 *   const res = await refine('swap mozzarella for halloumi');
 *   if (res) applyPatches(payload, res.patches);
 */
export function useRefineDraft(restaurantId: number, draftId: number | null) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refine = useCallback(
    async (
      userMessage: string,
    ): Promise<{ assistant_message: string; patches: ChatPatch[] } | null> => {
      if (draftId == null) return null;
      setSubmitting(true);
      setError(null);
      try {
        const res = await labRefineDraft(restaurantId, draftId, userMessage);
        return res;
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [restaurantId, draftId],
  );

  return { refine, submitting, error };
}
