'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listOptionSets, getItemOptionPrices, listAllItems,
  syncItemVariants, VariantGroupSyncInput,
  OptionSet, ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { NumberInput } from '@/components/ui/NumberInput';

/* ── Local row state (not yet persisted) ─────────────────────────── */

interface VariantRow {
  key: string;
  optionId?: number; // set when linked to a real OptionSetOption
  name: string;
  price: number;
  isActive: boolean;
  /** When true, the variant is hidden from à la carte browsing on guest apps
   *  (combos that lock to it still expose it). Used for combo-only sizes. */
  isComboOnly: boolean;
}

interface GroupState {
  key: string;
  optionSetId?: number; // set when linked to a real OptionSet
  title: string;
  rows: VariantRow[];
}

function newRow(): VariantRow {
  return {
    key: crypto.randomUUID(),
    name: '', price: 0,
    isActive: true,
    isComboOnly: false,
  };
}

function newGroup(): GroupState {
  return { key: crypto.randomUUID(), title: '', rows: [newRow()] };
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

  // Existing option sets for the dropdown
  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);
  const [dropdownGroupIdx, setDropdownGroupIdx] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [optSets, overrides] = await Promise.all([
        listOptionSets(rid),
        getItemOptionPrices(rid, iid),
        listAllItems(rid),
      ]);
      setAllOptionSets(optSets ?? []);

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
                price: ov?.price ?? opt.price,
                isActive: ov?.is_active ?? opt.is_active,
                isComboOnly: ov?.is_combo_only ?? false,
              };
            }),
          });
        }
      }
      if (attached.length > 0) {
        setGroups(attached);
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
            price: r.price,
            is_active: r.isActive,
            is_combo_only: r.isComboOnly,
            sort_order: vi,
          })),
        });
      }

      await syncItemVariants(rid, iid, { groups: payloadGroups });

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
      g.key === groupKey ? { ...g, rows: [...g.rows, newRow()] } : g
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

  // Reorder a row within its group. The save loop assigns sort_order from
  // the array index, so swapping array positions is enough — no extra
  // bookkeeping. Out-of-bounds moves are no-ops.
  const moveRow = (groupKey: string, rowIdx: number, direction: 'up' | 'down') => {
    setDirty(true);
    setGroups((prev) =>
      prev.map((g) => {
        if (g.key !== groupKey) return g;
        const target = direction === 'up' ? rowIdx - 1 : rowIdx + 1;
        if (target < 0 || target >= g.rows.length) return g;
        const rows = [...g.rows];
        [rows[rowIdx], rows[target]] = [rows[target], rows[rowIdx]];
        return { ...g, rows };
      }),
    );
  };

  const addGroup = () => {
    setDirty(true);
    setGroups((prev) => [...prev, newGroup()]);
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
        price: opt.price,
        isActive: opt.is_active,
        isComboOnly: false,
      })),
    });
    setDropdownGroupIdx(null);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-50 dark:bg-[#0a0a0a]">
        <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-neutral-50 dark:bg-[#0a0a0a] overflow-y-auto">
      {/* Sticky header — MenuItemShell parity */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#111111] border-b border-neutral-200 dark:border-neutral-800 px-8 py-4 flex items-center justify-between">
        <button
          onClick={handleClose}
          aria-label={t('cancel')}
          className="size-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors"
        >
          <X size={20} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white truncate">
          {t('addVariants')}
        </h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-6 py-2.5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors font-medium"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('saving') : t('done')}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {groups.map((g, gi) => (
          <section key={g.key} className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            {/* Group title with option-set autocomplete */}
            <div className="p-5 border-b border-neutral-200 dark:border-neutral-700 relative">
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                {t('variantGroupTitle')}
              </label>
              <input
                value={g.title}
                onChange={(e) => updateGroup(g.key, { title: e.target.value, optionSetId: undefined })}
                onFocus={() => setDropdownGroupIdx(gi)}
                onBlur={() => setTimeout(() => setDropdownGroupIdx(null), 200)}
                placeholder={t('variantGroupTitle')}
                className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
              />
              {(() => {
                // Only surface the saved-option-sets dropdown when the user
                // is actually typing a search query AND there are matches.
                // Auto-opening on focus covered the variant rows below the
                // input even when the user wanted to type a new title.
                if (dropdownGroupIdx !== gi) return null;
                const query = g.title.trim().toLowerCase();
                if (query.length === 0) return null;
                const matches = allOptionSets.filter((os) =>
                  os.name.toLowerCase().includes(query),
                );
                if (matches.length === 0) return null;
                return (
                  <div className="absolute left-5 right-5 top-full mt-1 z-30 bg-white dark:bg-[#111111] border border-neutral-200 dark:border-neutral-700 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-700">
                      {t('savedOptionSets') || 'Saved option sets'}
                    </div>
                    {matches.map((os) => (
                      <button
                        key={os.id}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applyOptionSet(g.key, os)}
                        className="w-full text-left px-4 py-3 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                      >
                        <span className="text-sm font-medium text-neutral-900 dark:text-white">{os.name}</span>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                          {(os.options ?? []).map((o) => o.name).join(', ')}
                        </p>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Variants table */}
            <div>
              <div
                className="grid text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-4 py-3 bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-700"
                style={{ gridTemplateColumns: '32px 1fr 110px 120px 130px 36px' }}
              >
                <span />
                <span>{t('variantName')}</span>
                <span className="text-right">{t('price')}</span>
                <span>{t('status')}</span>
                <span title="Variantes destinées uniquement aux combos (ex : Pour Table 8). Cachées de la fiche article côté client.">
                  Combo seulement
                </span>
                <span />
              </div>

              {g.rows.map((row, ri) => (
                <div
                  key={row.key}
                  className="grid items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors"
                  style={{ gridTemplateColumns: '32px 1fr 110px 120px 130px 36px' }}
                >
                  <div className="flex flex-col items-center justify-center -my-1 text-neutral-400">
                    <button
                      type="button"
                      onClick={() => moveRow(g.key, ri, 'up')}
                      disabled={ri === 0}
                      title="Monter"
                      className="size-5 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(g.key, ri, 'down')}
                      disabled={ri === g.rows.length - 1}
                      title="Descendre"
                      className="size-5 flex items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-700 dark:hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </div>
                  <input
                    value={row.name}
                    onChange={(e) => updateRow(g.key, row.key, { name: e.target.value })}
                    placeholder={t('variantName')}
                    className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white pr-2"
                  />
                  <NumberInput
                    min={0}
                    value={row.price}
                    onChange={(n) => updateRow(g.key, row.key, { price: n })}
                    placeholder="0.00"
                    className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white text-right pr-1"
                  />
                  <select
                    value={row.isActive ? 'active' : 'inactive'}
                    onChange={(e) => updateRow(g.key, row.key, { isActive: e.target.value === 'active' })}
                    className="text-xs bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
                  >
                    <option value="active">{t('available')}</option>
                    <option value="inactive">{t('unavailable')}</option>
                  </select>
                  <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={row.isComboOnly}
                      onChange={(e) => updateRow(g.key, row.key, { isComboOnly: e.target.checked })}
                      className="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600"
                    />
                    Combo seul
                  </label>
                  <button
                    onClick={() => removeRow(g.key, row.key)}
                    className="size-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <button
                onClick={() => addRow(g.key)}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors border-t border-neutral-200 dark:border-neutral-700"
              >
                <Plus size={16} />
                {t('addVariant')}
              </button>
            </div>

            {/* Remove group */}
            {groups.length > 1 && (
              <div className="p-4 border-t border-neutral-200 dark:border-neutral-700">
                <button
                  onClick={() => removeGroup(g.key)}
                  className="text-sm font-medium text-red-500 hover:text-red-600 hover:underline"
                >
                  {t('remove')}
                </button>
              </div>
            )}
          </section>
        ))}

        <button
          onClick={addGroup}
          className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors border-2 border-dashed border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 w-full justify-center"
        >
          <Plus size={16} />
          {t('addAnotherSet')}
        </button>
      </div>
    </div>
  );
}
