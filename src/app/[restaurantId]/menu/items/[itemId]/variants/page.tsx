'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  listOptionSets, createOptionSet, attachOptionSetToItems,
  detachOptionSetFromItem, getItemOptionPrices, setItemOptionPrice,
  createOptionInSet,
  OptionSet, OptionSetInput, ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

/* ── Local row state (not yet persisted) ─────────────────────────── */

interface VariantRow {
  key: string;
  optionId?: number; // set when linked to a real OptionSetOption
  name: string;
  price: string;
  onlinePrice: string;
  sku: string;
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

function newRow(): VariantRow {
  return { key: crypto.randomUUID(), name: '', price: '', onlinePrice: '', sku: '', portionSize: '', portionSizeUnit: 'g', isActive: true };
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

  // Existing option sets for the dropdown
  const [allOptionSets, setAllOptionSets] = useState<OptionSet[]>([]);
  const [dropdownGroupIdx, setDropdownGroupIdx] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [optSets, overrides] = await Promise.all([
        listOptionSets(rid),
        getItemOptionPrices(rid, iid),
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
                price: String(ov?.price ?? opt.price),
                onlinePrice: ov?.online_price != null ? String(ov.online_price) : '',
                sku: ov?.sku ?? opt.sku ?? '',
                portionSize: (ov?.portion_size ?? 0) > 0 ? String(ov!.portion_size) : '',
                portionSizeUnit: ov?.portion_size_unit || 'g',
                isActive: ov?.is_active ?? opt.is_active,
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

  /* ── Save: create/update option sets + attach + set prices ──── */

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const g of groups) {
        const validRows = g.rows.filter((r) => r.name.trim());
        if (validRows.length === 0 && !g.title.trim()) continue;

        let setId = g.optionSetId;

        if (!setId) {
          // Check if an option set with this name already exists
          const existing = allOptionSets.find(
            (os) => os.name.toLowerCase() === g.title.trim().toLowerCase()
          );
          if (existing) {
            setId = existing.id;
            // Add any new options that don't exist yet
            const existingNames = new Set((existing.options ?? []).map((o) => o.name.toLowerCase()));
            for (const row of validRows) {
              if (!existingNames.has(row.name.trim().toLowerCase())) {
                await createOptionInSet(rid, setId, {
                  name: row.name.trim(),
                  price: parseFloat(row.price) || 0,
                  online_price: row.onlinePrice ? parseFloat(row.onlinePrice) : undefined,
                  sku: row.sku,
                  is_active: row.isActive,
                  sort_order: 0,
                });
              }
            }
            // Reload to get fresh option IDs
            const refreshed = await listOptionSets(rid);
            const fresh = refreshed.find((os) => os.id === setId);
            if (fresh) {
              // Attach to item
              await attachOptionSetToItems(rid, setId, [iid]);
              // Set per-item prices
              for (const row of validRows) {
                const opt = (fresh.options ?? []).find(
                  (o) => o.name.toLowerCase() === row.name.trim().toLowerCase()
                );
                if (opt) {
                  await setItemOptionPrice(rid, setId, iid, opt.id, {
                    price: parseFloat(row.price) || 0,
                    online_price: row.onlinePrice ? parseFloat(row.onlinePrice) : undefined,
                    sku: row.sku,
                    portion_size: row.portionSize ? parseFloat(row.portionSize) : 0,
                    portion_size_unit: row.portionSizeUnit || 'g',
                    is_active: row.isActive,
                  });
                }
              }
            }
          } else {
            // Create new option set
            const input: OptionSetInput = {
              name: g.title.trim() || 'Options',
              options: validRows.map((r, i) => ({
                name: r.name.trim(),
                price: parseFloat(r.price) || 0,
                online_price: r.onlinePrice ? parseFloat(r.onlinePrice) : undefined,
                sku: r.sku,
                is_active: r.isActive,
                sort_order: i,
              })),
            };
            const created = await createOptionSet(rid, input);
            setId = created.id;
            // Attach to item
            await attachOptionSetToItems(rid, setId, [iid]);
            // Set per-item prices
            for (const row of validRows) {
              const opt = (created.options ?? []).find(
                (o) => o.name.toLowerCase() === row.name.trim().toLowerCase()
              );
              if (opt) {
                await setItemOptionPrice(rid, setId, iid, opt.id, {
                  price: parseFloat(row.price) || 0,
                  online_price: row.onlinePrice ? parseFloat(row.onlinePrice) : undefined,
                  sku: row.sku,
                  portion_size: row.portionSize ? parseFloat(row.portionSize) : 0,
                  portion_size_unit: row.portionSizeUnit || 'g',
                  is_active: row.isActive,
                });
              }
            }
          }
        } else {
          // Existing attached set — just update per-item prices
          for (const row of validRows) {
            if (row.optionId) {
              await setItemOptionPrice(rid, setId, iid, row.optionId, {
                price: parseFloat(row.price) || 0,
                online_price: row.onlinePrice ? parseFloat(row.onlinePrice) : undefined,
                sku: row.sku,
                portion_size: row.portionSize ? parseFloat(row.portionSize) : 0,
                portion_size_unit: row.portionSizeUnit || 'g',
                is_active: row.isActive,
              });
            }
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

  /* ── Group/row helpers ─────────────────────────────────────────── */

  const updateGroup = (key: string, patch: Partial<GroupState>) => {
    setGroups((prev) => prev.map((g) => g.key === key ? { ...g, ...patch } : g));
  };

  const updateRow = (groupKey: string, rowKey: string, patch: Partial<VariantRow>) => {
    setGroups((prev) => prev.map((g) => {
      if (g.key !== groupKey) return g;
      return { ...g, rows: g.rows.map((r) => r.key === rowKey ? { ...r, ...patch } : r) };
    }));
  };

  const addRow = (groupKey: string) => {
    setGroups((prev) => prev.map((g) =>
      g.key === groupKey ? { ...g, rows: [...g.rows, newRow()] } : g
    ));
  };

  const removeRow = (groupKey: string, rowKey: string) => {
    setGroups((prev) => prev.map((g) =>
      g.key === groupKey ? { ...g, rows: g.rows.filter((r) => r.key !== rowKey) } : g
    ));
  };

  const removeGroup = async (key: string) => {
    const g = groups.find((g) => g.key === key);
    if (g?.optionSetId) {
      await detachOptionSetFromItem(rid, g.optionSetId, iid);
    }
    setGroups((prev) => prev.filter((g) => g.key !== key));
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
        onlinePrice: opt.online_price != null ? String(opt.online_price) : '',
        sku: opt.sku ?? '',
        portionSize: '',
        portionSizeUnit: 'g',
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
        <button onClick={() => router.back()}
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
                style={{ gridTemplateColumns: '1fr 100px 100px 80px 80px 80px 36px' }}>
                <span>{t('variantName')}</span>
                <span>{t('price')}</span>
                <span>{t('onlinePrice')}</span>
                <span>SKU</span>
                <span>{t('portionSize')}</span>
                <span>{t('status')}</span>
                <span />
              </div>

              {g.rows.map((row) => (
                <div key={row.key}
                  className="grid items-center px-4 py-2.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors"
                  style={{ gridTemplateColumns: '1fr 100px 100px 80px 80px 80px 36px' }}>
                  <input value={row.name}
                    onChange={(e) => updateRow(g.key, row.key, { name: e.target.value })}
                    placeholder={t('variantName')}
                    className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2" />
                  <input type="number" min="0" step="0.01"
                    value={row.price}
                    onChange={(e) => updateRow(g.key, row.key, { price: e.target.value })}
                    placeholder="0.00"
                    className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2" />
                  <input type="number" min="0" step="0.01"
                    value={row.onlinePrice}
                    onChange={(e) => updateRow(g.key, row.key, { onlinePrice: e.target.value })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2" />
                  <input value={row.sku}
                    onChange={(e) => updateRow(g.key, row.key, { sku: e.target.value })}
                    placeholder="—"
                    className="text-sm bg-transparent border-0 outline-none text-fg-secondary pr-2" />
                  <div className="flex items-center gap-1">
                    <input type="number" min="0" step="any"
                      value={row.portionSize}
                      onChange={(e) => updateRow(g.key, row.key, { portionSize: e.target.value })}
                      placeholder="0"
                      className="text-sm bg-transparent border-0 outline-none text-fg-secondary w-12" />
                    <select value={row.portionSizeUnit}
                      onChange={(e) => updateRow(g.key, row.key, { portionSizeUnit: e.target.value })}
                      className="text-xs bg-transparent border-0 outline-none text-fg-tertiary w-8">
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

        <button onClick={() => setGroups((prev) => [...prev, newGroup()])}
          className="flex items-center gap-2 text-base font-medium text-fg-primary underline">
          <PlusIcon className="w-4 h-4" />
          {t('addAnotherSet')}
        </button>
      </div>
    </div>
  );
}
