'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listOptionSets, deleteOptionSet, migrateVariantsToOptionSets, OptionSet } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

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

  const handleDelete = async (id: number) => {
    if (!confirm(t('delete') + '?')) return;
    await deleteOptionSet(rid, id);
    reload();
  };

  const handleMigrate = async () => {
    if (!confirm('Migrate existing variant groups to reusable option sets?')) return;
    try {
      const count = await migrateVariantsToOptionSets(rid);
      alert(`Created ${count} option set(s)`);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Migration failed');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg-primary">{t('options')}</h1>
          <p className="text-sm text-fg-secondary mt-1 max-w-2xl leading-relaxed">
            {t('optionsDescription')}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleMigrate}
            className="btn-secondary rounded-full px-5 py-2 text-sm">
            Migrate variants
          </button>
          <button onClick={() => router.push(`/${rid}/menu/options/new`)}
            className="btn-primary rounded-full px-5 py-2 flex items-center gap-1.5">
            <PlusIcon className="w-4 h-4" />
            {t('createOptionSet')}
          </button>
        </div>
      </div>

      {sets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <p className="text-base text-fg-secondary text-center max-w-md">
            {t('optionsDescription')}
          </p>
          <button onClick={() => router.push(`/${rid}/menu/options/new`)}
            className="btn-primary mt-2 rounded-full">
            {t('createOptionSet')}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider border-b-2 border-fg-primary">
                <th className="py-3 px-2 font-medium">{t('name')}</th>
                <th className="py-3 px-2 font-medium">{t('options')}</th>
                <th className="py-3 px-2 font-medium text-right">{t('items') || 'Articles'}</th>
                <th className="py-3 px-2 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {sets.map((os) => (
                <tr key={os.id}
                  className="cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors border-b border-[var(--divider)]"
                  onClick={() => router.push(`/${rid}/menu/options/${os.id}`)}>
                  <td className="py-3.5 px-2 font-medium text-fg-primary">{os.name}</td>
                  <td className="py-3.5 px-2 text-fg-secondary">
                    {(os.options ?? []).map((o) => o.name).join(', ')}
                  </td>
                  <td className="py-3.5 px-2 text-right text-fg-secondary">
                    {(os.menu_items ?? []).length} {t('items') || 'articles'}
                  </td>
                  <td className="py-3.5 px-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleDelete(os.id)}
                      className="p-1.5 rounded-full border border-[var(--divider)] hover:bg-red-500/10 text-fg-primary transition-colors">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
