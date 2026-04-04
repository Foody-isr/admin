'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getOptionSet, updateOptionSet, createOptionInSet, deleteOptionSet,
  OptionSet, OptionSetOption, OptionInSetInput, OptionSetInput,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

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
        price: 0,
        is_active: true,
        sort_order: (optionSet?.options ?? []).length,
      };
      await createOptionInSet(rid, osid, input);
      setNewOptionName('');
      loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add option');
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('delete') + '?')) return;
    await deleteOptionSet(rid, osid);
    router.push(`/${rid}/menu/options`);
  };

  const goBack = () => router.push(`/${rid}/menu/options`);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!optionSet) {
    return (
      <div className="text-center py-20">
        <p className="text-fg-secondary">Option set not found</p>
        <button onClick={goBack} className="mt-4 text-brand-500 hover:underline">{t('back')}</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface)] overflow-y-auto">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--divider)] px-6 py-3 flex items-center justify-between">
        <button onClick={goBack}
          className="w-11 h-11 rounded-full border-2 border-[var(--divider)] hover:bg-[var(--surface-subtle)] transition-colors flex items-center justify-center">
          <XMarkIcon className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-fg-primary">{t('options')}</span>
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="btn-primary text-sm px-5 py-2 rounded-full disabled:opacity-50">
          {saving ? t('saving') : t('save')}
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
        {/* Details section */}
        <div>
          <h2 className="text-xl font-bold text-fg-primary mb-5">{t('details') || 'Details'}</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-4 border-b border-[var(--divider)]">
              <span className="text-base font-medium text-fg-primary">{t('optionSetName')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="input text-sm w-64 text-right" />
            </div>
          </div>
        </div>

        {/* Options list */}
        <div>
          <h2 className="text-xl font-bold text-fg-primary mb-5">
            {t('options')} {name}
          </h2>
          <div className="rounded-xl border border-[var(--divider)] overflow-hidden">
            {(optionSet.options ?? []).map((opt) => (
              <div key={opt.id}
                className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors">
                <span className="text-base font-medium text-fg-primary">{opt.name}</span>
                <span className="text-sm text-fg-tertiary">
                  {(optionSet.menu_items ?? []).length} {t('variants') || 'item variations'}
                </span>
              </div>
            ))}

            {/* Add option row */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--divider)]">
              <input value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)}
                placeholder={t('addVariant') || 'Add an option'}
                className="flex-1 text-sm bg-transparent border-0 outline-none text-fg-primary"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }} />
              {newOptionName.trim() && (
                <button onClick={handleAddOption}
                  className="text-sm text-brand-500 font-medium hover:underline">
                  {t('add')}
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-fg-tertiary mt-4">
            {t('deleteOptionSetHint') || 'To delete an option set, first delete all its options.'}
          </p>
        </div>

        {/* Delete */}
        <button onClick={handleDelete}
          className="text-sm text-red-500 hover:text-red-600 font-medium hover:underline">
          {t('delete')} {t('options').toLowerCase()}
        </button>
      </div>
    </div>
  );
}
