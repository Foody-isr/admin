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
    <div className="space-y-[var(--s-4)]">
      {groups.map((g, gi) => (
        <section
          key={g.key}
          className="bg-[var(--surface)] rounded-r-md border border-[var(--line)] overflow-hidden"
        >
          <div className="p-[var(--s-4)] border-b border-[var(--line)] relative">
            <label className="block text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-muted)] mb-[var(--s-2)]">
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
              className="w-full h-9 px-[var(--s-3)] text-fs-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-md text-[var(--fg)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
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
                <div className="absolute left-[var(--s-4)] right-[var(--s-4)] top-full mt-1 z-30 bg-[var(--surface)] border border-[var(--line)] rounded-r-md shadow-3 overflow-hidden max-h-56 overflow-y-auto">
                  <div className="px-[var(--s-3)] py-[var(--s-2)] text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-muted)] bg-[var(--surface-2)] border-b border-[var(--line)]">
                    {t('savedOptionSets') || 'Saved option sets'}
                  </div>
                  {matches.map((os) => (
                    <button
                      key={os.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applyOptionSet(g.key, os)}
                      className="w-full text-start px-[var(--s-3)] py-[var(--s-2)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <span className="text-fs-sm font-medium text-[var(--fg)]">
                        {os.name}
                      </span>
                      <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">
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
              className="grid text-fs-xs font-semibold text-[var(--fg-muted)] uppercase tracking-[.06em] px-[var(--s-3)] py-[var(--s-2)] bg-[var(--surface-2)] border-b border-[var(--line)]"
              style={{ gridTemplateColumns: '32px 1fr 110px 120px 130px 36px' }}
            >
              <span />
              <span>{t('variantName')}</span>
              <span
                className="text-end"
                title={
                  itemBasePrice > 0
                    ? `Laisser à 0 pour utiliser le prix de base de l'article (₪${itemBasePrice.toFixed(2)}).`
                    : undefined
                }
              >
                {t('price')}
                {itemBasePrice > 0 && (
                  <span className="ml-1 normal-case text-[var(--fg-subtle)] lowercase font-normal">
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
                className="grid items-center gap-2 px-[var(--s-3)] py-[var(--s-2)] border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors"
                style={{ gridTemplateColumns: '32px 1fr 110px 120px 130px 36px' }}
              >
                <div className="flex flex-col items-center justify-center -my-1 text-[var(--fg-muted)]">
                  <button
                    type="button"
                    onClick={() => moveRow(g.key, ri, 'up')}
                    disabled={ri === 0}
                    title="Monter"
                    className="size-5 flex items-center justify-center rounded-r-sm hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(g.key, ri, 'down')}
                    disabled={ri === g.rows.length - 1}
                    title="Descendre"
                    className="size-5 flex items-center justify-center rounded-r-sm hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <input
                  value={row.name}
                  onChange={(e) => updateRow(g.key, row.key, { name: e.target.value })}
                  placeholder={t('variantName')}
                  className="text-fs-sm bg-transparent border-0 outline-none text-[var(--fg)] pe-2"
                />
                <NumberInput
                  min={0}
                  value={row.price}
                  onChange={(n) => updateRow(g.key, row.key, { price: n })}
                  placeholder="0.00"
                  className="text-fs-sm bg-transparent border-0 outline-none text-[var(--fg)] text-end pe-1"
                />
                <select
                  value={row.isActive ? 'active' : 'inactive'}
                  onChange={(e) =>
                    updateRow(g.key, row.key, { isActive: e.target.value === 'active' })
                  }
                  className="text-fs-xs bg-transparent border-0 outline-none text-[var(--fg-muted)]"
                >
                  <option value="active">{t('available')}</option>
                  <option value="inactive">{t('unavailable')}</option>
                </select>
                <label className="inline-flex items-center gap-2 text-fs-xs text-[var(--fg-muted)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={row.isComboOnly}
                    onChange={(e) =>
                      updateRow(g.key, row.key, { isComboOnly: e.target.checked })
                    }
                    className="w-3.5 h-3.5 accent-[var(--brand-500)]"
                  />
                  Combo seul
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(g.key, row.key)}
                  className="size-7 flex items-center justify-center rounded-r-md text-[var(--fg-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  title={t('delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => addRow(g.key)}
              className="w-full flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:bg-[var(--brand-500)]/5 transition-colors border-t border-[var(--line)]"
            >
              <Plus size={16} />
              {t('addVariant')}
            </button>
          </div>

          <div className="p-[var(--s-3)] border-t border-[var(--line)]">
            <button
              type="button"
              onClick={() => removeGroup(g.key)}
              className="text-fs-sm font-medium text-red-500 hover:underline"
            >
              {t('remove')}
            </button>
          </div>
        </section>
      ))}

      <button
        type="button"
        onClick={addGroup}
        className="flex items-center gap-[var(--s-2)] px-[var(--s-3)] py-[var(--s-2)] text-fs-sm font-medium text-[var(--brand-500)] hover:bg-[var(--brand-500)]/5 rounded-r-md transition-colors border-2 border-dashed border-[var(--line)] hover:border-[var(--brand-500)]/50 w-full justify-center"
      >
        <Plus size={16} />
        {t('addAnotherSet')}
      </button>
    </div>
  );
}
