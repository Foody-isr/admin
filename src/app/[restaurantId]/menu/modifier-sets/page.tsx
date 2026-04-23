'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listModifierSets, deleteModifierSet, migrateLegacyModifiers, ModifierSet,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
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

  const handleDelete = async (id: number) => {
    if (!confirm(t('deleteThisModifierSet') || 'Delete this modifier set?')) return;
    await deleteModifierSet(rid, id);
    reload();
  };

  const handleMigrate = async () => {
    if (!confirm(t('migrateModifiersConfirm') || 'Convert legacy per-item modifiers to modifier sets?')) return;
    setMigrating(true);
    try {
      const result = await migrateLegacyModifiers(rid);
      alert(`Created ${result.sets_created} modifier set(s)`);
      reload();
    } finally {
      setMigrating(false);
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
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('modifierSets') || 'Modifier Sets'}
        desc={t('modifierSetsDescription') || 'Reusable modifier groups linked to multiple menu items'}
        actions={
          <>
            {sets.length === 0 && (
              <Button variant="secondary" size="md" onClick={handleMigrate} disabled={migrating}>
                {migrating ? 'Migrating…' : (t('migrateLegacy') || 'Migrate legacy modifiers')}
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              onClick={() => router.push(`/${restaurantId}/menu/modifier-sets/new`)}
            >
              <PlusIcon />
              {t('newModifierSet') || 'New modifier set'}
            </Button>
          </>
        }
      />

      {sets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">{t('noModifierSets') || 'No modifier sets yet'}</p>
          <p className="text-sm mt-2">
            {t('modifierSetsHint') || 'Create reusable modifier groups and link them to menu items.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('name') || 'Name'}</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">{t('displayName') || 'Display name'}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t('required') || 'Required'}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t('modifiers') || 'Modifiers'}</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">{t('linkedItems') || 'Linked items'}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sets.map((set) => (
                <tr key={set.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{set.name}</td>
                  <td className="px-4 py-3 text-gray-600">{set.display_name || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {set.is_required ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                        {t('required') || 'Required'}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{set.modifiers?.length ?? 0}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{set.menu_items?.length ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => router.push(`/${restaurantId}/menu/modifier-sets/${set.id}`)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                        title={t('edit') || 'Edit'}
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(set.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title={t('delete') || 'Delete'}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
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
