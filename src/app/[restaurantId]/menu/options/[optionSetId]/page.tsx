'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getOptionSet, updateOptionSet, createOptionInSet, updateOptionInSet, deleteOptionInSet, deleteOptionSet,
  getRestaurant,
  OptionSet, OptionSetOption, OptionInSetInput, OptionSetInput, TranslationMap,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Plus, Trash2 } from 'lucide-react';
import CenteredModalShell from '@/components/common/CenteredModalShell';
import { NumberInput } from '@/components/ui/NumberInput';
import { LocaleTabs, type Locale } from '@/components/i18n/LocaleTabs';

const SUPPORTED_LOCALES: Locale[] = ['en', 'he', 'fr'];

function setLocaleOverride(
  prev: TranslationMap | undefined,
  field: string,
  locale: Locale,
  value: string,
): TranslationMap {
  const next: TranslationMap = { ...(prev ?? {}) };
  const fieldMap = { ...(next[field] ?? {}) };
  if (value === '') {
    delete fieldMap[locale];
  } else {
    fieldMap[locale] = value;
  }
  if (Object.keys(fieldMap).length === 0) {
    delete next[field];
  } else {
    next[field] = fieldMap;
  }
  return next;
}

// Edit Option Set page — Figma-style full-screen modal. Option rows are
// inline-editable (auto-persist on blur), and the header "Save" persists
// the set-level name. Portion size is per-item only; not editable here.

export default function OptionSetDetailPage() {
  const { restaurantId, optionSetId } = useParams();
  const rid = Number(restaurantId);
  const osid = Number(optionSetId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [optionSet, setOptionSet] = useState<OptionSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [setTranslations, setSetTranslations] = useState<TranslationMap>({});
  const [newOptionName, setNewOptionName] = useState('');
  const [newOptionPrice, setNewOptionPrice] = useState(0);
  const [newOptionSku, setNewOptionSku] = useState('');
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const isSourceTab = activeLocale === sourceLocale;

  const loadData = useCallback(async () => {
    try {
      const os = await getOptionSet(rid, osid);
      setOptionSet(os);
      setName(os.name);
      setSetTranslations(os.translations ?? {});
    } finally {
      setLoading(false);
    }
  }, [rid, osid]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        const loc = r.default_locale;
        if (loc === 'en' || loc === 'he' || loc === 'fr') {
          setSourceLocale(loc);
          setActiveLocale(loc);
        }
      })
      .catch(() => {});
  }, [rid]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const input: OptionSetInput = {
        name: name.trim(),
        sort_order: optionSet?.sort_order ?? 0,
        translations: setTranslations,
      };
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
        price: newOptionPrice,
        sku: newOptionSku.trim() || undefined,
        is_active: true,
        sort_order: (optionSet?.options ?? []).length,
      };
      await createOptionInSet(rid, osid, input);
      setNewOptionName('');
      setNewOptionPrice(0);
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
      onSave={canEdit ? handleSave : undefined}
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
          <div className="bg-white dark:bg-[#111111] rounded-xl border border-neutral-200 dark:border-neutral-700 p-5 space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <LocaleTabs
                locales={SUPPORTED_LOCALES}
                source={sourceLocale}
                active={activeLocale}
                onChange={setActiveLocale}
                missing={Object.fromEntries(
                  SUPPORTED_LOCALES.filter((l) => l !== sourceLocale).map((l) => [
                    l,
                    !setTranslations?.name?.[l],
                  ]),
                )}
              />
              {!isSourceTab && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {t('languageEditingTranslation') ||
                    'Editing translation. Leave blank to use the auto-translation; what you type here overrides it.'}
                </span>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
                {t('optionSetName')}
              </label>
              {isSourceTab ? (
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                />
              ) : (
                <>
                  <input
                    value={setTranslations?.name?.[activeLocale] ?? ''}
                    onChange={(e) =>
                      setSetTranslations((prev) =>
                        setLocaleOverride(prev, 'name', activeLocale, e.target.value),
                      )
                    }
                    placeholder={name || t('optionSetName')}
                    className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                  <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                    {(t('languageSourceLabel') || 'Source') + ': '}
                    <span className="text-neutral-500 dark:text-neutral-400">{name || '—'}</span>
                  </div>
                </>
              )}
            </div>
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
              <OptionRow
                key={opt.id}
                rid={rid}
                setId={osid}
                option={opt}
                onUpdated={loadData}
                t={t}
                activeLocale={activeLocale}
                sourceLocale={sourceLocale}
                canEdit={canEdit}
              />
            ))}

            {/* Add-option row */}
            {canEdit && (
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
              <NumberInput
                min={0}
                value={newOptionPrice}
                onChange={setNewOptionPrice}
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
            )}
          </div>
        </section>

        {/* Destructive */}
        {canEdit && (
          <button
            onClick={handleDelete}
            className="text-sm font-medium text-red-500 hover:text-red-600 hover:underline"
          >
            {t('delete')} {t('options').toLowerCase()}
          </button>
        )}
      </div>
    </CenteredModalShell>
  );
}

// ─── Editable option row ─────────────────────────────────────────────

function OptionRow({ rid, setId, option, onUpdated, t, activeLocale, sourceLocale, canEdit }: {
  rid: number;
  setId: number;
  option: OptionSetOption;
  onUpdated: () => void;
  t: (key: string) => string;
  activeLocale: Locale;
  sourceLocale: Locale;
  canEdit: boolean;
}) {
  const [name, setName] = useState(option.name);
  const [price, setPrice] = useState(option.price);
  const [sku, setSku] = useState(option.sku ?? '');
  const [isActive, setIsActive] = useState(option.is_active);
  const [translations, setTranslations] = useState<TranslationMap>(option.translations ?? {});
  const isSourceTab = activeLocale === sourceLocale;
  const translatedName = translations?.name?.[activeLocale] ?? '';

  const persist = async (patch: Partial<OptionInSetInput>) => {
    const payload: OptionInSetInput = {
      name: (patch.name ?? name).trim() || option.name,
      price: patch.price ?? price,
      sku: patch.sku ?? (sku.trim() || undefined),
      is_active: patch.is_active ?? isActive,
      sort_order: option.sort_order,
      translations: patch.translations ?? translations,
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

  const handleTranslatedNameBlur = () => {
    const trimmed = translatedName.trim();
    const previous = option.translations?.name?.[activeLocale] ?? '';
    if (trimmed === previous) return;
    const nextMap = setLocaleOverride(translations, 'name', activeLocale, trimmed);
    setTranslations(nextMap);
    persist({ translations: nextMap });
  };

  const handlePriceBlur = () => {
    if (price === option.price) return;
    persist({ price });
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
      {isSourceTab ? (
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          readOnly={!canEdit}
          className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white pr-2"
        />
      ) : (
        <input
          value={translatedName}
          onChange={(e) =>
            setTranslations((prev) =>
              setLocaleOverride(prev, 'name', activeLocale, e.target.value),
            )
          }
          onBlur={handleTranslatedNameBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          readOnly={!canEdit}
          placeholder={name || t('variantName')}
          className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white pr-2 italic"
        />
      )}
      <input
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        onBlur={handleSkuBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        readOnly={!canEdit}
        placeholder="—"
        className="text-sm bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
      />
      <NumberInput
        min={0}
        value={price}
        onChange={setPrice}
        onBlur={handlePriceBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        readOnly={!canEdit}
        placeholder="0.00"
        className="text-sm bg-transparent border-0 outline-none text-neutral-900 dark:text-white text-right pr-1"
      />
      <select
        value={isActive ? 'active' : 'inactive'}
        onChange={(e) => handleActiveChange(e.target.value === 'active')}
        disabled={!canEdit}
        className="text-xs bg-transparent border-0 outline-none text-neutral-700 dark:text-neutral-300"
      >
        <option value="active">{t('available')}</option>
        <option value="inactive">{t('unavailable')}</option>
      </select>
      {canEdit ? (
        <button
          onClick={handleDelete}
          className="size-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title={t('delete')}
        >
          <Trash2 size={14} />
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
