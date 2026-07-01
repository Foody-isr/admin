import { useCallback, useEffect, useState } from 'react';

/**
 * A string-enum piece of state that survives navigation and reloads by mirroring
 * to `localStorage` under `key`. The stored value is validated against `allowed`;
 * anything missing or unrecognized falls back to `fallback`.
 *
 * The persisted value is restored in an effect (not a lazy initializer) so the
 * server render and the first client render both use `fallback` — this avoids a
 * hydration mismatch on whatever the value drives (e.g. an active tab). The
 * returned `hydrated` flag flips to `true` once restore has run, letting callers
 * defer value-dependent fetches until the real value is known and avoid an extra
 * request with the fallback.
 *
 * @returns `[value, setValue, hydrated]` — `setValue` writes through to storage.
 */
export function usePersistentEnum<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): readonly [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(key);
        if (saved && (allowed as readonly string[]).includes(saved)) {
          setValue(saved as T);
        }
      } catch {
        /* storage unavailable (private mode / quota) — keep fallback */
      }
    }
    setHydrated(true);
    // Restore once on mount; key/fallback/allowed are expected to be stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(key, next);
        } catch {
          /* storage unavailable — non-fatal */
        }
      }
    },
    [key],
  );

  return [value, update, hydrated] as const;
}
