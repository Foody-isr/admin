'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getOptionSet, updateOptionSet, createOptionInSet, updateOptionInSet, deleteOptionInSet, deleteOptionSet,
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
  const [newOptionPrice, setNewOptionPrice] = useState('');

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
        is_active: true,
        sort_order: (optionSet?.options ?? []).length,
      };
      await createOptionInSet(rid, osid, input);
      setNewOptionName('');
      setNewOptionPrice('');
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
            <div className="grid text-xs font-medium text-fg-tertiary uppercase tracking-wide px-4 py-2.5 border-b-2 border-fg-primary"
              style={{ gridTemplateColumns: '1fr 100px 100px 36px' }}>
              <span>{t('variantName')}</span>
              <span>{t('price')}</span>
              <span>{t('status')}</span>
              <span />
            </div>
            {(optionSet.options ?? []).map((opt) => (
              <OptionRow key={opt.id} rid={rid} setId={osid} option={opt} onUpdated={loadData} t={t} />
            ))}

            {/* Add option row */}
            <div className="grid items-center gap-2 px-4 py-3 border-t border-[var(--divider)]"
              style={{ gridTemplateColumns: '1fr 100px 100px 36px' }}>
              <div className="flex items-center gap-2 min-w-0">
                <PlusIcon className="w-4 h-4 text-fg-tertiary shrink-0" />
                <input value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)}
                  placeholder={t('addOption')}
                  className="flex-1 text-sm bg-transparent border-0 outline-none text-fg-primary min-w-0"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }} />
              </div>
              <input type="number" min="0" step="0.01"
                value={newOptionPrice} onChange={(e) => setNewOptionPrice(e.target.value)}
                placeholder="0.00"
                className="text-sm bg-transparent border-0 outline-none text-fg-primary pr-2"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }} />
              <span />
              {newOptionName.trim() ? (
                <button onClick={handleAddOption}
                  className="text-sm text-brand-500 font-medium hover:underline justify-self-end">
                  {t('add')}
                </button>
              ) : <span />}
            </div>
          </div>
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

// ─── Editable Option Row ─────────────────────────────────────────

function OptionRow({ rid, setId, option, onUpdated, t }: {
  rid: number;
  setId: number;
  option: OptionSetOption;
  onUpdated: () => void;
  t: (key: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(option.name);

  const handleSave = async () => {
    if (!editName.trim() || editName.trim() === option.name) {
      setEditing(false);
      return;
    }
    try {
      await updateOptionInSet(rid, setId, option.id, {
        name: editName.trim(),
        price: option.price,
        is_active: option.is_active,
        sort_order: option.sort_order,
      });
      onUpdated();
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('deleteOption') + ` "${option.name}"?`)) return;
    try {
      await deleteOptionInSet(rid, setId, option.id);
      onUpdated();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--divider)] last:border-b-0 hover:bg-[var(--surface-subtle)] transition-colors">
      {editing ? (
        <input value={editName} onChange={(e) => setEditName(e.target.value)}
          onBlur={handleSave} onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
          autoFocus className="text-base font-medium text-fg-primary bg-transparent border-0 outline-none flex-1" />
      ) : (
        <button onClick={() => setEditing(true)}
          className="text-base font-medium text-fg-primary hover:text-brand-500 text-left flex-1 cursor-text">
          {option.name}
        </button>
      )}
      <button onClick={handleDelete} className="p-1.5 rounded hover:bg-red-500/10 text-fg-tertiary hover:text-red-500 transition-colors ml-2">
        <TrashIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
