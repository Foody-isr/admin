'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listModifierSets, deleteModifierSet, migrateLegacyModifiers, ModifierSet,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Plus, Trash2, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { Button, PageHead } from '@/components/ds';

export default function ModifierSetsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [sets, setSets] = useState<ModifierSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);

  const reload = useCallback(() => {
    return listModifierSets(rid).then(setSets).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`${t('delete')} "${name}"?`)) return;
    await deleteModifierSet(rid, id);
    reload();
  };

  const handleMigrate = async () => {
    if (!confirm(t('migrateModifiersConfirm') || 'Convert legacy per-item modifiers to modifier sets?')) return;
    setMigrating(true);
    try {
      const result = await migrateLegacyModifiers(rid);
      alert(`${t('created') || 'Created'} ${result.sets_created} ${t('modifierSets')?.toLowerCase() || 'modifier set(s)'}`);
      reload();
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-[var(--s-5)] max-w-5xl mx-auto">
      <PageHead
        title={t('modifierSets') || 'Modifier Sets'}
        desc={t('modifierSetsDescription') || 'Reusable modifier groups linked to multiple menu items'}
        actions={
          <>
            {sets.length === 0 && (
              <Button variant="secondary" size="md" onClick={handleMigrate} disabled={migrating}>
                {migrating ? (t('saving') || 'Migrating…') : (t('migrateLegacy') || 'Migrate legacy modifiers')}
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => router.push(`/${rid}/menu/modifier-sets/new`)}
            >
              <Plus />
              {t('newModifierSet') || 'New modifier set'}
            </Button>
          </>
        }
      />

      {/* Empty state */}
      {sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 bg-neutral-50 dark:bg-[#111111] rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
          <div className="size-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4">
            <SlidersHorizontal size={24} className="text-orange-500" />
          </div>
          <p className="text-base text-neutral-900 dark:text-white font-medium mb-1">
            {t('modifierSets') || 'Modifier sets'}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center max-w-md mb-5">
            {t('modifierSetsHint') || 'Create reusable modifier groups and link them to menu items.'}
          </p>
          <button
            onClick={() => router.push(`/${rid}/menu/modifier-sets/new`)}
            className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg shadow-lg shadow-orange-500/25 transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            {t('newModifierSet') || 'New modifier set'}
          </button>
        </div>
      ) : (
        /* Card rows */
        <div className="space-y-2">
          {sets.map((set) => (
            <div
              key={set.id}
              onClick={() => router.push(`/${rid}/menu/modifier-sets/${set.id}`)}
              className="group flex items-center gap-4 p-4 bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="size-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <SlidersHorizontal size={18} className="text-orange-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900 dark:text-white truncate">
                  {set.name}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                  {(set.modifiers ?? []).map((m) => m.name).join(' · ') || '—'}
                </p>
              </div>
              {set.is_required && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 shrink-0">
                  {t('required') || 'Required'}
                </span>
              )}
              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
                {(set.menu_items ?? []).length} {(t('items') || 'articles').toLowerCase()}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(set.id, set.name); }}
                className="size-9 rounded-lg flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                title={t('delete')}
              >
                <Trash2 size={16} />
              </button>
              <ChevronRight size={16} className="text-neutral-400 shrink-0 group-hover:text-orange-500 transition-colors" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
