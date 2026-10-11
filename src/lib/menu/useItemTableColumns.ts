'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { resolveItemTableVisibility, type ItemTableColumn, type ItemTableVisibility } from './item-table-columns';

const DEFAULTS = resolveItemTableVisibility(null);

/** Keeps a personal, restaurant-scoped Articles layout in this browser. */
export function useItemTableColumns(restaurantId: number) {
  const { user } = useAuth();
  const key = user?.id ? `foody.items.columns.${restaurantId}.${user.id}` : null;
  const [state, setState] = useState<{ key: string | null; visible: ItemTableVisibility }>({ key: null, visible: DEFAULTS });
  const [saveFailed, setSaveFailed] = useState(false);
  const visible = state.key === key ? state.visible : DEFAULTS;

  useEffect(() => {
    let restored = DEFAULTS;
    if (key) {
      try { restored = resolveItemTableVisibility(JSON.parse(localStorage.getItem(key) ?? 'null')); }
      catch { /* Missing, malformed or unavailable optional preferences use defaults. */ }
    }
    setState({ key, visible: restored });
    setSaveFailed(false);
  }, [key]);

  function commit(next: ItemTableVisibility) {
    setState({ key, visible: next });
    try {
      if (!key) throw new Error('No user preference scope');
      localStorage.setItem(key, JSON.stringify(next));
      setSaveFailed(false);
    } catch {
      // Keep the current display usable and tell the user it was not saved.
      setSaveFailed(true);
    }
  }

  return {
    visible,
    saveFailed,
    hasCustom: Object.values(visible).some(value => !value),
    toggle: (column: ItemTableColumn, checked: boolean) => commit({ ...visible, [column]: checked }),
    reset: () => commit(DEFAULTS),
  };
}
