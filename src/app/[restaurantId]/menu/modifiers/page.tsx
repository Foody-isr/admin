'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  getAllCategories, createModifier, deleteModifier,
  MenuCategory, MenuItem, MenuItemModifier, ModifierInput,
} from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  ListFilter, TrashIcon, SlidersHorizontal,
} from 'lucide-react';
import ActionsDropdown from '@/components/common/ActionsDropdown';
import { ListToolbar } from '@/components/data-table';
import { ListFilterButton, ListStateFilter, ListFiltersDrawer } from '@/components/data-table/ListFilters';
import Modal from '@/components/Modal';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Button, ConfirmDialog } from '@/components/ds';
import { NumberInput } from '@/components/ui/NumberInput';
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
  const { money, symbol } = useCurrency();
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [filterView, setFilterView] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState(false);

  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MenuItemModifier | null>(null);
  const [deleting, setDeleting] = useState(false);
  const requestGuard = useRef(new RestaurantRequestGuard());
  requestGuard.current.enterRestaurant(rid);
  const reload = useCallback(async () => {
    const guard = requestGuard.current;
    const token = guard.begin(rid);
    setLoading(true);
    setError('');
    try { const result = await getAllCategories(rid); if (guard.isCurrent(token)) setCategories(result); }
    catch (cause) { if (guard.isCurrent(token)) setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { if (guard.isCurrent(token)) setLoading(false); }
  }, [rid, t]);
  useEffect(() => { const guard = requestGuard.current; void reload(); return () => guard.invalidate(); }, [reload]);

  const allItems = flattenItems(categories);
  const rows = allItems.flatMap(item => (item.modifiers ?? []).map(mod => ({ item, mod })));
  const filtered = rows.filter(({ item, mod }) => `${mod.name} ${item.name}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (!selectedCategories.size || selectedCategories.has(item.category_name)) && (!selectedActions.size || selectedActions.has(mod.action)));
  const actionOptions = [{ value: 'add', label: t('add') }, { value: 'remove', label: t('remove') }];
  const listFilters = [{ id: 'category', label: t('category'), options: categories.map(category => ({ value: category.name, label: category.name })), selected: selectedCategories }, { id: 'action', label: t('action'), options: actionOptions, selected: selectedActions }];
  const handleDeleteModifier = async (modId: number) => {
    if (deleting || !canEdit) return;
    setDeleting(true);
    setActionError('');
    try { await deleteModifier(rid, modId); await reload(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-[var(--s-5)]">
      <h1 className="sr-only">{t('modifiers')}</h1>
      <ListToolbar search={{ value: search, onChange: setSearch, label: t('search') }}
        filters={<><ListFilterButton label={t('category')} value={selectedCategories.size || undefined} onClick={() => setFilterView('category')} /><ListStateFilter label={t('action')} options={actionOptions} selected={selectedActions} onChange={setSelectedActions} /><ListFilterButton label={t('allFilters')} icon={<ListFilter />} onClick={() => setFilterView('index')} /></>}
        primaryAction={canEdit && <Button onClick={() => setCreateModal(true)}>{t('createModifier')}</Button>}
        actions={<ActionsDropdown actions={[{ label: t('refresh'), onClick: () => void reload(), disabled: loading || deleting }]} />}
      />
      <ListFiltersDrawer open={filterView !== null} initialView={filterView ?? 'index'} onClose={() => setFilterView(null)} filters={listFilters} onApply={values => { setSelectedCategories(values.category); setSelectedActions(values.action); }} />
      {actionError && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
      {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
        : error ? <div role="alert" className="rounded-r-lg border border-[var(--line)] p-5"><p className="mb-4 text-[var(--danger-500)]">{error}</p><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
        : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <SlidersHorizontal aria-hidden className="size-10 text-fg-secondary" />
          <h2 className="text-lg font-semibold text-fg-primary">{t('modifiers')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {t(rows.length ? 'listNoMatches' : 'noModifiersForItem')}
          </p>
          {canEdit && (
            <button
              onClick={() => setCreateModal(true)}
              className="btn-primary mt-2"
            >
              {t('createModifier')}
            </button>
          )}
        </div>
      ) : (
        <DataTable className="list-table">
          <DataTableHead><DataTableHeadCell>{t('modifierName')}</DataTableHeadCell><DataTableHeadCell>{t('item')}</DataTableHeadCell><DataTableHeadCell>{t('action')}</DataTableHeadCell><DataTableHeadCell>{t('categoryGroupName')}</DataTableHeadCell><DataTableHeadCell align="right">{t('priceDelta').replace('{currency}', symbol)}</DataTableHeadCell><DataTableHeadSpacerCell /></DataTableHead>
          <DataTableBody>{filtered.map(({ item, mod }) => <DataTableRow key={`${item.id}-${mod.id}`}>
            <DataTableCell mobilePrimary>{mod.name}</DataTableCell>
            <DataTableCell mobileLabel={t('item')}>{item.name}</DataTableCell>
            <DataTableCell mobileLabel={t('action')}>{t(mod.action === 'remove' ? 'remove' : 'add')}</DataTableCell>
            <DataTableCell mobileLabel={t('categoryGroupName')}>{mod.category || '—'}</DataTableCell>
            <DataTableCell align="right" mobileLabel={t('priceDelta').replace('{currency}', symbol)}>{mod.price_delta !== 0 ? `${mod.price_delta > 0 ? '+' : ''}${money(mod.price_delta)}` : '—'}</DataTableCell>
            <DataTableCell>{canEdit && <Button icon variant="ghost" aria-label={`${t('delete')} · ${mod.name}`} disabled={deleting} onClick={() => setPendingDelete(mod)}><TrashIcon /></Button>}</DataTableCell>
          </DataTableRow>)}</DataTableBody>
        </DataTable>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={open => { if (!open) setPendingDelete(null); }}
        title={t('deleteThisModifier')}
        description={pendingDelete?.name}
        danger
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={() => { if (pendingDelete) void handleDeleteModifier(pendingDelete.id); }}
      />
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
  const { symbol } = useCurrency();
  const allItems = flattenItems(categories);
  const [itemId, setItemId] = useState(allItems[0]?.id ?? 0);
  const [name, setName] = useState('');
  const [action, setAction] = useState<'add' | 'remove'>('add');
  const [category, setCategory] = useState('');
  const [priceDelta, setPriceDelta] = useState(0);
  const [isRequired, setIsRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  const dirty = !!name || !!category || priceDelta !== 0 || isRequired || action !== 'add' || itemId !== (allItems[0]?.id ?? 0);
  const close = () => { if (!saving) { if (dirty) setDiscard(true); else onClose(); } };

  const handleSave = async () => {
    if (!name.trim() || !itemId || saving) return;
    setError('');
    setSaving(true);
    try {
      const input: ModifierInput = {
        menu_item_id: itemId,
        name: name.trim(),
        action,
        category,
        price_delta: priceDelta,
        is_required: isRequired,
      };
      await createModifier(restaurantId, input);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('libraryOperationFailed')); }
    finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal title={t('newModifier')} onClose={close} footer={<div className="flex justify-end gap-3"><button type="button" className="btn-secondary" disabled={saving} onClick={close}>{t('cancel')}</button><button type="submit" form="modifier-editor" className="btn-primary" disabled={saving || !name.trim() || !itemId}>{saving ? t('saving') : t('save')}</button></div>}>
      <form id="modifier-editor" onSubmit={event => { event.preventDefault(); void handleSave(); }} aria-busy={saving}>
      <fieldset disabled={saving} className="space-y-4">
        <p className="rounded-r-md bg-[var(--summary-bg)] p-3 text-sm text-[var(--summary-fg)]">{t('libraryModifiersDescription')}</p>
        <div>
          <label htmlFor="modifier-item" className="mb-2 block text-sm font-medium">{t('menuItem')}</label>
          <select id="modifier-item" className="input min-w-0 text-sm" value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
            {allItems.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.category_name})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="modifier-name" className="mb-2 block text-sm font-medium">{t('modifierName')}</label>
          <input id="modifier-name" autoFocus required className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="modifier-action" className="mb-2 block text-sm font-medium">{t('action')}</label>
            <select id="modifier-action" className="input text-sm" value={action} onChange={(e) => setAction(e.target.value as 'add' | 'remove')}>
              <option value="add">{t('add')}</option>
              <option value="remove">{t('remove')}</option>
            </select>
          </div>
          <div>
            <label htmlFor="modifier-price" className="mb-2 block text-sm font-medium">{t('priceDelta').replace('{currency}', symbol)}</label>
            <NumberInput id="modifier-price" dir="ltr" min={-1000000} className="input" value={priceDelta} onChange={setPriceDelta} />
          </div>
        </div>
        <div>
          <label htmlFor="modifier-group" className="mb-2 block text-sm font-medium">{t('categoryGroupName')}</label>
          <input id="modifier-group" className="input" placeholder={t('categoryGroupPlaceholder')} value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <label className="flex min-h-11 items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="size-4 rounded" />
          <span className="text-sm font-medium text-fg-secondary">{t('requiredModifier')}</span>
        </label>
      </fieldset>
      {error && <p role="alert" className="mt-4 rounded-r-md bg-[var(--danger-50)] p-3 text-sm text-[var(--danger-500)]">{error}</p>}
      </form>
    </Modal>
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('discardChanges')} description={t('libraryDiscardDescription')} danger confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={onClose} />
    </>
  );
}
