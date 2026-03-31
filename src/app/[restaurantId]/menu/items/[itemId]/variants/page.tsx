'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  listVariantGroups, createVariantGroup, updateVariantGroup,
  deleteVariant, createVariant, updateVariant,
  ItemVariantGroup, VariantGroupInput, VariantInput,
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

  const loadGroups = useCallback(async () => {
    try {
      const existing = await listVariantGroups(rid, iid);
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

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: 'var(--bg)' }}>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-6 py-4"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--divider)' }}
      >
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
          style={{ border: '1px solid var(--divider)' }}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <h1 className="text-base font-semibold text-fg-primary">
          {focusGroupId ? t('editVariants') : t('addVariants')}
        </h1>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-6 disabled:opacity-50"
        >
          {saving ? t('saving') : t('ok')}
        </button>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {groups.map((g, gi) => (
          <div key={gi} className="space-y-4">
            {/* Group title input */}
            <div className="card p-0">
              <input
                value={g.title}
                onChange={(e) => updateGroup(gi, { title: e.target.value })}
                placeholder={t('variantGroupTitle')}
                className="w-full px-4 py-3 text-sm bg-transparent border-0 outline-none text-fg-primary"
              />
            </div>

            {/* Variants table */}
            <div className="card p-0 overflow-hidden">
              {/* Table header */}
              <div
                className="grid text-xs font-medium text-fg-secondary px-4 py-2"
                style={{
                  gridTemplateColumns: '1fr 110px 110px 80px 80px 36px',
                  borderBottom: '1px solid var(--divider)',
                }}
              >
                <span>{t('variantName')}</span>
                <span>{t('price')}</span>
                <span>{t('onlinePrice')}</span>
                <span>{t('sku')}</span>
                <span>{t('status')}</span>
                <span />
              </div>

              {/* Rows */}
              {g.rows.map((row, ri) => (
                <div
                  key={ri}
                  className="grid items-center px-4 py-2"
                  style={{
                    gridTemplateColumns: '1fr 110px 110px 80px 80px 36px',
                    borderBottom: ri < g.rows.length - 1 ? '1px solid var(--divider)' : undefined,
                  }}
                >
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(gi, ri, { name: e.target.value })}
                    placeholder={t('variantName')}
                    className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.price === 0 ? '' : row.price}
                    onChange={(e) => updateRow(gi, ri, { price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.online_price === null ? '' : row.online_price}
                    onChange={(e) => updateRow(gi, ri, { online_price: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2"
                  />
                  <input
                    value={row.sku}
                    onChange={(e) => updateRow(gi, ri, { sku: e.target.value })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2"
                  />
                  <select
                    value={row.is_active ? 'active' : 'inactive'}
                    onChange={(e) => updateRow(gi, ri, { is_active: e.target.value === 'active' })}
                    className="text-xs bg-transparent border-0 outline-none text-fg-secondary"
                  >
                    <option value="active">{t('available')}</option>
                    <option value="inactive">{t('unavailable')}</option>
                  </select>
                  <button
                    onClick={() => removeRow(gi, ri)}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/10 text-fg-secondary hover:text-red-400 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Add row */}
              <button
                onClick={() => addRow(gi)}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-brand-600 hover:bg-brand-500/5 transition-colors"
                style={{ borderTop: '1px solid var(--divider)' }}
              >
                <PlusIcon className="w-4 h-4" />
                {t('addVariant')}
              </button>
            </div>
          </div>
        ))}

        {/* Add another set */}
        <button
          onClick={() => setGroups((prev) => [...prev, blankGroup(prev.length)])}
          className="flex items-center gap-2 text-sm text-brand-600 hover:underline font-medium"
        >
          <PlusIcon className="w-4 h-4" />
          {t('addAnotherSet')}
        </button>
      </div>
    </div>
  );
}
