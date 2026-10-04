'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { listOptionSets, deleteOptionSet, migrateVariantsToOptionSets, OptionSet } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Plus, Layers } from 'lucide-react';
import { LibrarySetList } from '@/components/menu/LibrarySetList';
import { Button, ConfirmDialog, PageHead } from '@/components/ds';

export default function OptionsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [sets, setSets] = useState<OptionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{id:number;name:string} | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setSets(await listOptionSets(rid)); }
    catch (error) { setError(error instanceof Error ? error.message : t('workspaceLoadError')); }
    finally { setLoading(false); }
  }, [rid, t]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (id: number) => {
    setBusyId(id); setError('');
    try { await deleteOptionSet(rid, id); await reload(); }
    catch (error) { setError(error instanceof Error ? error.message : t('workspaceLoadError')); }
    finally { setBusyId(null); }
  };

  const [migrating, setMigrating] = useState(false);

  const handleMigrate = async () => {
    if (!confirm(t('migrateModifiersConfirm') || 'Migrate existing variant groups to reusable option sets?')) return;
    setMigrating(true);
    setError('');
    try {
      const count = await migrateVariantsToOptionSets(rid);
      alert(`${t('created') || 'Created'} ${count} ${t('optionSets') || 'option set(s)'}`);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('workspaceLoadError'));
    } finally {
      setMigrating(false);
    }
  };


  return (
    <div className="space-y-[var(--s-5)] max-w-5xl mx-auto">
      <PageHead
        title={t('options')}
        desc={t('optionsDescription')}
        actions={
          canEdit ? (
            <>
              <Button variant="secondary" size="md" onClick={handleMigrate} disabled={migrating}>
                {t('migrateLegacy') || 'Migrate variants'}
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => router.push(`/${rid}/menu/options/new`)}
              >
                <Plus />
                {t('createOptionSet')}
              </Button>
            </>
          ) : undefined
        }
      />

      <ConfirmDialog open={pendingDelete !== null} onOpenChange={open => { if (!open) setPendingDelete(null); }} title={t('delete')} description={pendingDelete?.name} confirmLabel={t('delete')} cancelLabel={t('cancel')} danger onConfirm={() => { if (pendingDelete) void handleDelete(pendingDelete.id); }} />
      <LibrarySetList
        rows={sets.map((os) => ({ id:os.id, name:os.name, summary:(os.options ?? []).map(item => item.name).join(' · '), count:(os.menu_items ?? []).length }))}
        href={id => `/${rid}/menu/options/${id}`}
        icon={<Layers />}
        title={t('options')}
        description={t('optionsDescription')}
        emptyAction={canEdit ? <Button onClick={() => router.push(`/${rid}/menu/options/new`)}><Plus />{t('createOptionSet')}</Button> : undefined}
        loading={loading} error={error} onRetry={reload} busyId={busyId}
        onDelete={canEdit ? (id,name) => setPendingDelete({id,name}) : undefined}

      />
    </div>
  );
}
