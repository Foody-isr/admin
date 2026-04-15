'use client';

import { useEffect, useState, useCallback, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getModifierSet, createModifierSet, updateModifierSet,
  deleteModifier, createModifierInSet, reorderModifierSetModifiers,
  listStockItems, listPrepItems,
  ModifierSetInput, StockItem, PrepItem,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon, PlusIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import { PhotoIcon } from '@heroicons/react/24/outline';

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
  // Stock consumption — when a customer picks this modifier, it consumes
  // `quantity` of the linked stock or prep item. Empty = no inventory impact.
  stock_item_id?: number | null;
  prep_item_id?: number | null;
  quantity: number;
  unit: string;
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
    stock_item_id: null,
    prep_item_id: null,
    quantity: 0,
    unit: 'g',
    isNew: true,
  };
}

export default function ModifierSetEditorPage() {
  const { restaurantId, setId } = useParams();
  const rid = Number(restaurantId);
  const isNew = setId === 'new';
  const router = useRouter();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [minSelections, setMinSelections] = useState(1);
  const [maxSelections, setMaxSelections] = useState(0);
  const [allowQuantities, setAllowQuantities] = useState(false);
  const [hideOnReceipt, setHideOnReceipt] = useState(false);
  const [useConversational, setUseConversational] = useState(false);
  const [rows, setRows] = useState<ModifierRow[]>([blankRow(0)]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  // Inventory sources for the per-row stock picker.
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [prepItems, setPrepItems] = useState<PrepItem[]>([]);
  // Which row has its stock-consumption subrow expanded.
  const [expandedStockIdx, setExpandedStockIdx] = useState<number | null>(null);

  const loadSet = useCallback(async () => {
    if (isNew) return;
    const set = await getModifierSet(rid, Number(setId));
    setName(set.name);
    setDisplayName(set.display_name);
    setIsRequired(set.is_required);
    setAllowMultiple(set.allow_multiple);
    const hasCustomQuantities = set.min_selections > 1 || set.max_selections > 0;
    setAllowQuantities(hasCustomQuantities);
    setMinSelections(set.min_selections || 1);
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
      stock_item_id: m.stock_item_id ?? null,
      prep_item_id: m.prep_item_id ?? null,
      quantity: m.quantity ?? 0,
      unit: m.unit || 'g',
    })));
    setLoading(false);
  }, [rid, setId, isNew]);

  useEffect(() => { loadSet(); }, [loadSet]);
  useEffect(() => {
    Promise.all([listStockItems(rid), listPrepItems(rid)])
      .then(([s, p]) => { setStockItems(s); setPrepItems(p); })
      .catch(() => {});
  }, [rid]);

  const updateRow = (index: number, patch: Partial<ModifierRow>) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  };

  const addRow = () => setRows((prev) => [...prev, blankRow(prev.length)]);

  const removeRow = async (index: number) => {
    const row = rows[index];
    if (row.id && !isNew) {
      if (!confirm(t('deleteThisModifier') || 'Delete this modifier?')) return;
      await deleteModifier(rid, row.id);
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
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
        min_selections: (allowMultiple && allowQuantities) ? minSelections : 0,
        max_selections: (allowMultiple && allowQuantities) ? maxSelections : 0,
        hide_on_receipt: hideOnReceipt,
        use_conversational: useConversational,
      };

      if (isNew) {
        const newRows = rows.filter((r) => r.name.trim());
        input.modifiers = newRows.map((r, i) => ({ ...r, sort_order: i }));
        await createModifierSet(rid, input);
      } else {
        const setID = Number(setId);
        await updateModifierSet(rid, setID, input);
        const newRows = rows.filter((r) => r.isNew && r.name.trim());
        for (const row of newRows) {
          await createModifierInSet(rid, setID, row);
        }
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
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const Toggle = ({ checked, onChange, label, description }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    description?: string;
  }) => (
    <div className="flex items-start justify-between gap-4 py-4" style={{ borderTop: '1px solid var(--divider)' }}>
      <div>
        <p className="text-sm font-medium text-fg-primary">{label}</p>
        {description && <p className="text-xs mt-0.5 text-fg-secondary">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-brand-600' : 'bg-gray-300'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );

  const namedRowCount = Math.max(rows.filter((r) => r.name.trim()).length, 5);
  const selectionOptions = Array.from({ length: namedRowCount }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)' }}>

      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--divider)' }}
      >
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center transition-colors text-fg-secondary hover:text-fg-primary"
          style={{ border: '1px solid var(--divider)' }}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-fg-primary">
          {isNew ? (t('createModifierSet') || 'Create modifier set') : (t('editModifierSet') || 'Edit modifier set')}
        </h1>
        <button onClick={handleSave} disabled={saving} className="btn-primary px-6 disabled:opacity-50">
          {saving ? (t('saving') || 'Saving…') : (t('save') || 'Save')}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

        {/* Identity */}
        <div className="card p-0">
          <div className="px-4 pt-3 pb-2">
            <label className="block text-xs font-medium text-fg-secondary mb-1">
              {t('internalName') || 'Internal name'} *
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Toppings"
              className="w-full bg-transparent border-0 outline-none text-base text-fg-primary placeholder:text-fg-secondary/50"
            />
          </div>
          <div style={{ borderTop: '1px solid var(--divider)' }} className="px-4 pt-3 pb-3">
            <label className="block text-xs font-medium text-fg-secondary mb-1">
              {t('displayName') || 'Display name'}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('displayNamePlaceholder') || 'Shown to customers (leave blank to use internal name)'}
              className="w-full bg-transparent border-0 outline-none text-base text-fg-primary placeholder:text-fg-secondary/50"
            />
          </div>
        </div>

        {/* Modifier list */}
        <div className="card p-0 overflow-hidden">
          {/* Section title — not scrollable */}
          <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
            <h2 className="font-bold text-fg-primary text-base">{t('modifierList') || 'Modifier list'}</h2>
          </div>

          {/* Sticky column headers */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 48 }} />   {/* image */}
                <col style={{ width: '28%' }} /> {/* name */}
                <col style={{ width: '22%' }} /> {/* kitchen name */}
                <col style={{ width: 110 }} />   {/* price */}
                <col style={{ width: 80 }} />    {/* hide online */}
                <col style={{ width: 80 }} />    {/* preselect */}
                <col style={{ width: 120 }} />   {/* availability toggle */}
                <col style={{ width: 40 }} />    {/* drag / delete */}
              </colgroup>
              <thead style={{ borderBottom: '1px solid var(--divider)' }}>
                <tr>
                  <th className="px-3 py-2" />
                  <th className="text-left px-3 py-2 font-medium text-fg-secondary text-xs">{t('name') || 'Name'}</th>
                  <th className="text-left px-3 py-2 font-medium text-fg-secondary text-xs">{t('kitchenName') || 'Kitchen name'}</th>
                  <th className="text-left px-3 py-2 font-medium text-fg-secondary text-xs">{t('price') || 'Price'}</th>
                  <th className="text-center px-2 py-2 font-medium text-fg-secondary text-xs leading-tight">{t('hideOnline') || 'Hide online'}</th>
                  <th className="text-center px-2 py-2 font-medium text-fg-secondary text-xs leading-tight">{t('preselect') || 'Preselect'}</th>
                  <th className="text-left px-3 py-2 font-medium text-fg-secondary text-xs">{t('available') || 'Availability'}</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <Fragment key={i}>
                  <tr
                    className="group"
                    style={{ borderTop: '1px solid var(--divider)' }}
                  >
                    {/* Image placeholder */}
                    <td className="px-3 py-3">
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center text-fg-secondary/40 cursor-pointer hover:text-fg-secondary transition-colors"
                        style={{ border: '1px solid var(--divider)' }}
                      >
                        <PhotoIcon className="w-4 h-4" />
                      </div>
                    </td>
                    {/* Name */}
                    <td className="px-3 py-3">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        placeholder={t('modifierName') || 'New modifier'}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-fg-primary placeholder:text-fg-secondary/40 rounded"
                        style={{ border: '1px solid var(--divider)' }}
                      />
                    </td>
                    {/* Kitchen name */}
                    <td className="px-3 py-3">
                      <input
                        value={row.kitchen_name}
                        onChange={(e) => updateRow(i, { kitchen_name: e.target.value })}
                        placeholder={t('kitchenNamePlaceholder') || 'Abbrev.'}
                        className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-fg-primary placeholder:text-fg-secondary/40 rounded"
                        style={{ border: '1px solid var(--divider)' }}
                      />
                    </td>
                    {/* Price */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={row.price_delta}
                          onChange={(e) => updateRow(i, { price_delta: parseFloat(e.target.value) || 0 })}
                          className="w-full px-2 py-1.5 text-sm bg-transparent outline-none text-fg-primary rounded"
                          style={{ border: '1px solid var(--divider)' }}
                        />
                        <span className="text-fg-secondary/50 text-xs shrink-0">₪</span>
                      </div>
                    </td>
                    {/* Hide online */}
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.hide_online}
                        onChange={(e) => updateRow(i, { hide_online: e.target.checked })}
                        className="rounded w-4 h-4"
                      />
                    </td>
                    {/* Preselect */}
                    <td className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={row.is_preselected}
                        onChange={(e) => updateRow(i, { is_preselected: e.target.checked })}
                        className="rounded w-4 h-4"
                      />
                    </td>
                    {/* Availability toggle */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateRow(i, { is_active: !row.is_active })}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${row.is_active ? 'bg-gray-800' : 'bg-gray-300'}`}
                        >
                          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${row.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                        </button>
                        <span className="text-xs text-fg-secondary whitespace-nowrap">
                          {row.is_active ? (t('inStock') || 'In stock') : (t('outOfStock') || 'Out of stock')}
                        </span>
                      </div>
                    </td>
                    {/* Drag handle + delete on hover */}
                    <td className="px-2 py-3">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => removeRow(i)}
                          className="p-1 text-fg-secondary/20 hover:text-red-500 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                        <div className="cursor-grab text-fg-secondary/30 p-1">
                          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                            <circle cx="2" cy="2" r="1.5"/><circle cx="8" cy="2" r="1.5"/>
                            <circle cx="2" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/>
                            <circle cx="2" cy="14" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
                          </svg>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {/* Stock-consumption subrow — opt-in per modifier. A closed
                      state shows a single link to open; an open state shows the
                      picker + qty + unit. Picking "None" collapses back. */}
                  <tr>
                    <td colSpan={8} className="px-3 pb-3" style={{ borderTop: '1px dashed var(--divider)' }}>
                      {(() => {
                        const hasLink = !!(row.stock_item_id || row.prep_item_id);
                        const isOpen = expandedStockIdx === i || hasLink;
                        if (!isOpen) {
                          return (
                            <button
                              type="button"
                              onClick={() => setExpandedStockIdx(i)}
                              className="text-xs text-fg-tertiary hover:text-brand-500 transition-colors pl-12"
                            >
                              + {t('linkStockConsumption') || 'Link stock consumption'}
                            </button>
                          );
                        }
                        const pickerValue = row.stock_item_id ? `s:${row.stock_item_id}` : row.prep_item_id ? `p:${row.prep_item_id}` : '';
                        return (
                          <div className="flex items-center gap-2 text-xs text-fg-secondary pl-12">
                            <span className="text-fg-tertiary">{t('consumesFromStock') || 'Consumes'}:</span>
                            <select
                              value={pickerValue}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) {
                                  updateRow(i, { stock_item_id: null, prep_item_id: null });
                                  setExpandedStockIdx(null);
                                } else if (v.startsWith('s:')) {
                                  updateRow(i, { stock_item_id: Number(v.slice(2)), prep_item_id: null });
                                } else {
                                  updateRow(i, { prep_item_id: Number(v.slice(2)), stock_item_id: null });
                                }
                              }}
                              className="px-2 py-1 rounded text-xs bg-transparent"
                              style={{ border: '1px solid var(--divider)' }}
                            >
                              <option value="">— {t('none') || 'None'} —</option>
                              <optgroup label={t('stockItems') || 'Stock items'}>
                                {stockItems.map((s) => (
                                  <option key={`s-${s.id}`} value={`s:${s.id}`}>{s.name}</option>
                                ))}
                              </optgroup>
                              <optgroup label={t('prepItems') || 'Prep items'}>
                                {prepItems.map((p) => (
                                  <option key={`p-${p.id}`} value={`p:${p.id}`}>{p.name}</option>
                                ))}
                              </optgroup>
                            </select>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={row.quantity || ''}
                              onChange={(e) => updateRow(i, { quantity: parseFloat(e.target.value) || 0 })}
                              placeholder={t('qty') || 'Qty'}
                              className="w-20 px-2 py-1 rounded text-xs bg-transparent text-right"
                              style={{ border: '1px solid var(--divider)' }}
                            />
                            <select
                              value={row.unit || 'g'}
                              onChange={(e) => updateRow(i, { unit: e.target.value })}
                              className="px-2 py-1 rounded text-xs bg-transparent"
                              style={{ border: '1px solid var(--divider)' }}
                            >
                              <option value="g">g</option>
                              <option value="kg">kg</option>
                              <option value="ml">ml</option>
                              <option value="l">l</option>
                              <option value="unit">unit</option>
                            </select>
                            <span className="text-fg-tertiary">{t('perSelection') || 'per selection'}</span>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add modifier */}
          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--divider)' }}>
            <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-600 transition-colors font-medium">
              <PlusIcon className="w-4 h-4" />
              {t('addModifier') || 'Add modifier'}
            </button>
          </div>
        </div>

        {/* Selection rules */}
        <div className="card px-4 py-4">
          <h2 className="font-semibold text-fg-primary mb-1">{t('selectionRules') || 'Selection rules'}</h2>
          <p className="text-sm text-fg-secondary mb-2">
            {t('selectionRulesDesc') || 'These are the default settings for customization. You can override them per item.'}
          </p>
          <Toggle
            checked={isRequired}
            onChange={setIsRequired}
            label={t('requireSelection') || 'Require selection'}
          />
          <Toggle
            checked={allowMultiple}
            onChange={setAllowMultiple}
            label={t('allowMultiple') || 'Allow selection of more than one modifier'}
          />
        </div>

        {/* Quantity rules — only visible when Allow multiple is on */}
        {allowMultiple && (
          <div className="card p-0">
            <div className="px-5 py-4">
              <h2 className="font-bold text-fg-primary text-base mb-4">{t('quantityRules') || 'Quantity rules'}</h2>

              {/* Allow quantities toggle */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-fg-primary">
                    {t('allowQuantities') || 'Allow multiple quantities per modifier'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAllowQuantities((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${allowQuantities ? 'bg-gray-800' : 'bg-gray-300'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${allowQuantities ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>

            {/* Min selections */}
            <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderTop: '1px solid var(--divider)' }}>
              <p className="text-sm font-semibold text-fg-primary">{t('minSelectionsLabel') || 'Minimum selections'}</p>
              <div className="flex flex-col items-end gap-1">
                <select
                  value={minSelections}
                  onChange={(e) => setMinSelections(Number(e.target.value))}
                  disabled={!allowQuantities}
                  className="w-48 px-3 py-2 text-sm rounded-lg outline-none transition-opacity text-fg-primary"
                  style={{
                    border: '1px solid var(--divider)',
                    background: allowQuantities ? 'var(--surface)' : 'var(--surface-subtle)',
                    opacity: allowQuantities ? 1 : 0.6,
                  }}
                >
                  {selectionOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <p className="text-xs text-fg-secondary">{t('minSelectionsHint') || 'Add modifiers to define a minimum'}</p>
              </div>
            </div>

            {/* Max selections */}
            <div className="flex items-center justify-between gap-4 px-5 py-4" style={{ borderTop: '1px solid var(--divider)' }}>
              <p className="text-sm font-semibold text-fg-primary">{t('maxSelectionsLabel') || 'Maximum selections'}</p>
              <div className="flex flex-col items-end gap-1">
                <select
                  value={maxSelections}
                  onChange={(e) => setMaxSelections(Number(e.target.value))}
                  disabled={!allowQuantities}
                  className="w-48 px-3 py-2 text-sm rounded-lg outline-none transition-opacity text-fg-primary"
                  style={{
                    border: '1px solid var(--divider)',
                    background: allowQuantities ? 'var(--surface)' : 'var(--surface-subtle)',
                    opacity: allowQuantities ? 1 : 0.6,
                  }}
                >
                  <option value={0}>{t('noMaximum') || 'No maximum'}</option>
                  {selectionOptions.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <p className="text-xs text-fg-secondary">{t('maxSelectionsHint') || 'Add modifiers to define a maximum'}</p>
              </div>
            </div>
          </div>
        )}

        {/* Settings */}
        <div className="card px-4 pt-4 pb-0">
          <h2 className="font-bold text-fg-primary text-base mb-2">{t('settings') || 'Settings'}</h2>
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
        </div>

      </div>
    </div>
  );
}
