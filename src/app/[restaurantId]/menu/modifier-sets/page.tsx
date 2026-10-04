'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listModifierSets, deleteModifierSet, duplicateModifierSet, migrateLegacyModifiers, ModifierSet,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { LibrarySetList } from '@/components/menu/LibrarySetList';
import { Button, ConfirmDialog, PageHead } from '@/components/ds';

export default function ModifierSetsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [sets, setSets] = useState<ModifierSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{id:number;name:string} | null>(null);
  const [migrating, setMigrating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setSets(await listModifierSets(rid)); }
    catch (error) { setError(error instanceof Error ? error.message : t('workspaceLoadError')); }
    finally { setLoading(false); }
  }, [rid, t]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (id: number) => {
    setBusyId(id); setError('');
    try { await deleteModifierSet(rid, id); await reload(); }
    catch (error) { setError(error instanceof Error ? error.message : t('workspaceLoadError')); }
    finally { setBusyId(null); }
  };

  const handleDuplicate = async (id: number) => {
    setBusyId(id); setError('');
    try {
      const set = await duplicateModifierSet(rid, id);
      router.push(`/${rid}/menu/modifier-sets/${set.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : t('workspaceLoadError')); }
    finally { setBusyId(null); }
  };

  const handleMigrate = async () => {
    if (!confirm(t('migrateModifiersConfirm') || 'Convert legacy per-item modifiers to modifier sets?')) return;
    setMigrating(true);
    try {
      const result = await migrateLegacyModifiers(rid);
      alert(`${t('created') || 'Created'} ${result.sets_created} ${t('modifierSets')?.toLowerCase() || 'modifier set(s)'}`);
      reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : t('workspaceLoadError'));
    } finally {
      setMigrating(false);
    }
  };


  return (
    <div className="space-y-[var(--s-5)] max-w-5xl mx-auto">
      <PageHead
        title={t('modifierSets') || 'Modifier Sets'}
        desc={t('modifierSetsDescription') || 'Reusable modifier groups linked to multiple menu items'}
        actions={
          canEdit ? (
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
          ) : undefined
        }
      />

      <ConfirmDialog open={pendingDelete !== null} onOpenChange={open => { if (!open) setPendingDelete(null); }} title={t('delete')} description={pendingDelete?.name} confirmLabel={t('delete')} cancelLabel={t('cancel')} danger onConfirm={() => { if (pendingDelete) void handleDelete(pendingDelete.id); }} />
      <LibrarySetList
        rows={sets.map((set) => ({ id:set.id, name:set.name, summary:(set.modifiers ?? []).map(item => item.name).join(' · '), count:(set.menu_items ?? []).length, required:set.is_required }))}
        href={id => `/${rid}/menu/modifier-sets/${id}`}
        icon={<SlidersHorizontal />}
        title={t('modifierSets')}
        description={t('modifierSetsDescription')}
        emptyAction={canEdit ? <Button onClick={() => router.push(`/${rid}/menu/modifier-sets/new`)}><Plus />{t('newModifierSet')}</Button> : undefined}
        loading={loading} error={error} onRetry={reload} busyId={busyId}
        onDelete={canEdit ? (id,name) => setPendingDelete({id,name}) : undefined}
        onDuplicate={canEdit ? handleDuplicate : undefined}
      />
    </div>
  );
}
