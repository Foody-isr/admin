'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  listVariantGroups, createVariantGroup, updateVariantGroup,
  deleteVariant, createVariant, updateVariant,
  listOptionSets, createOptionSet,
  ItemVariantGroup, VariantGroupInput, VariantInput, OptionSet, OptionSetInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface VariantRow {
  id?: number;
  name: string;
  price: number;
  online_price: number | null;
  sku: string;
  is_active: boolean;
  sort_order: number;
  isNew?: boolean;
}

interface GroupState {
  id?: number;
  title: string;
  sort_order: number;
  rows: VariantRow[];
  isNew?: boolean;
}

function blankRow(sortOrder: number): VariantRow {
  return { name: '', price: 0, online_price: null, sku: '', is_active: true, sort_order: sortOrder, isNew: true };
}

function blankGroup(sortOrder: number): GroupState {
  return { title: '', sort_order: sortOrder, rows: [blankRow(0)], isNew: true };
}

export default function VariantsEditorPage() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusGroupId = searchParams.get('group') ? Number(searchParams.get('group')) : null;
  const { t } = useI18n();

  const [groups, setGroups] = useState<GroupState[]>([blankGroup(0)]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Existing option sets for the dropdown
  const [optionSets, setOptionSets] = useState<OptionSet[]>([]);
  const [dropdownGroupIdx, setDropdownGroupIdx] = useState<number | null>(null);

  const loadGroups = useCallback(async () => {
    try {
      const [existing, os] = await Promise.all([
        listVariantGroups(rid, iid),
        listOptionSets(rid),
      ]);
      setOptionSets(os ?? []);
      if (existing.length > 0) {
        setGroups(existing.map((g: ItemVariantGroup) => ({
          id: g.id,
          title: g.title,
          sort_order: g.sort_order,
          rows: (g.variants ?? []).map((v) => ({
            id: v.id,
            name: v.name,
            price: v.price,
            online_price: v.online_price ?? null,
            sku: v.sku ?? '',
            is_active: v.is_active,
            sort_order: v.sort_order,
          })),
        })));
      }
    } finally {
      setLoading(false);
    }
  }, [rid, iid]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const groupInput: VariantGroupInput = {
          title: g.title,
          sort_order: gi,
        };

        let groupId = g.id;
        if (g.isNew || !groupId) {
          const created = await createVariantGroup(rid, iid, groupInput);
          groupId = created.id;
        } else {
          await updateVariantGroup(rid, iid, groupId, groupInput);
        }

        for (let ri = 0; ri < g.rows.length; ri++) {
          const row = g.rows[ri];
          if (!row.name.trim()) continue;
          const variantInput: VariantInput = {
            name: row.name,
            price: row.price,
            online_price: row.online_price,
            sku: row.sku,
            is_active: row.is_active,
            sort_order: ri,
          };
          if (row.isNew || !row.id) {
            await createVariant(rid, iid, groupId, variantInput);
          } else {
            await updateVariant(rid, iid, groupId, row.id, variantInput);
          }
        }

        // Auto-save new groups as reusable option sets (so they appear in the dropdown for future items)
        if ((g.isNew || !g.id) && g.title.trim()) {
          const existingNames = optionSets.map((os) => os.name.toLowerCase());
          if (!existingNames.includes(g.title.trim().toLowerCase())) {
            const osInput: OptionSetInput = {
              name: g.title.trim(),
              sort_order: gi,
              options: g.rows.filter((r) => r.name.trim()).map((r, ri) => ({
                name: r.name.trim(),
                price: r.price,
                online_price: r.online_price,
                sku: r.sku,
                is_active: r.is_active,
                sort_order: ri,
              })),
            };
            await createOptionSet(rid, osInput);
          }
        }
      }
      router.back();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateGroup = (gi: number, patch: Partial<GroupState>) => {
    setGroups((prev) => prev.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  };

  const updateRow = (gi: number, ri: number, patch: Partial<VariantRow>) => {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, rows: g.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) } : g
      )
    );
  };

  const addRow = (gi: number) => {
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, rows: [...g.rows, blankRow(g.rows.length)] } : g))
    );
  };

  const removeRow = async (gi: number, ri: number) => {
    const row = groups[gi].rows[ri];
    const g = groups[gi];
    if (!row.isNew && row.id && g.id) {
      await deleteVariant(rid, iid, g.id, row.id);
    }
    setGroups((prev) =>
      prev.map((g, i) => (i === gi ? { ...g, rows: g.rows.filter((_, j) => j !== ri) } : g))
    );
  };

  /** Apply an existing option set's options as rows for this group */
  const applyOptionSet = (gi: number, os: OptionSet) => {
    const rows: VariantRow[] = (os.options ?? []).map((o, i) => ({
      name: o.name,
      price: o.price,
      online_price: o.online_price ?? null,
      sku: o.sku ?? '',
      is_active: o.is_active,
      sort_order: i,
      isNew: true,
    }));
    updateGroup(gi, { title: os.name, rows: rows.length > 0 ? rows : [blankRow(0)] });
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
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <button onClick={() => router.back()}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-fg-primary">
          {focusGroupId ? t('editVariants') : t('addVariants')}
        </span>
        <button onClick={handleSave} disabled={saving}
          className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50">
          {saving ? t('saving') : t('done')}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {groups.map((g, gi) => (
          <div key={gi} className="space-y-4">
            {/* Group title input with option set dropdown */}
            <div className="relative">
              <input
                value={g.title}
                onChange={(e) => updateGroup(gi, { title: e.target.value })}
                onFocus={() => setDropdownGroupIdx(gi)}
                onBlur={() => setTimeout(() => setDropdownGroupIdx(null), 200)}
                placeholder={t('variantGroupTitle')}
                className="input w-full text-base"
              />
              {/* Saved option sets dropdown */}
              {dropdownGroupIdx === gi && optionSets.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-30 w-72 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
                  <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-fg-tertiary border-b border-[var(--divider)]">
                    {t('savedOptionSets') || 'Saved option sets'}
                  </div>
                  {optionSets
                    .filter((os) => !g.title || os.name.toLowerCase().includes(g.title.toLowerCase()))
                    .map((os) => (
                    <button key={os.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyOptionSet(gi, os)}
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
              {/* Table header */}
              <div className="grid text-xs font-medium text-fg-tertiary uppercase tracking-wide px-4 py-2.5 border-b-2 border-fg-primary"
                style={{ gridTemplateColumns: '1fr 110px 110px 80px 80px 36px' }}>
                <span>{t('variantName')}</span>
                <span>{t('price')}</span>
                <span>{t('onlinePrice')}</span>
                <span>SKU</span>
                <span>{t('status')}</span>
                <span />
              </div>

              {/* Rows */}
              {g.rows.map((row, ri) => (
                <div key={ri}
                  className="grid items-center px-4 py-2.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ gridTemplateColumns: '1fr 110px 110px 80px 80px 36px' }}>
                  <input value={row.name}
                    onChange={(e) => updateRow(gi, ri, { name: e.target.value })}
                    placeholder={t('variantName')}
                    className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2" />
                  <input type="number" min="0" step="0.01"
                    value={row.price === 0 ? '' : row.price}
                    onChange={(e) => updateRow(gi, ri, { price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2" />
                  <input type="number" min="0" step="0.01"
                    value={row.online_price === null ? '' : row.online_price}
                    onChange={(e) => updateRow(gi, ri, { online_price: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2" />
                  <input value={row.sku}
                    onChange={(e) => updateRow(gi, ri, { sku: e.target.value })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2" />
                  <select value={row.is_active ? 'active' : 'inactive'}
                    onChange={(e) => updateRow(gi, ri, { is_active: e.target.value === 'active' })}
                    className="text-xs bg-transparent border-0 outline-none text-fg-secondary">
                    <option value="active">{t('available')}</option>
                    <option value="inactive">{t('unavailable')}</option>
                  </select>
                  <button onClick={() => removeRow(gi, ri)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-fg-tertiary hover:text-red-400 transition-colors">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Add row */}
              <button onClick={() => addRow(gi)}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-brand-500 hover:bg-[var(--surface-subtle)] transition-colors border-t border-[var(--divider)]">
                <PlusIcon className="w-4 h-4" />
                {t('addVariant')}
              </button>
            </div>
          </div>
        ))}

        {/* Add another set */}
        <button onClick={() => setGroups((prev) => [...prev, blankGroup(prev.length)])}
          className="flex items-center gap-2 text-base font-medium text-fg-primary underline">
          <PlusIcon className="w-4 h-4" />
          {t('addAnotherSet')}
        </button>
      </div>
    </div>
  );
}
