import { useEffect, useState } from 'react';

/**
 * Returns `value` echoed back after `delayMs` of no further change.
 * Used by the global search palette to avoid firing a request on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
