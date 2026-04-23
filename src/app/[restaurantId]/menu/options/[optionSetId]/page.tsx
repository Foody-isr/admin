'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getOptionSet, updateOptionSet, createOptionInSet, updateOptionInSet, deleteOptionInSet, deleteOptionSet,
  OptionSet, OptionSetOption, OptionInSetInput, OptionSetInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Plus, Trash2 } from 'lucide-react';
import CenteredModalShell from '@/components/common/CenteredModalShell';

// Edit Option Set page — Figma-style full-screen modal. Option rows are
// inline-editable (auto-persist on blur), and the header "Save" persists
// the set-level name. Portion size is per-item only; not editable here.

export default function OptionSetDetailPage() {
  const { restaurantId, optionSetId } = useParams();
  const rid = Number(restaurantId);
  const osid = Number(optionSetId);
  const router = useRouter();
  const { t } = useI18n();

  const [optionSet, setOptionSet] = useState<OptionSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState('');
  const [newOptionSku, setNewOptionSku] = useState('');

  const loadData = useCallback(async () => {
    try {
      const os = await getOptionSet(rid, osid);
      setOptionSet(os);
      setName(os.name);
    } finally {
      setLoading(false);
    }
  }, [rid, osid]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input: OptionSetInput = { name: name.trim(), sort_order: optionSet?.sort_order ?? 0 };
      await updateOptionSet(rid, osid, input);
      router.push(`/${rid}/menu/options`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddOption = async () => {
    if (!newOptionName.trim()) return;
    try {
      const input: OptionInSetInput = {
        name: newOptionName.trim(),
        price: parseFloat(newOptionPrice) || 0,
        sku: newOptionSku.trim() || undefined,
        is_active: true,
        sort_order: (optionSet?.options ?? []).length,
      };
      await createOptionInSet(rid, osid, input);
      setNewOptionName('');
      setNewOptionPrice('');
      setNewOptionSku('');
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add option');
    }
  };

  const handleDelete = async () => {
    if (!confirm(`${t('delete')} "${optionSet?.name || ''}"?`)) return;
    await deleteOptionSet(rid, osid);
    router.push(`/${rid}/menu/options`);
  };

  const goBack = () => router.push(`/${rid}/menu/options`);

  if (loading) {
    return (
      <CenteredModalShell title="" onClose={goBack}>
        <div className="flex items-center justify-center py-24">
          <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
        </div>
      </CenteredModalShell>
    );
  }

  if (!optionSet) {
    return (
      <CenteredModalShell title="" onClose={goBack}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-neutral-600 dark:text-neutral-400">Option set not found</p>
          <button
            onClick={goBack}
            className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg shadow-lg shadow-orange-500/25 transition-all"
          >
            {t('back')}
          </button>
        </div>
      </CenteredModalShell>
    );
  }

  return (
    <CenteredModalShell
      title={optionSet.name}
      onClose={goBack}
      onSave={handleSave}
      saving={saving}
      saveDisabled={!name.trim()}
    >
      <div className="px-6 py-8 space-y-8">
        {/* Details */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-orange-500 rounded-full" />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              {t('details') || 'Details'}
            </h3>
          </div>
          <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 p-5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
              {t('optionSetName')}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
            />
          </div>
        </section>

        {/* Options list */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-orange-500 rounded-full" />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              {t('options')}
            </h3>
          </div>
          <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div
              className="grid text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-4 py-3 bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-700"
              style={{ gridTemplateColumns: '1fr 140px 110px 100px 36px' }}
            >
              <span>{t('variantName')}</span>
              <span>SKU</span>
              <span className="text-right">{t('price')}</span>
              <span>{t('status')}</span>
              <span />
            </div>

            {(optionSet.options ?? []).map((opt) => (
              <OptionRow key={opt.id} rid={rid} setId={osid} option={opt} onUpdated={loadData} t={t} />
            ))}

            {/* Add-option row */}
            <div
              className="grid items-center gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50/50 dark:bg-[#0a0a0a]"
              style={{ gridTemplateColumns: '1fr 140px 110px 100px 36px' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Plus size={14} className="text-orange-500 shrink-0" />
                <input
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  placeholder={t('addOption') || 'Add option'}
                  className="flex-1 text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white min-w-0"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
                />
              </div>
              <input
                value={newOptionSku}
                onChange={(e) => setNewOptionSku(e.target.value)}
                placeholder="—"
                className="text-sm bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={newOptionPrice}
                onChange={(e) => setNewOptionPrice(e.target.value)}
                placeholder="0.00"
                className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white text-right pr-1"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
              />
              <span />
              {newOptionName.trim() ? (
                <button
                  onClick={handleAddOption}
                  className="text-sm font-medium text-orange-500 hover:underline justify-self-end"
                >
                  {t('add')}
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </section>

        {/* Destructive */}
        <button
          onClick={handleDelete}
          className="text-sm font-medium text-red-500 hover:text-red-600 hover:underline"
        >
          {t('delete')} {t('options').toLowerCase()}
        </button>
      </div>
    </CenteredModalShell>
  );
}

// ─── Editable option row ─────────────────────────────────────────────

function OptionRow({ rid, setId, option, onUpdated, t }: {
  rid: number;
  setId: number;
  option: OptionSetOption;
  onUpdated: () => void;
  t: (key: string) => string;
}) {
  const [name, setName] = useState(option.name);
  const [price, setPrice] = useState(String(option.price));
  const [sku, setSku] = useState(option.sku ?? '');
  const [isActive, setIsActive] = useState(option.is_active);

  const persist = async (patch: Partial<OptionInSetInput>) => {
    const payload: OptionInSetInput = {
      name: (patch.name ?? name).trim() || option.name,
      price: patch.price ?? (parseFloat(price) || 0),
      sku: patch.sku ?? (sku.trim() || undefined),
      is_active: patch.is_active ?? isActive,
      sort_order: option.sort_order,
    };
    try {
      await updateOptionInSet(rid, setId, option.id, payload);
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleNameBlur = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === option.name) {
      setName(option.name);
      return;
    }
    persist({ name: trimmed });
  };

  const handlePriceBlur = () => {
    const parsed = parseFloat(price);
    const next = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    if (next === option.price) {
      setPrice(String(option.price));
      return;
    }
    setPrice(String(next));
    persist({ price: next });
  };

  const handleSkuBlur = () => {
    const trimmed = sku.trim();
    if (trimmed === (option.sku ?? '')) return;
    persist({ sku: trimmed || undefined });
  };

  const handleActiveChange = (next: boolean) => {
    setIsActive(next);
    persist({ is_active: next });
  };

  const handleDelete = async () => {
    if (!confirm(`${t('deleteOption')} "${option.name}"?`)) return;
    try {
      await deleteOptionInSet(rid, setId, option.id);
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div
      className="grid items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-[#1a1a1a] transition-colors"
      style={{ gridTemplateColumns: '1fr 140px 110px 100px 36px' }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleNameBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white pr-2"
      />
      <input
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        onBlur={handleSkuBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        className="text-sm bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
      />
      <input
        type="number"
        min="0"
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        onBlur={handlePriceBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="0.00"
        className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white text-right pr-1"
      />
      <select
        value={isActive ? 'active' : 'inactive'}
        onChange={(e) => handleActiveChange(e.target.value === 'active')}
        className="text-xs bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
      >
        <option value="active">{t('available')}</option>
        <option value="inactive">{t('unavailable')}</option>
      </select>
      <button
        onClick={handleDelete}
        className="size-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        title={t('delete')}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
