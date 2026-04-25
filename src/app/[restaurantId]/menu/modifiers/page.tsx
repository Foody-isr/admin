'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getAllCategories, createModifier, deleteModifier,
  MenuCategory, MenuItem, MenuItemModifier, ModifierInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  PlusIcon, TrashIcon,
} from 'lucide-react';
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

interface FlatItem extends MenuItem {
  category_name: string;
}

function flattenItems(categories: MenuCategory[]): FlatItem[] {
  const items: FlatItem[] = [];
  for (const cat of categories) {
    for (const item of cat.items ?? []) {
      items.push({ ...item, category_name: cat.name });
    }
  }
  return items;
}

export default function ModifiersPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);

  const reload = useCallback(() => {
    return getAllCategories(rid).then(setCategories).finally(() => setLoading(false));
  }, [rid]);

  useEffect(() => { reload(); }, [reload]);

  const allItems = flattenItems(categories);
  const itemsWithModifiers = allItems.filter((item) => (item.modifiers ?? []).length > 0);

  const handleDeleteModifier = async (modId: number) => {
    if (!confirm(t('deleteThisModifier'))) return;
    await deleteModifier(rid, modId);
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
        title={t('modifiers') || 'Modifiers'}
        desc={t('modifiersDesc') || 'Modificateurs par article'}
        actions={
          <Button variant="primary" size="md" onClick={() => setCreateModal(true)}>
            <PlusIcon />
            {t('createModifier')}
          </Button>
        }
      />

      {itemsWithModifiers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="text-4xl">⚙️</div>
          <h2 className="text-lg font-semibold text-fg-primary">{t('modifiers')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {t('noModifiersForItem')}
          </p>
          <button
            onClick={() => setCreateModal(true)}
            className="btn-primary mt-2"
          >
            {t('createModifier')}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {itemsWithModifiers.map((item) => (
            <div key={item.id}>
              <h3 className="text-sm font-semibold text-fg-primary mb-2">
                {item.name} <span className="text-fg-secondary font-normal">({item.category_name})</span>
              </h3>
              <DataTable>
                <DataTableHead>
                  <DataTableHeadCell>{t('modifierName')}</DataTableHeadCell>
                  <DataTableHeadCell>{t('action')}</DataTableHeadCell>
                  <DataTableHeadCell>{t('categoryGroupName')}</DataTableHeadCell>
                  <DataTableHeadCell align="right">{t('priceDelta')}</DataTableHeadCell>
                  <DataTableHeadSpacerCell />
                </DataTableHead>
                <DataTableBody>
                  {(item.modifiers ?? []).map((mod, modIdx) => (
                    <DataTableRow key={mod.id} index={modIdx}>
                      <DataTableCell className="font-medium text-fg-primary">{mod.name}</DataTableCell>
                      <DataTableCell className="text-fg-secondary">{mod.action}</DataTableCell>
                      <DataTableCell className="text-fg-secondary">{mod.category || '—'}</DataTableCell>
                      <DataTableCell align="right" className="text-fg-primary">
                        {mod.price_delta !== 0
                          ? `${mod.price_delta > 0 ? '+' : ''}₪${mod.price_delta.toFixed(2)}`
                          : '—'}
                      </DataTableCell>
                      <DataTableCell>
                        <button
                          onClick={() => handleDeleteModifier(mod.id)}
                          className="p-1.5 rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-500"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          ))}
        </div>
      )}

      {createModal && (
        <CreateModifierModal
          restaurantId={rid}
          categories={categories}
          onClose={() => setCreateModal(false)}
          onSaved={() => { setCreateModal(false); reload(); }}
        />
      )}
    </div>
  );
}

function CreateModifierModal({ restaurantId, categories, onClose, onSaved }: {
  restaurantId: number; categories: MenuCategory[]; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useI18n();
  const allItems = flattenItems(categories);
  const [itemId, setItemId] = useState(allItems[0]?.id ?? 0);
  const [name, setName] = useState('');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [category, setCategory] = useState('');
  const [priceDelta, setPriceDelta] = useState('0');
  const [isRequired, setIsRequired] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !itemId) return;
    setSaving(true);
    try {
      const input: ModifierInput = {
        menu_item_id: itemId,
        name: name.trim(),
        action,
        category,
        price_delta: parseFloat(priceDelta) || 0,
        is_required: isRequired,
      };
      await createModifier(restaurantId, input);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={t('newModifier')} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('menuItem')}</label>
          <select className="input text-sm" value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
            {allItems.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.category_name})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('modifierName')}</label>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('action')}</label>
            <select className="input text-sm" value={action} onChange={(e) => setAction(e.target.value as 'add' | 'remove')}>
              <option value="add">{t('add')}</option>
              <option value="remove">{t('remove')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('priceDelta')}</label>
            <input type="number" step="0.01" className="input" value={priceDelta} onChange={(e) => setPriceDelta(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('categoryGroupName')}</label>
          <input className="input" placeholder={t('categoryGroupPlaceholder')} value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="rounded" />
          <span className="text-sm font-medium text-fg-secondary">{t('requiredModifier')}</span>
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-secondary" onClick={onClose}>{t('cancel')}</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </Modal>
  );
}
