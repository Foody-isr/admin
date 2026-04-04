'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listOptionSets, createOptionSet, attachOptionSetToItems,
  detachOptionSetFromItem, getItemOptionPrices, setItemOptionPrice,
  OptionSet, OptionSetInput, ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface OptionRow {
  optionId: number;
  name: string;
  price: number;
  onlinePrice: number | null;
  sku: string;
  isActive: boolean;
}

interface AttachedSet {
  optionSetId: number;
  name: string;
  rows: OptionRow[];
  isNew?: boolean; // true when just attached, not yet saved
}

export default function VariantsEditorPage() {
  const { restaurantId, itemId } = useParams();
  const rid = Number(restaurantId);
  const iid = Number(itemId);
  const router = useRouter();
  const { t } = useI18n();

  const [attachedSets, setAttachedSets] = useState<AttachedSet[]>([]);
  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newSetName, setNewSetName] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [optSets, overrides] = await Promise.all([
        listOptionSets(rid),
        getItemOptionPrices(rid, iid),
      ]);
      setAllOptionSets(optSets ?? []);

      // Build lookup of per-item overrides: optionId → override
      const overrideMap = new Map<number, ItemOptionOverride>();
      for (const ov of overrides ?? []) {
        overrideMap.set(ov.option_id, ov);
      }

      // Find which option sets are attached to this item
      const attached: AttachedSet[] = [];
      for (const os of optSets ?? []) {
        const linkedItems = os.menu_items ?? [];
        if (linkedItems.some((mi) => mi.id === iid)) {
          attached.push({
            optionSetId: os.id,
            name: os.name,
            rows: (os.options ?? []).map((opt) => {
              const ov = overrideMap.get(opt.id);
              return {
                optionId: opt.id,
                name: opt.name,
                price: ov?.price ?? opt.price,
                onlinePrice: ov?.online_price ?? opt.online_price ?? null,
                sku: ov?.sku ?? opt.sku ?? '',
                isActive: ov?.is_active ?? opt.is_active,
              };
            }),
          });
        }
      }
      setAttachedSets(attached);
    } finally {
      setLoading(false);
    }
  }, [rid, iid]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const set of attachedSets) {
        // Attach if new
        if (set.isNew) {
          await attachOptionSetToItems(rid, set.optionSetId, [iid]);
        }
        // Save per-item price overrides
        for (const row of set.rows) {
          await setItemOptionPrice(rid, set.optionSetId, iid, row.optionId, {
            price: row.price,
            online_price: row.onlinePrice,
            sku: row.sku,
            is_active: row.isActive,
          });
        }
      }
      router.back();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  /** Attach an existing option set to this item */
  const attachExisting = (os: OptionSet) => {
    if (attachedSets.some((s) => s.optionSetId === os.id)) return; // already attached
    setAttachedSets((prev) => [...prev, {
      optionSetId: os.id,
      name: os.name,
      isNew: true,
      rows: (os.options ?? []).map((opt) => ({
        optionId: opt.id,
        name: opt.name,
        price: opt.price,
        onlinePrice: opt.online_price ?? null,
        sku: opt.sku ?? '',
        isActive: opt.is_active,
      })),
    }]);
    setDropdownOpen(false);
    setNewSetName('');
  };

  /** Create a new option set and attach it */
  const createAndAttach = async () => {
    if (!newSetName.trim()) return;
    try {
      const input: OptionSetInput = {
        name: newSetName.trim(),
        options: [{ name: '', price: 0, is_active: true, sort_order: 0 }],
      };
      const created = await createOptionSet(rid, input);
      setAllOptionSets((prev) => [...prev, created]);
      attachExisting(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create');
    }
  };

  /** Detach an option set from this item */
  const detachSet = async (setId: number) => {
    await detachOptionSetFromItem(rid, setId, iid);
    setAttachedSets((prev) => prev.filter((s) => s.optionSetId !== setId));
  };

  const updateRow = (setIdx: number, rowIdx: number, patch: Partial<OptionRow>) => {
    setAttachedSets((prev) => prev.map((s, si) =>
      si === setIdx ? { ...s, rows: s.rows.map((r, ri) => ri === rowIdx ? { ...r, ...patch } : r) } : s
    ));
  };

  // Option sets not yet attached to this item
  const availableSets = allOptionSets.filter((os) =>
    !attachedSets.some((s) => s.optionSetId === os.id) &&
    (!newSetName || os.name.toLowerCase().includes(newSetName.toLowerCase()))
  );

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
        <button onClick={() => router.back()}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-fg-primary">
          {t('addVariants')}
        </span>
        <button onClick={handleSave} disabled={saving}
          className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50">
          {saving ? t('saving') : t('done')}
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Attached option sets */}
        {attachedSets.map((set, si) => (
          <div key={set.optionSetId} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-fg-primary">{set.name}</h3>
              <button onClick={() => detachSet(set.optionSetId)}
                className="text-sm text-red-500 hover:text-red-600 font-medium hover:underline">
                {t('remove')}
              </button>
            </div>

            <div className="rounded-xl border border-[var(--divider)] overflow-hidden">
              <div className="grid text-xs font-medium text-fg-tertiary uppercase tracking-wide px-4 py-2.5 border-b-2 border-fg-primary"
                style={{ gridTemplateColumns: '1fr 110px 110px 80px 80px' }}>
                <span>{t('variantName')}</span>
                <span>{t('price')}</span>
                <span>{t('onlinePrice')}</span>
                <span>SKU</span>
                <span>{t('status')}</span>
              </div>

              {set.rows.map((row, ri) => (
                <div key={row.optionId}
                  className="grid items-center px-4 py-2.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ gridTemplateColumns: '1fr 110px 110px 80px 80px' }}>
                  <span className="text-sm font-medium text-fg-primary">{row.name}</span>
                  <input type="number" min="0" step="0.01"
                    value={row.price === 0 ? '' : row.price}
                    onChange={(e) => updateRow(si, ri, { price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2" />
                  <input type="number" min="0" step="0.01"
                    value={row.onlinePrice === null ? '' : row.onlinePrice}
                    onChange={(e) => updateRow(si, ri, { onlinePrice: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2" />
                  <input value={row.sku}
                    onChange={(e) => updateRow(si, ri, { sku: e.target.value })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2" />
                  <select value={row.isActive ? 'active' : 'inactive'}
                    onChange={(e) => updateRow(si, ri, { isActive: e.target.value === 'active' })}
                    className="text-xs bg-transparent border-0 outline-none text-fg-secondary">
                    <option value="active">{t('available')}</option>
                    <option value="inactive">{t('unavailable')}</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Add option set — dropdown with existing sets + create new */}
        <div className="relative">
          <input
            value={newSetName}
            onChange={(e) => { setNewSetName(e.target.value); setDropdownOpen(true); }}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
            placeholder={t('variantGroupTitle')}
            className="input w-full text-base"
          />
          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 w-80 bg-[var(--surface)] border border-[var(--divider)] rounded-xl shadow-lg overflow-hidden">
              {availableSets.length > 0 && (
                <>
                  <div className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-fg-tertiary border-b border-[var(--divider)]">
                    {t('savedOptionSets') || 'Saved option sets'}
                  </div>
                  {availableSets.map((os) => (
                    <button key={os.id}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => attachExisting(os)}
                      className="w-full text-left px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors">
                      <span className="text-sm font-medium text-fg-primary">{os.name}</span>
                      <p className="text-xs text-fg-tertiary">
                        {(os.options ?? []).map((o) => o.name).join(', ')}
                      </p>
                    </button>
                  ))}
                </>
              )}
              {newSetName.trim() && (
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={createAndAttach}
                  className="w-full text-left px-4 py-3 hover:bg-[var(--surface-subtle)] transition-colors border-t border-[var(--divider)]">
                  <span className="text-sm font-medium text-fg-primary">
                    {t('createOptionSet') || 'Create'} &ldquo;{newSetName.trim()}&rdquo;
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
