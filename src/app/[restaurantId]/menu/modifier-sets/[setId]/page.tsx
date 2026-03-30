'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getModifierSet, createModifierSet, updateModifierSet,
  deleteModifier, createModifierInSet, reorderModifierSetModifiers,
  ModifierSetInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import {
  XMarkIcon, PlusIcon, Bars3Icon, TrashIcon,
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
  const [hideOnReceipt, setHideOnReceipt] = useState(false);
  const [useConversational, setUseConversational] = useState(false);
  const [rows, setRows] = useState<ModifierRow[]>([blankRow(0)]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const loadSet = useCallback(async () => {
    if (isNew) return;
    const set = await getModifierSet(rid, Number(setId));
    setName(set.name);
    setDisplayName(set.display_name);
    setIsRequired(set.is_required);
    setAllowMultiple(set.allow_multiple);
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
    })));
    setLoading(false);
  }, [rid, setId, isNew]);

  useEffect(() => { loadSet(); }, [loadSet]);

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
        min_selections: isRequired ? minSelections : 0,
        max_selections: allowMultiple ? maxSelections : 0,
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
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
            <h2 className="font-semibold text-fg-primary">{t('modifierList') || 'Modifier list'}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--divider)' }}>
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="text-left px-3 py-2 font-medium text-fg-secondary">{t('name') || 'Name'}</th>
                  <th className="text-left px-3 py-2 font-medium text-fg-secondary">{t('kitchenName') || 'Kitchen name'}</th>
                  <th className="text-left px-3 py-2 font-medium text-fg-secondary">{t('price') || 'Price'}</th>
                  <th className="text-center px-3 py-2 font-medium text-fg-secondary">{t('hideOnline') || 'Hide online'}</th>
                  <th className="text-center px-3 py-2 font-medium text-fg-secondary">{t('preselect') || 'Preselect'}</th>
                  <th className="text-center px-3 py-2 font-medium text-fg-secondary">{t('available') || 'Available'}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderTop: i > 0 ? '1px solid var(--divider)' : undefined }}>
                    <td className="px-3 py-2 text-fg-secondary/30 cursor-grab">
                      <Bars3Icon className="w-4 h-4" />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(i, { name: e.target.value })}
                        placeholder={t('modifierName') || 'e.g. Extra cheese'}
                        className="w-full min-w-[120px] px-2 py-1 text-sm bg-transparent outline-none text-fg-primary placeholder:text-fg-secondary/50 rounded"
                        style={{ border: '1px solid var(--divider)' }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.kitchen_name}
                        onChange={(e) => updateRow(i, { kitchen_name: e.target.value })}
                        placeholder={t('kitchenNamePlaceholder') || 'e.g. EXT'}
                        className="w-full min-w-[100px] px-2 py-1 text-sm bg-transparent outline-none text-fg-primary placeholder:text-fg-secondary/50 rounded"
                        style={{ border: '1px solid var(--divider)' }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={row.price_delta}
                          onChange={(e) => updateRow(i, { price_delta: parseFloat(e.target.value) || 0 })}
                          className="w-20 px-2 py-1 text-sm bg-transparent outline-none text-fg-primary rounded"
                          style={{ border: '1px solid var(--divider)' }}
                        />
                        <span className="text-fg-secondary/50 text-xs">₪</span>
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
                      <button onClick={() => removeRow(i)} className="p-1 text-fg-secondary/30 hover:text-red-500 rounded transition-colors">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3" style={{ borderTop: '1px solid var(--divider)' }}>
            <button onClick={addRow} className="flex items-center gap-1.5 text-sm text-brand-500 hover:text-brand-600 transition-colors">
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

        {/* Quantity rules */}
        <div className="card px-4 py-4">
          <h2 className="font-semibold text-fg-primary mb-4">{t('quantityRules') || 'Quantity rules'}</h2>

          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <p className="text-sm font-medium text-fg-primary">{t('minSelectionsLabel') || 'Minimum selections'}</p>
              <p className="text-xs text-fg-secondary mt-0.5">{t('minSelectionsHint') || 'Add modifiers to define a minimum'}</p>
            </div>
            <select
              value={minSelections}
              onChange={(e) => setMinSelections(Number(e.target.value))}
              disabled={!isRequired}
              className="px-3 py-1.5 text-sm rounded-lg outline-none transition-opacity disabled:opacity-40 text-fg-primary"
              style={{ border: '1px solid var(--divider)', background: 'var(--surface-subtle)' }}
            >
              {selectionOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-fg-primary">{t('maxSelectionsLabel') || 'Maximum selections'}</p>
              <p className="text-xs text-fg-secondary mt-0.5">{t('maxSelectionsHint') || 'Add modifiers to define a maximum'}</p>
            </div>
            <select
              value={maxSelections}
              onChange={(e) => setMaxSelections(Number(e.target.value))}
              disabled={!allowMultiple}
              className="px-3 py-1.5 text-sm rounded-lg outline-none transition-opacity disabled:opacity-40 text-fg-primary"
              style={{ border: '1px solid var(--divider)', background: 'var(--surface-subtle)' }}
            >
              <option value={0}>{t('noMaximum') || 'No maximum'}</option>
              {selectionOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <div style={{ borderTop: '1px solid var(--divider)', marginTop: '1rem' }} />

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
