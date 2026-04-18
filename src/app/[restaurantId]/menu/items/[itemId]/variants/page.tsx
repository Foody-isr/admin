'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listOptionSets, getItemOptionPrices, listAllItems, updateMenuItem,
  syncItemVariants, VariantGroupSyncInput,
  OptionSet, ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

/* ── Local row state (not yet persisted) ─────────────────────────── */

interface VariantRow {
  key: string;
  optionId?: number; // set when linked to a real OptionSetOption
  name: string;
  price: string;
  portionSize: string;
  portionSizeUnit: string;
  isActive: boolean;
}

interface GroupState {
  key: string;
  optionSetId?: number; // set when linked to a real OptionSet
  title: string;
  rows: VariantRow[];
}

function newRow(defaultUnit: string = 'g'): VariantRow {
  return {
    key: crypto.randomUUID(),
    name: '', price: '',
    portionSize: '', portionSizeUnit: defaultUnit,
    isActive: true,
  };
}

function newGroup(defaultUnit: string = 'g'): GroupState {
  return { key: crypto.randomUUID(), title: '', rows: [newRow(defaultUnit)] };
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function VariantsEditorPage() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const { t } = useI18n();

  const [groups, setGroups] = useState<GroupState[]>([newGroup()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // The parent item's portion — used as the default unit when the user adds
  // new variants, and to detect whether the item is still at the default
  // "1 unit" so we can auto-sync it to the first variant's unit on save.
  const [itemPortionUnit, setItemPortionUnit] = useState('g');
  const [itemPortionSize, setItemPortionSize] = useState(0);

  // Existing option sets for the dropdown
  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);
  const [dropdownGroupIdx, setDropdownGroupIdx] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [optSets, overrides, items] = await Promise.all([
        listOptionSets(rid),
        getItemOptionPrices(rid, iid),
        listAllItems(rid),
      ]);
      setAllOptionSets(optSets ?? []);
      const parentItem = (items ?? []).find((i) => i.id === iid);
      const defaultUnit = parentItem?.portion_size_unit || 'g';
      setItemPortionUnit(defaultUnit);
      setItemPortionSize(parentItem?.portion_size ?? 0);

      // Build override lookup
      const overrideMap = new Map<number, ItemOptionOverride>();
      for (const ov of overrides ?? []) {
        overrideMap.set(ov.option_id, ov);
      }

      // Find option sets attached to this item and build groups
      const attached: GroupState[] = [];
      for (const os of optSets ?? []) {
        if ((os.menu_items ?? []).some((mi) => mi.id === iid)) {
          attached.push({
            key: crypto.randomUUID(),
            optionSetId: os.id,
            title: os.name,
            rows: (os.options ?? []).map((opt) => {
              const ov = overrideMap.get(opt.id);
              return {
                key: crypto.randomUUID(),
                optionId: opt.id,
                name: opt.name,
                price: String(ov?.price ?? opt.price),
                portionSize: (ov?.portion_size ?? 0) > 0 ? String(ov!.portion_size) : '',
                portionSizeUnit: ov?.portion_size_unit || defaultUnit,
                isActive: ov?.is_active ?? opt.is_active,
              };
            }),
          });
        }
      }
      if (attached.length > 0) {
        setGroups(attached);
      } else {
        // No attached option sets yet — replace the initial placeholder group
        // so its portion unit matches the item's default rather than 'g'.
        setGroups([newGroup(defaultUnit)]);
      }
    } finally {
      setLoading(false);
    }
  }, [rid, iid]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Save: one atomic sync call ──────────────────────────────── */

  const handleSave = async () => {
    setSaving(true);
    try {
      // Build the full desired state. Groups with no title and no rows are
      // dropped (the UI starts with an empty placeholder group). For groups
      // the user has opened but left empty, we still send them with a
      // fallback title of "Options" — the server will create or reuse.
      const payloadGroups: VariantGroupSyncInput[] = [];
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const validRows = g.rows.filter((r) => r.name.trim());
        if (validRows.length === 0 && !g.title.trim()) continue;

        payloadGroups.push({
          option_set_id: g.optionSetId ?? null,
          name: g.title.trim(),
          sort_order: gi,
          variants: validRows.map((r, vi) => ({
            option_id: r.optionId ?? null,
            name: r.name.trim(),
            price: parseFloat(r.price) || 0,
            portion_size: r.portionSize ? parseFloat(r.portionSize) : 0,
            portion_size_unit: r.portionSizeUnit || 'g',
            is_active: r.isActive,
            sort_order: vi,
          })),
        });
      }

      await syncItemVariants(rid, iid, { groups: payloadGroups });

      // Auto-sync: if the parent item is still at the default "1 unit" portion
      // but the user is creating variants with a different unit family (e.g.
      // grams), adopt the first variant's unit as the item's base portion so
      // variant scaling on ingredients works out of the box. Same-family case
      // and already-customized portions are left alone.
      const firstVariant = groups.flatMap((g) => g.rows).find((r) => r.name.trim() && r.portionSize);
      const itemIsDefault = itemPortionSize === 1 && itemPortionUnit === 'unit';
      if (firstVariant && itemIsDefault && firstVariant.portionSizeUnit && firstVariant.portionSizeUnit !== 'unit') {
        const qty = parseFloat(firstVariant.portionSize);
        if (Number.isFinite(qty) && qty > 0) {
          await updateMenuItem(rid, iid, {
            portion_size: qty,
            portion_size_unit: firstVariant.portionSizeUnit,
          });
        }
      }

      setDirty(false);
      router.back();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (dirty && !confirm(t('discardUnsavedChanges') || 'Discard unsaved changes?')) return;
    router.back();
  };

  /* ── Group/row helpers ─────────────────────────────────────────── */

  const updateGroup = (key: string, patch: Partial<GroupState>) => {
    setDirty(true);
    setGroups((prev) => prev.map((g) => g.key === key ? { ...g, ...patch } : g));
  };

  const updateRow = (groupKey: string, rowKey: string, patch: Partial<VariantRow>) => {
    setDirty(true);
    setGroups((prev) => prev.map((g) => {
      if (g.key !== groupKey) return g;
      return { ...g, rows: g.rows.map((r) => r.key === rowKey ? { ...r, ...patch } : r) };
    }));
  };

  const addRow = (groupKey: string) => {
    setDirty(true);
    setGroups((prev) => prev.map((g) =>
      g.key === groupKey ? { ...g, rows: [...g.rows, newRow(itemPortionUnit)] } : g
    ));
  };

  const removeRow = (groupKey: string, rowKey: string) => {
    setDirty(true);
    setGroups((prev) => prev.map((g) =>
      g.key === groupKey ? { ...g, rows: g.rows.filter((r) => r.key !== rowKey) } : g
    ));
  };

  // Remove a group from local state only. The server-side detach happens on
  // save: groups dropped from the payload get their item↔set join removed and
  // per-item overrides cleaned up inside the single sync transaction.
  const removeGroup = (key: string) => {
    setDirty(true);
    setGroups((prev) => prev.filter((g) => g.key !== key));
  };

  const addGroup = () => {
    setDirty(true);
    setGroups((prev) => [...prev, newGroup(itemPortionUnit)]);
  };

  /** Apply an existing option set from the dropdown */
  const applyOptionSet = (groupKey: string, os: OptionSet) => {
    updateGroup(groupKey, {
      optionSetId: os.id,
      title: os.name,
      rows: (os.options ?? []).map((opt) => ({
        key: crypto.randomUUID(),
        optionId: opt.id,
        name: opt.name,
        price: String(opt.price),
        portionSize: '',
        portionSizeUnit: itemPortionUnit,
        isActive: opt.is_active,
      })),
    });
    setDropdownGroupIdx(null);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface)]">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <button onClick={handleClose}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-fg-primary">{t('addVariants')}</span>
        <button onClick={handleSave} disabled={saving}
          className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50">
          {saving ? t('saving') : t('done')}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {groups.map((g, gi) => (
          <div key={g.key} className="space-y-4">
            {/* Group title with option set dropdown */}
            <div className="relative">
              <input
                value={g.title}
                onChange={(e) => updateGroup(g.key, { title: e.target.value, optionSetId: undefined })}
                onFocus={() => setDropdownGroupIdx(gi)}
                onBlur={() => setTimeout(() => setDropdownGroupIdx(null), 200)}
                placeholder={t('variantGroupTitle')}
                className="input w-full text-base"
              />
              {dropdownGroupIdx === gi && allOptionSets.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-30 w-80 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                  <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-fg-tertiary border-b border-[var(--divider)]">
                    {t('savedOptionSets') || 'Saved option sets'}
                  </div>
                  {allOptionSets
                    .filter((os) => !g.title || os.name.toLowerCase().includes(g.title.toLowerCase()))
                    .map((os) => (
                    <button key={os.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyOptionSet(g.key, os)}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors">
                      <span className="text-sm font-medium text-fg-primary">{os.name}</span>
                      <p className="text-xs text-fg-tertiary">
                        {(os.options ?? []).map((o) => o.name).join(', ')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Variants table */}
            <div className="rounded-xl border border-[var(--divider)] overflow-hidden">
              <div className="grid text-xs font-medium text-fg-tertiary uppercase tracking-wide px-4 py-2.5 border-b-2 border-fg-primary"
                style={{ gridTemplateColumns: '1fr 100px 100px 100px 36px' }}>
                <span>{t('variantName')}</span>
                <span>{t('price')}</span>
                <span>{t('portionSize')}</span>
                <span>{t('status')}</span>
                <span />
              </div>

              {g.rows.map((row) => (
                <div key={row.key} className="border-b border-[var(--divider)] last:border-b-0">
                  <div className="grid items-center px-4 py-2.5 hover:bg-[var(--surface-subtle)] transition-colors"
                    style={{ gridTemplateColumns: '1fr 100px 100px 100px 36px' }}>
                    <input value={row.name}
                      onChange={(e) => updateRow(g.key, row.key, { name: e.target.value })}
                      placeholder={t('variantName')}
                      className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2" />
                    <input type="number" min="0" step="0.01"
                      value={row.price}
                      onChange={(e) => updateRow(g.key, row.key, { price: e.target.value })}
                      placeholder="0.00"
                      className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2" />
                    <div className="flex items-center gap-1">
                      <input type="number" min="0" step="any"
                        value={row.portionSize}
                        onChange={(e) => updateRow(g.key, row.key, { portionSize: e.target.value })}
                        placeholder="0"
                        className="text-sm bg-transparent border-0 outline-none text-fg-secondary w-14" />
                      <select value={row.portionSizeUnit}
                        onChange={(e) => updateRow(g.key, row.key, { portionSizeUnit: e.target.value })}
                        className="text-xs bg-transparent border-0 outline-none text-fg-tertiary w-12">
                        <option value="unit">unit</option>
                        <option value="g">g</option><option value="kg">kg</option>
                        <option value="ml">ml</option><option value="l">l</option>
                      </select>
                    </div>
                    <select value={row.isActive ? 'active' : 'inactive'}
                      onChange={(e) => updateRow(g.key, row.key, { isActive: e.target.value === 'active' })}
                      className="text-xs bg-transparent border-0 outline-none text-fg-secondary">
                      <option value="active">{t('available')}</option>
                      <option value="inactive">{t('unavailable')}</option>
                    </select>
                    <button onClick={() => removeRow(g.key, row.key)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-fg-tertiary hover:text-red-400 transition-colors">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              <button onClick={() => addRow(g.key)}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-brand-500 hover:bg-[var(--surface-subtle)] transition-colors border-t border-[var(--divider)]">
                <PlusIcon className="w-4 h-4" />
                {t('addVariant')}
              </button>
            </div>

            {/* Remove group */}
            {groups.length > 1 && (
              <button onClick={() => removeGroup(g.key)}
                className="text-sm text-red-500 hover:text-red-600 font-medium hover:underline">
                {t('remove')}
              </button>
            )}
          </div>
        ))}

        <button onClick={addGroup}
          className="flex items-center gap-2 text-base font-medium text-fg-primary underline">
          <PlusIcon className="w-4 h-4" />
          {t('addAnotherSet')}
        </button>
      </div>
    </div>
  );
}
