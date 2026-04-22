'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createOptionSet, OptionSetInput } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { X, Plus, Trash2 } from 'lucide-react';

// Create Option Set page — Figma-style full-screen modal with lucide icons,
// orange gradient Save, and a rounded-card options table that mirrors the
// MenuItemDetails modal shell.
//
// Portion size is per-item (ItemOptionOverride), so it's not captured here —
// it appears in the per-item variants editor instead.

interface LocalOption {
  key: string;
  name: string;
  price: string;
  sku: string;
}

const newOption = (): LocalOption => ({
  key: crypto.randomUUID(),
  name: '',
  price: '',
  sku: '',
});

export default function NewOptionSetPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [options, setOptions] = useState<LocalOption[]>([newOption()]);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    const validOptions = options.filter((o) => o.name.trim());
    if (validOptions.length === 0) return;
    setSaving(true);
    try {
      const input: OptionSetInput = {
        name: name.trim(),
        options: validOptions.map((o, i) => ({
          name: o.name.trim(),
          price: parseFloat(o.price) || 0,
          sku: o.sku.trim() || undefined,
          is_active: true,
          sort_order: i,
        })),
      };
      await createOptionSet(rid, input);
      router.push(`/${rid}/menu/options`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => router.push(`/${rid}/menu/options`);

  const updateOption = (key: string, patch: Partial<LocalOption>) => {
    setOptions((prev) => prev.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  };

  const addOption = () => setOptions((prev) => [...prev, newOption()]);
  const removeOption = (key: string) =>
    setOptions((prev) => prev.filter((o) => o.key !== key));

  return (
    <div className="fixed inset-0 z-50 bg-neutral-50 dark:bg-[#0a0a0a] overflow-y-auto">
      {/* Sticky header — MenuItemShell parity */}
      <div className="sticky top-0 z-10 bg-white dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-800 px-8 py-4 flex items-center justify-between">
        <button
          onClick={goBack}
          aria-label={t('cancel')}
          className="size-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 flex items-center justify-center transition-colors"
        >
          <X size={20} className="text-neutral-600 dark:text-neutral-400" />
        </button>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white truncate">
          {t('createOptionSet')}
        </h2>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={goBack}
            className="px-6 py-2.5 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors font-medium"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg shadow-orange-500/25 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Details */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-orange-500 rounded-full" />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              {t('details') || 'Details'}
            </h3>
          </div>
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-neutral-200 dark:border-neutral-700 p-5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
              {t('optionSetName')}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('optionSetName')}
              autoFocus
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#0a0a0a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
            />
          </div>
        </section>

        {/* Options table */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 bg-orange-500 rounded-full" />
            <h3 className="text-lg font-bold text-neutral-900 dark:text-white">
              {t('options')}
            </h3>
          </div>
          <div className="bg-white dark:bg-[#1a1a1a] rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <div
              className="grid text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-4 py-3 bg-neutral-50 dark:bg-[#0f0f0f] border-b border-neutral-200 dark:border-neutral-700"
              style={{ gridTemplateColumns: '1fr 140px 110px 36px' }}
            >
              <span>{t('variantName')}</span>
              <span>SKU</span>
              <span className="text-right">{t('price')}</span>
              <span />
            </div>

            {options.map((opt) => (
              <div
                key={opt.key}
                className="grid items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 last:border-b-0 hover:bg-neutral-50 dark:hover:bg-[#0f0f0f] transition-colors"
                style={{ gridTemplateColumns: '1fr 140px 110px 36px' }}
              >
                <input
                  value={opt.name}
                  onChange={(e) => updateOption(opt.key, { name: e.target.value })}
                  placeholder={t('addVariant') || 'Option name'}
                  className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white pr-2"
                />
                <input
                  value={opt.sku}
                  onChange={(e) => updateOption(opt.key, { sku: e.target.value })}
                  placeholder="—"
                  className="text-sm bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={opt.price}
                  onChange={(e) => updateOption(opt.key, { price: e.target.value })}
                  placeholder="0.00"
                  className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white text-right pr-1"
                />
                {options.length > 1 ? (
                  <button
                    onClick={() => removeOption(opt.key)}
                    className="size-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}

            <button
              onClick={addOption}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors border-t border-neutral-200 dark:border-neutral-700"
            >
              <Plus size={16} />
              {t('addVariant') || 'Add option'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
