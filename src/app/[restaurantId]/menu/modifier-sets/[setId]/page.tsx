'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getModifierSet, createModifierSet, updateModifierSet,
  getMenu, attachModifierSetToItems, detachModifierSetFromItem,
  deleteModifier, createModifierInSet, reorderModifierSetModifiers,
  MenuCategory, MenuItem, ModifierSet, ModifierSetInput, MenuItemModifier,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  TrashIcon, PlusIcon, Bars3Icon,
} from '@heroicons/react/24/outline';

interface ModifierRow {
  id?: number;
  name: string;
  kitchen_name: string;
  action: 'add' | 'remove';
  price_delta: number;
  is_active: boolean;
  is_preselected: boolean;
  hide_online: boolean;
  sort_order: number;
  isNew?: boolean;
}

function blankRow(sortOrder: number): ModifierRow {
  return {
    name: '',
    kitchen_name: '',
    action: 'add',
    price_delta: 0,
    is_active: true,
    is_preselected: false,
    hide_online: false,
    sort_order: sortOrder,
    isNew: true,
  };
}

function flattenItems(categories: MenuCategory[]): MenuItem[] {
  return categories.flatMap((c) => c.items ?? []);
}

export default function ModifierSetEditorPage() {
  const { restaurantId, setId } = useParams();
  const rid = Number(restaurantId);
  const isNew = setId === 'new';
  const router = useRouter();
  const { t } = useI18n();

  // Set-level fields
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(true);
  const [minSelections, setMinSelections] = useState(0);
  const [maxSelections, setMaxSelections] = useState(0);
  const [hideOnReceipt, setHideOnReceipt] = useState(false);
  const [useConversational, setUseConversational] = useState(false);

  // Modifier rows
  const [rows, setRows] = useState<ModifierRow[]>([blankRow(0)]);

  // Linked items
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [linkedItemIds, setLinkedItemIds] = useState<Set<number>>(new Set());

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [existingSet, setExistingSet] = useState<ModifierSet | null>(null);

  const loadSet = useCallback(async () => {
    if (isNew) return;
    const set = await getModifierSet(rid, Number(setId));
    setExistingSet(set);
    setName(set.name);
    setDisplayName(set.display_name);
    setIsRequired(set.is_required);
    setAllowMultiple(set.allow_multiple);
    setMinSelections(set.min_selections);
    setMaxSelections(set.max_selections);
    setHideOnReceipt(set.hide_on_receipt);
    setUseConversational(set.use_conversational);
    setRows(set.modifiers.map((m) => ({
      id: m.id,
      name: m.name,
      kitchen_name: m.kitchen_name,
      action: m.action,
      price_delta: m.price_delta,
      is_active: m.is_active,
      is_preselected: m.is_preselected,
      hide_online: m.hide_online,
      sort_order: m.sort_order,
    })));
    const linked = new Set((set.menu_items ?? []).map((mi) => mi.id));
    setLinkedItemIds(linked);
    setLoading(false);
  }, [rid, setId, isNew]);

  const loadItems = useCallback(async () => {
    const cats = await getMenu(rid);
    setAllItems(flattenItems(cats));
  }, [rid]);

  useEffect(() => {
    loadSet();
    loadItems();
  }, [loadSet, loadItems]);

  const updateRow = (index: number, patch: Partial<ModifierRow>) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const addRow = () => {
    setRows((prev) => [...prev, blankRow(prev.length)]);
  };

  const removeRow = async (index: number) => {
    const row = rows[index];
    if (row.id && !isNew) {
      if (!confirm(t('deleteThisModifier') || 'Delete this modifier?')) return;
      await deleteModifier(rid, row.id);
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleLinkedItem = async (itemId: number) => {
    if (isNew) {
      // Changes applied on save
      setLinkedItemIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
        return next;
      });
      return;
    }
    const setID = Number(setId);
    if (linkedItemIds.has(itemId)) {
      await detachModifierSetFromItem(rid, setID, itemId);
      setLinkedItemIds((prev) => { const n = new Set(prev); n.delete(itemId); return n; });
    } else {
      await attachModifierSetToItems(rid, setID, [itemId]);
      setLinkedItemIds((prev) => { const n = new Set(prev); n.add(itemId); return n; });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { alert(t('nameRequired') || 'Name is required'); return; }
    setSaving(true);
    try {
      const input: ModifierSetInput = {
        name,
        display_name: displayName,
        is_required: isRequired,
        allow_multiple: allowMultiple,
        min_selections: minSelections,
        max_selections: maxSelections,
        hide_on_receipt: hideOnReceipt,
        use_conversational: useConversational,
      };

      if (isNew) {
        const newRows = rows.filter((r) => r.name.trim());
        input.modifiers = newRows.map((r, i) => ({ ...r, sort_order: i }));
        const created = await createModifierSet(rid, input);
        if (linkedItemIds.size > 0) {
          const linkedArr: number[] = [];
          linkedItemIds.forEach((id) => linkedArr.push(id));
          await attachModifierSetToItems(rid, created.id, linkedArr);
        }
      } else {
        const setID = Number(setId);
        await updateModifierSet(rid, setID, input);

        // Create any new rows
        const newRows = rows.filter((r) => r.isNew && r.name.trim());
        for (const row of newRows) {
          await createModifierInSet(rid, setID, row);
        }

        // Reorder if needed
        const existingIds = rows.filter((r) => r.id).map((r) => r.id as number);
        if (existingIds.length > 0) {
          await reorderModifierSetModifiers(rid, setID, existingIds);
        }
      }

      router.push(`/${restaurantId}/menu/modifier-sets`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const Toggle = ({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) => (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="font-medium text-sm">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-brand-600' : 'bg-gray-200'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {isNew ? (t('newModifierSet') || 'New modifier set') : (t('editModifierSet') || 'Edit modifier set')}
        </h1>
        <div className="flex gap-2">
          <button onClick={() => router.back()} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            {t('cancel') || 'Cancel'}
          </button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60">
            {saving ? (t('saving') || 'Saving…') : (t('save') || 'Save')}
          </button>
        </div>
      </div>

      {/* Section 1 — Identity */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">{t('identity') || 'Identity'}</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('internalName') || 'Internal name'} *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Toppings"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('displayName') || 'Display name'}</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('displayNamePlaceholder') || 'Shown to customers (leave blank to use name)'}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </section>

      {/* Section 2 — Modifier list */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{t('modifierList') || 'Modifier list'}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 font-medium text-gray-600">{t('name') || 'Name'}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">{t('kitchenName') || 'Kitchen name'}</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">{t('price') || 'Price'}</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">{t('hideOnline') || 'Hide online'}</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">{t('preselect') || 'Preselect'}</th>
                <th className="text-center px-3 py-2 font-medium text-gray-600">{t('available') || 'Available'}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-gray-300 cursor-grab">
                    <Bars3Icon className="w-4 h-4" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      placeholder={t('modifierName') || 'e.g. Extra cheese'}
                      className="w-full min-w-[120px] px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.kitchen_name}
                      onChange={(e) => updateRow(i, { kitchen_name: e.target.value })}
                      placeholder={t('kitchenNamePlaceholder') || 'e.g. EXT CHEESE'}
                      className="w-full min-w-[100px] px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 min-w-[90px]">
                      <input
                        type="number"
                        step="0.01"
                        value={row.price_delta}
                        onChange={(e) => updateRow(i, { price_delta: parseFloat(e.target.value) || 0 })}
                        className="w-20 px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                      />
                      <span className="text-gray-400 text-xs">₪</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={row.hide_online} onChange={(e) => updateRow(i, { hide_online: e.target.checked })} className="rounded" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={row.is_preselected} onChange={(e) => updateRow(i, { is_preselected: e.target.checked })} className="rounded" />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="checkbox" checked={row.is_active} onChange={(e) => updateRow(i, { is_active: e.target.checked })} className="rounded" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => removeRow(i)} className="p-1 text-gray-300 hover:text-red-500 rounded">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-100">
          <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700">
            <PlusIcon className="w-4 h-4" />
            {t('addModifier') || 'Add modifier'}
          </button>
        </div>
      </section>

      {/* Section 3 — Selection rules */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-800">{t('selectionRules') || 'Selection rules'}</h2>
        <Toggle
          checked={isRequired}
          onChange={setIsRequired}
          label={t('requireSelection') || 'Require selection'}
          description={t('requireSelectionDesc') || 'Customer must pick at least one modifier before adding to cart'}
        />
        {isRequired && (
          <div className="ml-0 pl-4 border-l-2 border-brand-200">
            <label className="text-sm font-medium text-gray-700">{t('minSelections') || 'Minimum selections'}</label>
            <input
              type="number"
              min={1}
              value={minSelections || 1}
              onChange={(e) => setMinSelections(Math.max(1, parseInt(e.target.value) || 1))}
              className="mt-1 w-24 px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
        )}
        <Toggle
          checked={allowMultiple}
          onChange={setAllowMultiple}
          label={t('allowMultiple') || 'Allow selection of more than one modifier'}
          description={t('allowMultipleDesc') || 'When off, selecting a modifier deselects any previous choice'}
        />
        {allowMultiple && (
          <div className="ml-0 pl-4 border-l-2 border-brand-200">
            <label className="text-sm font-medium text-gray-700">{t('maxSelections') || 'Maximum selections (0 = unlimited)'}</label>
            <input
              type="number"
              min={0}
              value={maxSelections}
              onChange={(e) => setMaxSelections(Math.max(0, parseInt(e.target.value) || 0))}
              className="mt-1 w-24 px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
        )}
      </section>

      {/* Section 4 — Settings */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <h2 className="font-semibold text-gray-800">{t('settings') || 'Settings'}</h2>
        <Toggle
          checked={hideOnReceipt}
          onChange={setHideOnReceipt}
          label={t('hideOnReceipt') || 'Hide modifiers on customer receipts'}
          description={t('hideOnReceiptDesc') || 'Modifiers in this set will not appear on customer-facing receipts'}
        />
        <Toggle
          checked={useConversational}
          onChange={setUseConversational}
          label={t('useConversational') || 'Use conversational modifiers in POS'}
          description={t('useConversationalDesc') || 'Show "Add", "Extra", "Remove" operators when displaying this group in the POS'}
        />
      </section>

      {/* Section 5 — Linked items */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="font-semibold text-gray-800">{t('linkedItems') || 'Linked menu items'}</h2>
        <p className="text-sm text-gray-500">{t('linkedItemsDesc') || 'Select which menu items this modifier set applies to'}</p>
        {allItems.length === 0 ? (
          <p className="text-sm text-gray-400">{t('noItems') || 'No menu items found'}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {allItems.map((item) => {
              const linked = linkedItemIds.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleLinkedItem(item.id)}
                  className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                    linked
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
