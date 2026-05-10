'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listModifierSets, deleteModifierSet, migrateLegacyModifiers, ModifierSet,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
import { Button, PageHead } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

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
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('name') || 'Name'}</DataTableHeadCell>
            <DataTableHeadCell>{t('displayName') || 'Display name'}</DataTableHeadCell>
            <DataTableHeadCell align="center">{t('required') || 'Required'}</DataTableHeadCell>
            <DataTableHeadCell align="center">{t('modifiers') || 'Modifiers'}</DataTableHeadCell>
            <DataTableHeadCell align="center">{t('linkedItems') || 'Linked items'}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {sets.map((set, index) => (
              <DataTableRow key={set.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium">{set.name}</DataTableCell>
                <DataTableCell mobileLabel={t('displayName') || 'Display name'} className="text-fg-secondary">{set.display_name || '—'}</DataTableCell>
                <DataTableCell align="center" mobileLabel={t('required') || 'Required'}>
                  {set.is_required ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                      {t('required') || 'Required'}
                    </span>
                  ) : (
                    <span className="text-fg-secondary">—</span>
                  )}
                </DataTableCell>
                <DataTableCell align="center" mobileLabel={t('modifiers') || 'Modifiers'} className="text-fg-secondary">{set.modifiers?.length ?? 0}</DataTableCell>
                <DataTableCell align="center" mobileLabel={t('linkedItems') || 'Linked items'} className="text-fg-secondary">{set.menu_items?.length ?? 0}</DataTableCell>
                <DataTableCell>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => router.push(`/${restaurantId}/menu/modifier-sets/${set.id}`)}
                      className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                      title={t('edit') || 'Edit'}
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(set.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500"
                      title={t('delete') || 'Delete'}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}
    </div>
  );
}
