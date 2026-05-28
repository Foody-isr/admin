import { useEffect, useMemo, useRef, useState } from 'react';
import { searchGlobal, SearchResponse } from './api';
import { useDebouncedValue } from './use-debounced-value';

const DEBOUNCE_MS = 180;
const MIN_QUERY_LEN = 2;
const CACHE_MAX_ENTRIES = 32;
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  data: SearchResponse;
  expiresAt: number;
}

interface GlobalSearchState {
  data: SearchResponse | undefined;
  isLoading: boolean;
  error: Error | null;
}

const EMPTY: GlobalSearchState = { data: undefined, isLoading: false, error: null };

/**
 * Searches Articles / Commandes / Clients / Stock for a restaurant, with a
 * 180 ms debounce, in-flight cancellation via AbortController, and a small
 * per-(restaurant,query) in-memory cache with a 30 s TTL.
 *
 * Queries shorter than 2 characters never hit the network.
 */
export function useGlobalSearch(restaurantId: number, query: string): GlobalSearchState {
  const debounced = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const [state, setState] = useState<GlobalSearchState>(EMPTY);

  // The cache and the in-flight controller live across renders without
  // triggering re-renders themselves.
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());
  const controllerRef = useRef<AbortController | null>(null);

  const cacheKey = useMemo(() => `${restaurantId}:${debounced}`, [restaurantId, debounced]);

  useEffect(() => {
    if (debounced.length < MIN_QUERY_LEN) {
      setState(EMPTY);
      return;
    }

    // Serve from cache when fresh.
    const cached = cacheRef.current.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setState({ data: cached.data, isLoading: false, error: null });
      return;
    }

    // Cancel any prior in-flight request before starting a new one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setState((prev) => ({ data: prev.data, isLoading: true, error: null }));

    searchGlobal(restaurantId, debounced, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        // Insert into cache, evicting the oldest entry if over capacity.
        if (cacheRef.current.size >= CACHE_MAX_ENTRIES) {
          const oldestKey = cacheRef.current.keys().next().value;
          if (oldestKey !== undefined) cacheRef.current.delete(oldestKey);
        }
        cacheRef.current.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
        setState({ data, isLoading: false, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ data: undefined, isLoading: false, error: err as Error });
      });

    return () => {
      controller.abort();
    };
  }, [restaurantId, debounced, cacheKey]);

  return state;
}
