'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { labPatchDraft } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { normalizeLabDraftPayload } from '../normalizePayload';
import type { Component, DraftPayload } from '../types';

/** Serialize and coalesce edits within one mounted restaurant/draft editor. */
export function useDraftAutosave(restaurantId: number, draftId: number, initial: DraftPayload, canManage: boolean) {
  const { t } = useI18n();
  const [payload, setPayload] = useState(() => normalizeLabDraftPayload(initial));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const current = useRef(payload);
  const persisted = useRef(payload);
  const edit = useRef(0);
  const saved = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<DraftPayload> | null>(null);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); }; }, []);

  const flush = useCallback(async (): Promise<DraftPayload> => {
    if (timer.current) clearTimeout(timer.current);
    if (running.current) return running.current;
    if (!canManage || saved.current === edit.current) return current.current;
    const work = async () => {
      setState('saving'); setError(null);
      try {
        while (mounted.current && saved.current < edit.current) {
          const sequence = edit.current;
          const input = { ...current.current, revision: persisted.current.revision };
          if (!input.components.length) throw new Error(t('labManualAddFirst'));
          const invalid = invalidQuantity(input.components);
          if (invalid) throw new Error(t('labPositiveQuantity').replace('{name}', invalid.name_primary || invalid.name_he || t('labIngredient')));
          const canonical = normalizeLabDraftPayload(await labPatchDraft(restaurantId, draftId, input));
          if (!mounted.current) return canonical;
          persisted.current = canonical;
          saved.current = sequence;
          current.current = sequence === edit.current ? canonical : { ...current.current, revision: canonical.revision };
          setPayload(current.current);
        }
        if (mounted.current) setState('saved');
        return current.current;
      } catch (cause) {
        if (mounted.current) { setState('error'); setError(cause instanceof Error ? cause.message : String(cause)); }
        throw cause;
      } finally { running.current = null; }
    };
    running.current = Promise.resolve().then(work);
    return running.current;
  }, [restaurantId, draftId, canManage, t]);

  const update = useCallback((next: DraftPayload) => {
    if (!canManage) return;
    current.current = next; edit.current += 1; setPayload(next); setState('saving'); setError(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => undefined); }, 550);
  }, [canManage, flush]);

  // Immediate server-side updates (image confirmation) are accepted only after flush.
  const accept = useCallback((next: DraftPayload) => {
    current.current = next; persisted.current = next; saved.current = edit.current;
    setPayload(next); setState('saved'); setError(null);
  }, []);

  const settle = async () => { if (timer.current) clearTimeout(timer.current); await running.current?.catch(() => undefined); };

  return { settle, payload, state, error, dirty: edit.current !== saved.current, update, flush, accept };
}

function invalidQuantity(components: Component[]): Component | undefined {
  for (const component of components) {
    if (!Number.isFinite(component.qty) || component.qty <= 0) return component;
    const nested = invalidQuantity(component.ingredients ?? []);
    if (nested) return nested;
  }
  return undefined;
}
