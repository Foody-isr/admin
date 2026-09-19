'use client';

import { useEffect, useState } from 'react';
import { HistoryIcon, RotateCcwIcon } from 'lucide-react';
import { labListRecipeVersions, labRestoreRecipeVersion } from '@/lib/api';
import { useCurrency, useI18n } from '@/lib/i18n';
import type { DraftPayload, RecipeVersion } from '../types';

export function VersionHistory({ restaurantId, menuItemId, canManage, onRestored }: {
  restaurantId: number;
  menuItemId: number;
  canManage: boolean;
  onRestored: (payload: DraftPayload) => void;
}) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const [versions, setVersions] = useState<RecipeVersion[]>([]);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    labListRecipeVersions(restaurantId, menuItemId).then((items) => active && setVersions(items)).catch(() => undefined);
    return () => { active = false; };
  }, [restaurantId, menuItemId]);

  if (versions.length === 0) return null;
  const restore = async (version: RecipeVersion) => {
    if (!window.confirm(t('labRestoreConfirm').replace('{version}', String(version.version)))) return;
    setRestoring(version.id);
    try {
      onRestored(await labRestoreRecipeVersion(restaurantId, menuItemId, version.id));
    } finally {
      setRestoring(null);
    }
  };

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--surface-1)] p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--fg)]"><HistoryIcon className="h-4 w-4" />{t('labVersions')}</h3>
      <div className="mt-3 space-y-2">
        {versions.map((version) => (
          <div key={version.id} className="flex items-center gap-2 rounded-lg border border-[var(--line)] p-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--fg)]">v{version.version} · {money(version.food_cost)}</p>
              <p className="truncate text-[10px] text-[var(--fg-muted)]">{new Date(version.created_at).toLocaleString()}</p>
            </div>
            {canManage && <button type="button" onClick={() => restore(version)} disabled={restoring != null} className="rounded-md border border-[var(--line)] p-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-50" title={t('labRestore')}><RotateCcwIcon className="h-3.5 w-3.5" /></button>}
          </div>
        ))}
      </div>
    </section>
  );
}
