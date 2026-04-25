'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listMenus, createCategory, updateCategory, deleteCategory,
  Menu, MenuCategory,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, PencilIcon, TrashIcon } from 'lucide-react';
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

  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<number | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ open: boolean; editing?: MenuCategory }>({ open: false });

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const fetchedMenus = await listMenus(rid);
      setMenus(fetchedMenus);

      const activeMenuId = selectedMenuId ?? fetchedMenus[0]?.id ?? null;
      if (selectedMenuId === null && fetchedMenus[0]) {
        setSelectedMenuId(fetchedMenus[0].id);
      }

      // Collect categories from the selected menu
      const targetMenu = fetchedMenus.find((m) => m.id === activeMenuId) ?? fetchedMenus[0];
      setCategories(targetMenu?.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, [rid, selectedMenuId]);

  useEffect(() => { reload(); }, [reload]);

  const handleMenuChange = (menuId: number) => {
    setSelectedMenuId(menuId);
    const m = menus.find((m) => m.id === menuId);
    setCategories(m?.categories ?? []);
  };

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
          <>
            {menus.length > 1 && (
              <select
                value={selectedMenuId ?? ''}
                onChange={(e) => handleMenuChange(Number(e.target.value))}
                className="h-9 px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm"
              >
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            <Button variant="primary" size="md" onClick={() => setEditModal({ open: true })}>
              <PlusIcon />
              {t('createCategory')}
            </Button>
          </>
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
                <DataTableCell className="font-medium text-fg-primary">{cat.name}</DataTableCell>
                <DataTableCell align="right" className="text-fg-secondary">
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
          menus={menus}
          defaultMenuId={selectedMenuId ?? menus[0]?.id}
          editing={editModal.editing}
          onClose={() => setEditModal({ open: false })}
          onSaved={() => { setEditModal({ open: false }); reload(); }}
        />
      )}
    </div>
  );
}

function CategoryEditModal({ restaurantId, menus, defaultMenuId, editing, onClose, onSaved }: {
  restaurantId: number;
  menus: Menu[];
  defaultMenuId?: number;
  editing?: MenuCategory;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(editing?.name ?? '');
  const [menuId, setMenuId] = useState<number>(editing?.menu_id ?? defaultMenuId ?? menus[0]?.id);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateCategory(restaurantId, editing.id, { name, menu_id: menuId });
      } else {
        await createCategory(restaurantId, { name, menu_id: menuId });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={editing ? t('editCategory') : t('newCategory')} onClose={onClose}>
      <div className="space-y-4">
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

        {menus.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('menus')}</label>
            <select
              className="input text-sm"
              value={menuId}
              onChange={(e) => setMenuId(Number(e.target.value))}
            >
              {menus.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

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
