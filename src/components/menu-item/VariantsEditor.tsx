'use client';

import { useRef, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import Modal from '@/components/Modal';
import { Button } from '@/components/ds';
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
  /** Serving-size label for this size, shown next to it in guest apps (e.g. "250g"). */
  portion: string;
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
    portion: '',
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
    // The per-item override (OptionSetMenuItemOption) is the source of truth
    // for which options apply to THIS item. Options on the shared set without
    // an override were removed from this item (the shared option stays for
    // other items). Without this filter, removed variants resurrect on reload.
    // Fallback: when no override exists for any option in the set (legacy
    // direct-attach via AttachOptionSetToItems pre-SyncItemVariants), show all
    // options — the next save through SyncItemVariants will backfill overrides.
    const setOptions = os.options ?? [];
    const hasOverrides = setOptions.some((opt) => overrideMap.has(opt.id));
    const visibleOptions = hasOverrides
      ? setOptions.filter((opt) => overrideMap.has(opt.id))
      : setOptions;
    groups.push({
      key: crypto.randomUUID(),
      optionSetId: os.id,
      title: os.name,
      rows: visibleOptions.map((opt) => {
        const ov = overrideMap.get(opt.id);
        return {
          key: crypto.randomUUID(),
          optionId: opt.id,
          name: opt.name,
          price: ov?.price ?? opt.price,
          // Portion lives on the shared OptionSetOption, not the per-item override.
          portion: opt.portion ?? '',
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
    // Drop empty groups regardless of title. Keeping an empty group in the
    // payload makes SyncItemVariants leave the OptionSet attached with zero
    // overrides for this item — which then trips the legacy fallback on
    // reload and resurrects every option from the shared set (without the
    // is_combo_only flag, since that lived on the now-deleted override).
    // Letting the empty group fall through here means the server's detach
    // loop removes the join row cleanly.
    if (validRows.length === 0) continue;
    payload.push({
      option_set_id: g.optionSetId ?? null,
      name: g.title.trim(),
      sort_order: gi,
      variants: validRows.map((r, vi) => ({
        option_id: r.optionId ?? null,
        name: r.name.trim(),
        price: r.price,
        portion: r.portion.trim(),
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
  const { money } = useCurrency();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const [pickerGroup, setPickerGroup] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

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
        portion: opt.portion ?? '',
        isActive: opt.is_active,
        isComboOnly: false,
      })),
    });
    setPickerGroup(null);
  };

  return <div className="min-w-0 space-y-4">
    {groups.map(group => <section key={group.key} aria-label={group.title || t('variants')} className="item-variant-group min-w-0 overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--line)] p-4">
        <label className="item-field min-w-0 flex-[1_1_180px] space-y-2 text-sm"><span className="block font-semibold">{t('variantGroupTitle')}</span><input disabled={!canEdit} value={group.title} onChange={event => updateGroup(group.key, { title: event.target.value, optionSetId: undefined })} className="input" /></label>
        {canEdit && <Button type="button" variant="secondary" onClick={() => { setQuery(''); setPickerGroup(group.key); }}>{t('savedOptionSets')}</Button>}
      </div>
      {itemBasePrice > 0 && <p className="border-b border-[var(--line)] bg-[var(--summary-bg)] p-3 text-xs text-[var(--summary-fg)]">{t('variantZeroPriceHint').replace('{price}', money(itemBasePrice))}</p>}
      <div className="divide-y divide-[var(--line)]">{group.rows.map((row, index) => <fieldset key={row.key} disabled={!canEdit} className="item-variant-row grid min-w-0 grid-cols-2 gap-3 p-4">
        <legend className="sr-only">{t('variantName')} {index + 1}</legend>
        <label className="item-field col-span-2 min-w-0 space-y-1 text-xs text-fg-secondary item-variant-name"><span>{t('variantName')}</span><input value={row.name} onChange={event => updateRow(group.key,row.key,{name:event.target.value})} className="input text-sm" /></label>
        <label className="item-field min-w-0 space-y-1 text-xs text-fg-secondary"><span>{t('price')}</span><NumberInput min={0} value={row.price} onChange={price => updateRow(group.key,row.key,{price})} placeholder="0.00" dir="ltr" className="input text-sm" /></label>
        <label className="item-field min-w-0 space-y-1 text-xs text-fg-secondary"><span>{t('portion')}</span><input value={row.portion} onChange={event => updateRow(group.key,row.key,{portion:event.target.value})} placeholder={t('portionSizePlaceholder')} className="input text-sm" /></label>
        <label className="item-field item-variant-status min-w-0 space-y-1 text-xs text-fg-secondary"><span>{t('status')}</span><select value={row.isActive?'active':'inactive'} onChange={event => updateRow(group.key,row.key,{isActive:event.target.value==='active'})} className="input text-sm"><option value="active">{t('available')}</option><option value="inactive">{t('unavailable')}</option></select></label>
        <label className="flex min-h-11 items-center gap-2 text-sm lg:col-span-2 selection-row"><input type="checkbox" checked={row.isComboOnly} onChange={event => updateRow(group.key,row.key,{isComboOnly:event.target.checked})} className="size-4 accent-[var(--brand-500)]" />{t('comboOnlyBadge')}</label>
        {canEdit && <div className="col-span-2 flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" icon aria-label={t('moveUp')} disabled={!index} onClick={() => moveRow(group.key,index,'up')}><ChevronUp /></Button><Button type="button" variant="ghost" icon aria-label={t('moveDown')} disabled={index===group.rows.length-1} onClick={() => moveRow(group.key,index,'down')}><ChevronDown /></Button><Button type="button" variant="ghost" icon aria-label={t('delete')} onClick={() => removeRow(group.key,row.key)}><Trash2 /></Button></div>}
      </fieldset>)}</div>
      {canEdit && <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--line)] p-3"><Button type="button" variant="secondary" onClick={() => addRow(group.key)}><Plus />{t('addVariant')}</Button><Button type="button" variant="ghost" onClick={() => removeGroup(group.key)}>{t('remove')}</Button></div>}
    </section>)}
    {canEdit && <Button type="button" variant="secondary" className="w-full border-dashed" onClick={addGroup}><Plus />{t('addAnotherSet')}</Button>}
    {pickerGroup && <Modal title={t('savedOptionSets')} initialFocusRef={searchRef} onClose={() => setPickerGroup(null)}>
      <label className="mb-4 block"><span className="sr-only">{t('search')}</span><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} className="input" placeholder={t('search')} /></label>
      <p className="mb-3 text-sm text-fg-secondary">{t('variantApplySetHint')}</p>
      {allOptionSets.filter(set => set.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())).map(set => <button key={set.id} type="button" onClick={() => applyOptionSet(pickerGroup,set)} className="block min-h-16 w-full border-b border-[var(--line)] p-3 text-start hover:bg-[var(--surface-2)]"><span className="block break-words text-sm font-semibold">{set.name}</span><span className="text-xs text-fg-secondary">{set.options?.map(option=>option.name).join(', ')}</span></button>)}
      {!allOptionSets.some(set => set.name.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())) && <p className="py-8 text-center text-sm text-fg-secondary">{t('noResults')}</p>}
    </Modal>}
  </div>;
}
