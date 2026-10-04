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
  PlusIcon, TrashIcon, SlidersHorizontal,
} from 'lucide-react';
import Modal from '@/components/Modal';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Button, PageHead, ConfirmDialog } from '@/components/ds';
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
  const itemsWithModifiers = allItems.filter(item => (item.modifiers ?? []).length > 0);
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
      <PageHead
        title={t('modifiers')}
        desc={t('libraryModifiersDescription')}
        actions={
          canEdit ? (
            <Button variant="primary" size="md" onClick={() => setCreateModal(true)}>
              <PlusIcon />
              {t('createModifier')}
            </Button>
          ) : undefined
        }
      />

      {actionError && <p role="alert" className="rounded-r-md bg-[var(--danger-50)] p-4 text-sm text-[var(--danger-500)]">{actionError}</p>}
      {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
        : error ? <div role="alert" className="rounded-r-lg border border-[var(--line)] p-5"><p className="mb-4 text-[var(--danger-500)]">{error}</p><Button variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
        : itemsWithModifiers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <SlidersHorizontal aria-hidden className="size-10 text-fg-secondary" />
          <h2 className="text-lg font-semibold text-fg-primary">{t('modifiers')}</h2>
          <p className="text-sm text-fg-secondary max-w-sm text-center">
            {t('noModifiersForItem')}
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
        <div className="space-y-6">
          {itemsWithModifiers.map((item) => (
            <div key={item.id}>
              <h2 className="rounded-t-r-lg border border-b-0 border-[var(--line)] bg-[var(--summary-bg)] p-4 text-sm font-semibold text-[var(--summary-fg)]">
                {item.name} <span className="text-fg-secondary font-normal">({item.category_name})</span>
              </h2>
              <DataTable>
                <DataTableHead>
                  <DataTableHeadCell>{t('modifierName')}</DataTableHeadCell>
                  <DataTableHeadCell>{t('action')}</DataTableHeadCell>
                  <DataTableHeadCell>{t('categoryGroupName')}</DataTableHeadCell>
                  <DataTableHeadCell align="right">{t('priceDelta').replace('{currency}', symbol)}</DataTableHeadCell>
                  <DataTableHeadSpacerCell />
                </DataTableHead>
                <DataTableBody>
                  {(item.modifiers ?? []).map((mod, modIdx) => (
                    <DataTableRow key={mod.id} index={modIdx}>
                      <DataTableCell mobilePrimary className="font-medium text-fg-primary">{mod.name}</DataTableCell>
                      <DataTableCell mobileLabel={t('action')} className="text-fg-secondary">{t(mod.action === 'remove' ? 'remove' : 'add')}</DataTableCell>
                      <DataTableCell mobileLabel={t('categoryGroupName')} className="text-fg-secondary">{mod.category || '—'}</DataTableCell>
                      <DataTableCell align="right" mobileLabel={t('priceDelta').replace('{currency}', symbol)} className="text-fg-primary">
                        {mod.price_delta !== 0
                          ? `${mod.price_delta > 0 ? '+' : ''}${money(mod.price_delta)}`
                          : '—'}
                      </DataTableCell>
                      <DataTableCell>
                        {canEdit && (
                          <button
                            aria-label={`${t('delete')} · ${mod.name}`} disabled={deleting}
                            onClick={() => setPendingDelete(mod)}
                            className="grid size-11 place-items-center rounded-r-md hover:bg-[var(--danger-50)] text-fg-secondary hover:text-[var(--danger-500)] disabled:opacity-50"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }} title={t('deleteThisModifier')} description={pendingDelete?.name} danger confirmLabel={t('delete')} cancelLabel={t('cancel')} onConfirm={() => { if (pendingDelete) void handleDeleteModifier(pendingDelete.id); }} />
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
