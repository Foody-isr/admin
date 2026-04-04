'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createOptionSet, OptionSetInput } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface LocalOption {
  key: string;
  name: string;
}

export default function NewOptionSetPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [options, setOptions] = useState<LocalOption[]>([
    { key: crypto.randomUUID(), name: '' },
  ]);
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
          price: 0,
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

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)] overflow-y-auto">
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <button onClick={goBack}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-fg-primary">{t('createOptionSet')}</span>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50">
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h2 className="text-xl font-bold text-fg-primary mb-5">{t('details') || 'Details'}</h2>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t('optionSetName')}
            autoFocus
            className="input w-full text-base" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-fg-primary mb-5">{t('options')}</h2>
          <div className="rounded-xl border border-[var(--divider)] overflow-hidden">
            {options.map((opt, i) => (
              <div key={opt.key}
                className="flex items-center gap-2 px-4 py-3 border-b border-[var(--divider)] last:border-b-0">
                <input value={opt.name}
                  onChange={(e) => setOptions((prev) => prev.map((o, j) => j === i ? { ...o, name: e.target.value } : o))}
                  placeholder={t('addVariant') || 'Option name'}
                  className="flex-1 text-sm bg-transparent border-0 outline-none text-fg-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setOptions((prev) => [...prev, { key: crypto.randomUUID(), name: '' }]);
                    }
                  }} />
                {options.length > 1 && (
                  <button onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                    className="p-1 rounded-lg hover:bg-red-500/10 text-fg-tertiary hover:text-red-400 transition-colors">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}

            <button onClick={() => setOptions((prev) => [...prev, { key: crypto.randomUUID(), name: '' }])}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-brand-500 hover:bg-[var(--surface-subtle)] transition-colors border-t border-[var(--divider)]">
              <PlusIcon className="w-4 h-4" />
              {t('addVariant') || 'Add option'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
