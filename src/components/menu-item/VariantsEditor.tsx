'use client';

import { useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';
import type {
  OptionSet,
  ItemOptionOverride,
  VariantGroupSyncInput,
} from '@/lib/api';

export interface VariantRowState {
  key: string;
  optionId?: number;
  name: string;
  price: number;
  isActive: boolean;
  isComboOnly: boolean;
}

export interface VariantGroupState {
  key: string;
  optionSetId?: number;
  title: string;
  rows: VariantRowState[];
}

export function newVariantRow(defaultPrice = 0): VariantRowState {
  return {
    key: crypto.randomUUID(),
    name: '',
    price: defaultPrice,
    isActive: true,
    isComboOnly: false,
  };
}

export function newVariantGroup(defaultPrice = 0): VariantGroupState {
  return { key: crypto.randomUUID(), title: '', rows: [newVariantRow(defaultPrice)] };
}

export function variantGroupsFromOptionSets(
  attachedOptionSets: OptionSet[],
  overrides: ItemOptionOverride[],
  itemId: number,
): VariantGroupState[] {
  const overrideMap = new Map<number, ItemOptionOverride>();
  for (const ov of overrides) overrideMap.set(ov.option_id, ov);

  const groups: VariantGroupState[] = [];
  for (const os of attachedOptionSets) {
    if (!(os.menu_items ?? []).some((mi) => mi.id === itemId)) continue;
    groups.push({
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
  return groups;
}

export function toVariantSyncPayload(
  groups: VariantGroupState[],
): VariantGroupSyncInput[] {
  const payload: VariantGroupSyncInput[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const validRows = g.rows.filter((r) => r.name.trim());
    if (validRows.length === 0 && !g.title.trim()) continue;
    payload.push({
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
  return payload;
}

export function hasMeaningfulVariants(groups: VariantGroupState[]): boolean {
  return groups.some((g) => g.rows.some((r) => r.name.trim()));
}

interface Props {
  groups: VariantGroupState[];
  onChange: (groups: VariantGroupState[]) => void;
  allOptionSets: OptionSet[];
  itemBasePrice: number;
}

export default function VariantsEditor({
  groups,
  onChange,
  allOptionSets,
  itemBasePrice,
}: Props) {
  const { t } = useI18n();
  const [dropdownGroupIdx, setDropdownGroupIdx] = useState<number | null>(null);

  const updateGroup = (key: string, patch: Partial<VariantGroupState>) => {
    onChange(groups.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  };

  const updateRow = (
    groupKey: string,
    rowKey: string,
    patch: Partial<VariantRowState>,
  ) => {
    onChange(
      groups.map((g) => {
        if (g.key !== groupKey) return g;
        return {
          ...g,
          rows: g.rows.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)),
        };
      }),
    );
  };

  const addRow = (groupKey: string) => {
    onChange(
      groups.map((g) =>
        g.key === groupKey
          ? { ...g, rows: [...g.rows, newVariantRow(itemBasePrice)] }
          : g,
      ),
    );
  };

  const removeRow = (groupKey: string, rowKey: string) => {
    onChange(
      groups.map((g) =>
        g.key === groupKey
          ? { ...g, rows: g.rows.filter((r) => r.key !== rowKey) }
          : g,
      ),
    );
  };

  const removeGroup = (key: string) => {
    onChange(groups.filter((g) => g.key !== key));
  };

  const moveRow = (
    groupKey: string,
    rowIdx: number,
    direction: 'up' | 'down',
  ) => {
    onChange(
      groups.map((g) => {
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
    onChange([...groups, newVariantGroup(itemBasePrice)]);
  };

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

  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <section
          key={g.key}
          className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden"
        >
          <div className="p-5 border-b border-neutral-200 dark:border-neutral-700 relative">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
              {t('variantGroupTitle')}
            </label>
            <input
              value={g.title}
              onChange={(e) =>
                updateGroup(g.key, { title: e.target.value, optionSetId: undefined })
              }
              onFocus={() => setDropdownGroupIdx(gi)}
              onBlur={() => setTimeout(() => setDropdownGroupIdx(null), 200)}
              placeholder={t('variantGroupTitle')}
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
            />
            {(() => {
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
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyOptionSet(g.key, os)}
                      className="w-full text-left px-4 py-3 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                    >
                      <span className="text-sm font-medium text-neutral-900 dark:text-white">
                        {os.name}
                      </span>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        {(os.options ?? []).map((o) => o.name).join(', ')}
                      </p>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>

          <div>
            <div
              className="grid text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-4 py-3 bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-700"
              style={{ gridTemplateColumns: '32px 1fr 110px 120px 130px 36px' }}
            >
              <span />
              <span>{t('variantName')}</span>
              <span
                className="text-right"
                title={
                  itemBasePrice > 0
                    ? `Laisser à 0 pour utiliser le prix de base de l'article (₪${itemBasePrice.toFixed(2)}).`
                    : undefined
                }
              >
                {t('price')}
                {itemBasePrice > 0 && (
                  <span className="ml-1 normal-case text-neutral-400 dark:text-neutral-500 lowercase font-normal">
                    (0 = base)
                  </span>
                )}
              </span>
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
                  onChange={(e) =>
                    updateRow(g.key, row.key, { isActive: e.target.value === 'active' })
                  }
                  className="text-xs bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
                >
                  <option value="active">{t('available')}</option>
                  <option value="inactive">{t('unavailable')}</option>
                </select>
                <label className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={row.isComboOnly}
                    onChange={(e) =>
                      updateRow(g.key, row.key, { isComboOnly: e.target.checked })
                    }
                    className="w-3.5 h-3.5 rounded border-neutral-300 dark:border-neutral-600"
                  />
                  Combo seul
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(g.key, row.key)}
                  className="size-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title={t('delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addRow(g.key)}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors border-t border-neutral-200 dark:border-neutral-700"
            >
              <Plus size={16} />
              {t('addVariant')}
            </button>
          </div>

          <div className="p-4 border-t border-neutral-200 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => removeGroup(g.key)}
              className="text-sm font-medium text-red-500 hover:text-red-600 hover:underline"
            >
              {t('remove')}
            </button>
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={addGroup}
        className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors border-2 border-dashed border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 w-full justify-center"
      >
        <Plus size={16} />
        {t('addAnotherSet')}
      </button>
    </div>
  );
}
