'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getMenu, createCategory, updateCategory, deleteCategory,
  MenuCategory,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  PlusIcon, PencilIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import Modal from '@/components/Modal';

export default function CategoriesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false });

  const reload = useCallback(() => {
    return getMenu(rid).then(setCategories).finally(() => setLoading(false));
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
    <div className="space-y-5">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setEditModal({ open: true })}
          className="btn-primary flex items-center gap-2"
        >
          <PlusIcon className="w-4 h-4" />
          {t('createCategory')}
        </button>
      </div>

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
        <div className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-3 px-4 font-normal">{t('name')}</th>
                <th className="py-3 px-4 font-normal text-right">{t('item')}</th>
                <th className="py-3 px-4 font-normal w-24" />
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr
                  key={cat.id}
                  className="hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ borderBottom: '1px solid var(--divider)' }}
                >
                  <td className="py-3 px-4 font-medium text-fg-primary">{cat.name}</td>
                  <td className="py-3 px-4 text-right text-fg-secondary">
                    {(cat.items ?? []).length}
                  </td>
                  <td className="py-3 px-4">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit/Create Category Modal */}
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
  restaurantId: number; editing?: MenuCategory; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [saving, setSaving] = useState(false);

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

  return (
    <Modal title={editing ? t('editCategory') : t('newCategory')} onClose={onClose}>
      <label className="block text-sm font-medium text-fg-secondary mb-1">{t('categoryName')}</label>
      <input autoFocus className="input" value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()} />
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </Modal>
  );
}
