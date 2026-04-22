'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listOptionSets, deleteOptionSet, migrateVariantsToOptionSets, OptionSet } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Plus, Trash2, ChevronRight, Layers } from 'lucide-react';

// Options list — Figma design: orange gradient CTA, lucide icons, rounded
// card rows (no HTML table), neutral dark tokens consistent with the
// Articles list page.

export default function OptionsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [sets, setSets] = useState<OptionSet[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    return listOptionSets(rid).then(setSets).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`${t('delete')} "${name}"?`)) return;
    await deleteOptionSet(rid, id);
    reload();
  };

  const handleMigrate = async () => {
    if (!confirm(t('migrateModifiersConfirm') || 'Migrate existing variant groups to reusable option sets?')) return;
    try {
      const count = await migrateVariantsToOptionSets(rid);
      alert(`${t('created') || 'Created'} ${count} ${t('optionSets') || 'option set(s)'}`);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Migration failed');
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
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {t('options')}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 max-w-2xl leading-relaxed">
            {t('optionsDescription')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleMigrate}
            className="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-[#1a1a1a] rounded-lg border border-neutral-200 dark:border-neutral-700 transition-colors"
          >
            {t('migrateLegacy') || 'Migrate variants'}
          </button>
          <button
            onClick={() => router.push(`/${rid}/menu/options/new`)}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg shadow-lg shadow-orange-500/25 transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            {t('createOptionSet')}
          </button>
        </div>
      </div>

      {/* Empty state */}
      {sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 bg-neutral-50 dark:bg-[#111111] rounded-xl border border-dashed border-neutral-200 dark:border-neutral-700">
          <div className="size-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mb-4">
            <Layers size={24} className="text-orange-500" />
          </div>
          <p className="text-base text-neutral-900 dark:text-white font-medium mb-1">
            {t('options')}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center max-w-md mb-5">
            {t('optionsDescription')}
          </p>
          <button
            onClick={() => router.push(`/${rid}/menu/options/new`)}
            className="px-5 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg shadow-lg shadow-orange-500/25 transition-all flex items-center gap-2"
          >
            <Plus size={16} />
            {t('createOptionSet')}
          </button>
        </div>
      ) : (
        /* Card rows */
        <div className="space-y-2">
          {sets.map((os) => (
            <div
              key={os.id}
              onClick={() => router.push(`/${rid}/menu/options/${os.id}`)}
              className="group flex items-center gap-4 p-4 bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="size-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
                <Layers size={18} className="text-orange-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutral-900 dark:text-white truncate">
                  {os.name}
                </p>
                <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate mt-0.5">
                  {(os.options ?? []).map((o) => o.name).join(' \u00b7 ') || '\u2014'}
                </p>
              </div>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
                {(os.menu_items ?? []).length} {(t('items') || 'articles').toLowerCase()}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(os.id, os.name); }}
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
