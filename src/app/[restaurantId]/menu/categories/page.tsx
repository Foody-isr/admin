'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  getAllCategories, createCategory, updateCategory, deleteCategory, uploadCategoryImage,
  MenuCategory,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { PlusIcon, PencilIcon, TrashIcon, ImageIcon, FolderOpen } from 'lucide-react';
import Modal from '@/components/Modal';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Button, ConfirmDialog } from '@/components/ds';
import {
  ListToolbar, ListPagination, useListPagination, SortableHeadCell, type SortDir,
  DataTable,
  DataTableHead,
  DataTableHeadSpacerCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';

export default function CategoriesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{key: string; direction: SortDir}>({ key: 'name', direction: 'asc' });
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false });

  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MenuCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);

  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setError('');
    setLoading(true);
    try {
      const result = await getAllCategories(rid);
      if (guard.isCurrent(token)) setCategories(result);
    } catch (cause) {
      if (guard.isCurrent(token)) setError(cause instanceof Error ? cause.message : t('libraryOperationFailed'));
    } finally {
      if (guard.isCurrent(token)) setLoading(false);
    }
  }, [rid, t]);

  useEffect(() => { const guard = requestGuard.current; void reload(); return () => guard.invalidate(); }, [reload]);

  const handleDelete = async (cat: MenuCategory) => {
    if (deleting || !canEdit) return;
    setDeleting(true);
    setActionError('');
    try { await deleteCategory(rid, cat.id); await reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { setDeleting(false); }
  };

  const filtered = categories.filter(category => category.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))
    .sort((a,b) => (sort.key === 'name' ? a.name.localeCompare(b.name, locale) : (a.items?.length ?? 0) - (b.items?.length ?? 0)) * (sort.direction === 'asc' ? 1 : -1));
  const pagination = useListPagination(filtered, `${rid}:${search}:${sort.key}:${sort.direction}`);
  const onSort = (key: string) => setSort(current => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }));

  return (
    <div>
      <h1 className="sr-only">{t('categories')}</h1>
      <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
        actions={<ActionsDropdown actions={[{ label: t('refresh'), onClick: () => void reload() }]} />}
        primaryAction={canEdit && <Button onClick={() => setEditModal({ open: true })}>{t('createCategory')}</Button>} />
      {actionError && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
      {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
        : error ? <div role="alert" className="rounded-r-lg border border-[var(--line)] p-5"><p className="mb-4 text-[var(--danger-500)]">{error}</p><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
        : categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <FolderOpen aria-hidden className="size-10 text-fg-secondary" />
          <h2 className="text-lg font-semibold text-fg-primary">{t('categories')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {t('libraryCategoriesDescription')}
          </p>
          {canEdit && (
            <button
              onClick={() => setEditModal({ open: true })}
              className="btn-primary mt-2"
            >
              {t('createCategory')}
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? <div className="py-12 text-center text-fs-sm"><p>{t('listNoMatches')}</p><Button variant="secondary" className="mt-4" onClick={() => setSearch('')}>{t('reset')}</Button></div> : (<>
        <DataTable className="list-table">
          <DataTableHead>
            <SortableHeadCell sortKey="name" currentSortKey={sort.key} sortDir={sort.direction} onSort={onSort}>{t('name')}</SortableHeadCell>
            <SortableHeadCell align="right" sortKey="count" currentSortKey={sort.key} sortDir={sort.direction} onSort={onSort}>{t('item')}</SortableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {pagination.rows.map((cat, index) => (
              <DataTableRow key={cat.id} index={index}>
                <DataTableCell mobilePrimary className="font-medium text-fg-primary">
                  <div className="flex items-center gap-3">
                    {cat.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cat.image_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-[var(--surface-subtle)] flex items-center justify-center text-fg-tertiary shrink-0">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                    )}
                    <span className="break-words">{cat.name}</span>
                  </div>
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('item')} className="text-fg-secondary">
                  {(cat.items ?? []).length}
                </DataTableCell>
                <DataTableCell>
                  {canEdit && (
                    <div className="flex items-center justify-end gap-1">
                      <button
                        aria-label={`${t('edit')} · ${cat.name}`}
                        onClick={() => setEditModal({ open: true, editing: cat })}
                        className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--surface-2)] text-fg-secondary hover:text-fg-primary"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={`${t('delete')} · ${cat.name}`} disabled={deleting}
                        onClick={() => setPendingDelete(cat)}
                        className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--danger-50)] text-fg-secondary hover:text-[var(--danger-500)] disabled:opacity-50"
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
        <ListPagination {...pagination} />
      </>)}

      <ConfirmDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }} title={t('delete')} description={pendingDelete?.name} danger confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={() => { if (pendingDelete) void handleDelete(pendingDelete); }} />
      {editModal.open && (
        <CategoryEditModal
          restaurantId={rid}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); void reload(); }}
          onImageSaved={imageUrl => setCategories(current => current.map(category => category.id === editModal.editing?.id ? { ...category, image_url: imageUrl } : category))}
        />
      )}
    </div>
  );
}

function CategoryEditModal({ restaurantId, editing, onClose, onSaved, onImageSaved }: {
  restaurantId: number;
  editing?: MenuCategory;
  onClose: () => void;
  onSaved: () => void;
  onImageSaved: (url: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [imageSaved, setImageSaved] = useState(false);
  const [discard, setDiscard] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = saving || uploading;
  const close = () => { if (!busy) { if (name !== (editing?.name ?? '')) setDiscard(true); else onClose(); } };

  const handleSave = async () => {
    if (!name.trim() || busy) return;
    setSaving(true);
    setError('');
    try {
      if (editing) await updateCategory(restaurantId, editing.id, { name });
      else await createCategory(restaurantId, { name });
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { setSaving(false); }
  };

  const handleImageUpload = async (file: File) => {
    if (!editing || busy) return;
    if (!file.type.startsWith('image/')) { setError(t('libraryImageTypeError')); return; }
    setUploading(true);
    setError('');
    setImageSaved(false);
    try {
      const url = await uploadCategoryImage(restaurantId, editing.id, file);
      await updateCategory(restaurantId, editing.id, { image_url: url });
      setImageUrl(url);
      onImageSaved(url);
      setImageSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  return <>
    <Modal title={editing ? t('editCategory') : t('newCategory')} onClose={close} footer={<div className="flex justify-end gap-3">
      <button type="button" className="btn-secondary" disabled={busy} onClick={close}>{t('cancel')}</button>
      <button type="submit" form="category-editor" className="btn-primary" disabled={busy || !name.trim()}>{saving ? t('saving') : t('save')}</button>
    </div>}>
      <form id="category-editor" className="space-y-5" onSubmit={event => { event.preventDefault(); void handleSave(); }} aria-busy={busy}>
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" tabIndex={-1} disabled={busy || !editing}
          onChange={event => { const file = event.target.files?.[0]; if (file) void handleImageUpload(file); }} />
        <button type="button" disabled={busy || !editing} aria-label={t(imageUrl ? 'changeImage' : 'uploadAction')}
          className="relative flex min-h-36 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-r-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] text-fg-secondary hover:border-[var(--brand-ink)] disabled:cursor-default"
          onClick={() => fileInputRef.current?.click()} onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void handleImageUpload(file); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {imageUrl ? <img src={imageUrl} alt="" className="h-40 w-full object-cover" /> : <><ImageIcon aria-hidden className="size-8" /><span className="px-4 text-sm">{editing ? t('dragImageHere') : t('saveFirstToUpload')}</span></>}
          {uploading && <span className="absolute inset-0 grid place-items-center bg-[var(--surface)] text-sm" role="status">{t('loading')}</span>}
        </button>
        {editing && <p className="text-xs text-fg-secondary" role={imageSaved ? 'status' : undefined}>{t(imageSaved ? 'libraryImageSaved' : 'libraryImageImmediate')}</p>}
        <div>
          <label htmlFor="category-name" className="mb-2 block text-sm font-medium">{t('categoryName')}</label>
          <input id="category-name" autoFocus required disabled={busy} className="input" value={name} onChange={event => setName(event.target.value)} />
        </div>
        {error && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
      </form>
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t('libraryDiscardDescription')} danger confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose} />
  </>;
}
