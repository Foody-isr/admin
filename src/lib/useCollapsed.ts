'use client';

import { useCallback, useEffect, useState } from 'react';

export type CollapsedState = Record<string, boolean>;

// Persists a map of section ids → collapsed? to localStorage under `key`.
// Returns [state, toggle(id), setMany(patch)]. `true` = collapsed.
export function useCollapsed(
  key: string,
  initial: CollapsedState = {},
): [CollapsedState, (id: string) => void, (patch: CollapsedState) => void] {
  const [state, setState] = useState<CollapsedState>(initial);

  // Hydrate from localStorage after mount to avoid SSR/CSR mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Ignore malformed JSON — fall back to initial.
    }
  }, [key]);

  const persist = useCallback(
    (next: CollapsedState) => {
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // localStorage can throw in private mode or when quota is hit — not fatal.
      }
    },
    [key],
  );

  const toggle = useCallback(
    (id: string) => {
      setState((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setMany = useCallback(
    (patch: CollapsedState) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return [state, toggle, setMany];
}
