'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  getAllCategories, createCategory, updateCategory, deleteCategory, uploadCategoryImage,
  MenuCategory,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, PencilIcon, TrashIcon, ImageIcon } from 'lucide-react';
import Modal from '@/components/Modal';
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

export default function CategoriesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCategories(await getAllCategories(rid));
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async (cat: MenuCategory) => {
    if (!confirm(`${t('delete')} "${cat.name}"?`)) return;
    await deleteCategory(rid, cat.id);
    reload();
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
        title={t('categories') || 'Catégories'}
        desc={`${categories.length} ${t('categoriesCount') || 'catégories'}`}
        actions={
          <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
            <PlusIcon />
            {t('createCategory')}
          </Button>
        }
      />

      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl">📂</div>
          <h2 className="text-lg font-semibold text-fg-primary">{t('categories')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {t('addFirstMenuItem')}
          </p>
          <button
            onClick={() => setEditModal({ open: true })}
            className="btn-primary mt-2"
          >
            {t('createCategory')}
          </button>
        </div>
      ) : (
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>{t('name')}</DataTableHeadCell>
            <DataTableHeadCell align="right">{t('item')}</DataTableHeadCell>
            <DataTableHeadSpacerCell />
          </DataTableHead>
          <DataTableBody>
            {categories.map((cat, index) => (
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
                    <span>{cat.name}</span>
                  </div>
                </DataTableCell>
                <DataTableCell align="right" mobileLabel={t('item')} className="text-fg-secondary">
                  {(cat.items ?? []).length}
                </DataTableCell>
                <DataTableCell>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setEditModal({ open: true, editing: cat })}
                      className="p-1.5 rounded hover:bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500"
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

      {editModal.open && (
        <CategoryEditModal
          restaurantId={rid}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function CategoryEditModal({ restaurantId, editing, onClose, onSaved }: {
  restaurantId: number;
  editing?: MenuCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [imageUrl, setImageUrl] = useState(editing?.image_url ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isNew = !editing;

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(restaurantId, editing.id, { name });
      } else {
        await createCategory(restaurantId, { name });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (file: File) => {
    if (!editing) return;
    setUploading(true);
    try {
      const url = await uploadCategoryImage(restaurantId, editing.id, file);
      setImageUrl(url);
      await updateCategory(restaurantId, editing.id, { image_url: url });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageUpload(file);
  };

  return (
    <Modal title={editing ? t('editCategory') : t('newCategory')} onClose={onClose}>
      <div className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageUpload(file);
          }}
        />

        {imageUrl ? (
          <div
            className="relative rounded-xl overflow-hidden cursor-pointer group"
            style={{ border: '2px solid var(--divider)' }}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={name} className="w-full h-40 object-cover" />
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full" />
              </div>
            )}
            <div className="absolute inset-0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity text-sm font-medium">
                {t('changeImage')}
              </span>
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-[var(--divider)] rounded-xl p-8 flex flex-col items-center gap-2 text-fg-tertiary cursor-pointer hover:border-brand-500 hover:text-brand-500 transition-colors"
            onClick={() => !isNew && fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={isNew ? undefined : handleDrop}
          >
            {uploading ? (
              <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
            ) : (
              <>
                <ImageIcon className="w-8 h-8" strokeWidth={1} />
                {isNew ? (
                  <p className="text-sm text-center">{t('saveFirstToUpload')}</p>
                ) : (
                  <p className="text-sm text-center">
                    {t('dragImageHere')}{' '}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="text-brand-500 font-medium underline hover:text-brand-600"
                    >
                      {t('uploadAction')}
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('categoryName')}</label>
          <input
            autoFocus
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
