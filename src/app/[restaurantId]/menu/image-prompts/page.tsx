'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { PlusIcon, PencilIcon, TrashIcon, SparklesIcon, StarIcon } from 'lucide-react';
import {
  listMenuImagePrompts,
  createMenuImagePrompt,
  updateMenuImagePrompt,
  deleteMenuImagePrompt,
  MenuImagePrompt,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import Modal from '@/components/Modal';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Button, PageHead, ConfirmDialog } from '@/components/ds';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

export default function MenuImagePromptsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [prompts, setPrompts] = useState<MenuImagePrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: MenuImagePrompt }>({
    open: false,
  });

  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MenuImagePrompt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);
  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setError('');
    try { const result = await listMenuImagePrompts(rid); if (guard.isCurrent(token)) setPrompts(result); }
    catch (cause) { if (guard.isCurrent(token)) setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { if (guard.isCurrent(token)) setLoading(false); }
  }, [rid, t]);
  useEffect(() => { const guard = requestGuard.current; void reload(); return () => guard.invalidate(); }, [reload]);

  const handleDelete = async (prompt: MenuImagePrompt) => {
    if (deleting || !canEdit) return;
    setDeleting(true);
    setActionError('');
    try { await deleteMenuImagePrompt(rid, prompt.id); await reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-[var(--s-5)]">
      <PageHead
        title={t('imagePromptTemplates')}
        desc={<>{t('imagePromptTemplatesDescription')}{!loading && !error && <span className="mt-2 block text-xs">{t('imagePromptCount').replace('{count}', String(prompts.length))}</span>}</>}
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              {t('newImagePrompt')}
            </Button>
          ) : undefined
        }
      />

      {actionError && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
      {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
        : error ? <div role="alert" className="rounded-r-lg border border-[var(--line)] p-5"><p className="mb-4 text-[var(--danger-500)]">{error}</p><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
        : prompts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <SparklesIcon className="w-10 h-10 text-[var(--fg-muted)]" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold text-fg-primary">{t('imagePromptEmpty')}</h2>
          <p className="text-sm text-fg-secondary max-w-md text-center">
            {t('imagePromptTemplatesDescription')}
          </p>
          {canEdit && (
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              {t('newImagePrompt')}
            </Button>
          )}
        </div>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('name')}</DataTableHeadCell>
            <DataTableHeadCell>{t('imagePromptText')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {prompts.map((p, index) => (
              <DataTableRow key={p.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  <div className="flex items-center gap-2">
                    {p.is_default && (
                      <span title={t('imagePromptDefault')}><StarIcon aria-hidden className="size-4 text-[var(--brand-ink)] fill-[var(--brand-ink)] shrink-0" /><span className="sr-only">{t('imagePromptDefault')}</span></span>
                    )}
                    <span className="break-words">{p.name}</span>
                  </div>
                </DataTableCell>
                <DataTableCell mobileLabel={t('imagePromptText')} className="text-fg-secondary text-sm">
                  <div dir="auto" className="max-w-2xl whitespace-pre-wrap break-words">{p.prompt}</div>
                </DataTableCell>
                <DataTableCell>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditModal({ open: true, editing: p })}
                        className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--surface-2)] text-fg-secondary hover:text-fg-primary"
                        aria-label={`${t('edit')} · ${p.name}`}
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        disabled={deleting} onClick={() => setPendingDelete(p)}
                        className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--danger-50)] text-fg-secondary hover:text-[var(--danger-500)] disabled:opacity-50"
                        aria-label={`${t('delete')} · ${p.name}`}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTableBody>
        </DataTable>
      )}

      <ConfirmDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }} title={t('delete')} description={pendingDelete?.name} danger confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={() => { if (pendingDelete) void handleDelete(pendingDelete); }} />
      {editModal.open && (
        <PromptEditModal
          restaurantId={rid}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => {
            setEditModal({ open: false });
            reload();
          }}
        />
      )}
    </div>
  );
}

function PromptEditModal({
  restaurantId,
  editing,
  onClose,
  onSaved,
}: {
  restaurantId: number;
  editing?: MenuImagePrompt;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [prompt, setPrompt] = useState(editing?.prompt ?? '');
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const dirty = name !== (editing?.name ?? '') || prompt !== (editing?.prompt ?? '') || isDefault !== (editing?.is_default ?? false);
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } };

  const handleSave = async () => {
    if (saving || !name.trim() || !prompt.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editing) await updateMenuImagePrompt(restaurantId, editing.id, { name, prompt, is_default: isDefault });
      else await createMenuImagePrompt(restaurantId, { name, prompt, is_default: isDefault });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { setSaving(false); }
  };

  return <>
    <Modal title={t(editing ? 'editImagePrompt' : 'newImagePrompt')} onClose={close} size="xl" footer={<div className="flex justify-end gap-3"><button type="button" className="btn-secondary" onClick={close} disabled={saving}>{t('cancel')}</button><button type="submit" form="image-prompt-editor" className="btn-primary" disabled={saving || !name.trim() || !prompt.trim()}>{saving ? t('saving') : t('save')}</button></div>}>
      <form id="image-prompt-editor" onSubmit={event => { event.preventDefault(); void handleSave(); }} aria-busy={saving}>
        <fieldset disabled={saving} className="space-y-5">
          <div>
            <label htmlFor="image-prompt-name" className="mb-2 block text-sm font-medium">{t('name')}</label>
            <input id="image-prompt-name" autoFocus required className="input" value={name} onChange={event => setName(event.target.value)} placeholder={t('imagePromptNameExample')} />
          </div>
          <div>
            <label htmlFor="image-prompt-text" className="mb-2 block text-sm font-medium">{t('imagePromptText')}</label>
            <textarea dir="auto" id="image-prompt-text" required className="input min-h-40" value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={t('imagePromptExample')} aria-describedby="image-prompt-variables" />
            <p id="image-prompt-variables" className="mt-3 flex flex-wrap gap-1 text-xs text-fg-secondary">{t('imagePromptVariables')}{' '}{['{{item_name}}', '{{item_description}}', '{{category}}'].map(variable => <code key={variable} dir="ltr" className="rounded bg-[var(--surface-2)] px-1 py-0.5">{variable}</code>)}</p>
          </div>
          <label className="flex min-h-11 items-start gap-3 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)] selection-row">
            <input type="checkbox" checked={isDefault} onChange={event => setIsDefault(event.target.checked)} className="mt-1 size-4 shrink-0" />
            <span><span className="block font-medium">{t('imagePromptDefault')}</span><span className="mt-1 block text-xs">{t('imagePromptDefaultDescription')}</span></span>
          </label>
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
      </form>
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t('libraryDiscardDescription')} danger confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose} />
  </>;
}
