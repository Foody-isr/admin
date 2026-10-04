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
import { LocaleEditingBanner } from '@/components/i18n/LocaleEditingBanner';

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
          <p className="text-[var(--fg-muted)]">Option set not found</p>
          <button
            onClick={goBack}
            className="px-4 py-2 text-sm font-medium text-[var(--action-fg)] bg-[var(--action)] hover:bg-[var(--action-hover)] rounded-r-md transition-all"
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
            <h3 className="text-lg font-semibold text-[var(--fg)]">
              {t('details') || 'Details'}
            </h3>
          </div>
          <div className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-5 space-y-4">
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
            </div>
            <LocaleEditingBanner active={activeLocale} source={sourceLocale} />
            <div>
              <label className="block text-sm font-medium text-[var(--fg-muted)] mb-2">
                {t('optionSetName')}
              </label>
              {isSourceTab ? (
                <input aria-label={t('optionSetName')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-10 px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-lg text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-ink)] focus:border-[var(--brand-ink)] transition-colors"
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
                    className="w-full min-h-10 px-3 py-2 text-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-lg text-[var(--fg)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-ink)] focus:border-[var(--brand-ink)] transition-colors"
                  />
                  <div className="text-xs text-[var(--fg-subtle)] mt-1">
                    {(t('languageSourceLabel') || 'Source') + ': '}
                    <span className="text-[var(--fg-muted)]">{name || '—'}</span>
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
            <h3 className="text-lg font-semibold text-[var(--fg)]">
              {t('options')}
            </h3>
          </div>
          <div className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] overflow-x-auto">
            <div
              className="grid min-w-[640px] text-xs font-semibold text-[var(--fg-muted)] px-4 py-3 bg-[var(--surface-2)] border-b border-[var(--line)]"
              style={{ gridTemplateColumns: '1fr 140px 110px 100px 36px' }}
            >
              <span>{t('variantName')}</span>
              <span>SKU</span>
              <span className="text-end">{t('price')}</span>
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
              className="grid min-w-[640px] items-center gap-2 px-4 py-3 border-t border-[var(--line)] bg-[var(--surface-2)]"
              style={{ gridTemplateColumns: '1fr 140px 110px 100px 36px' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Plus size={14} className="text-[var(--brand-ink)] shrink-0" />
                <input aria-label={t('variantName')}
                  value={newOptionName}
                  onChange={(e) => setNewOptionName(e.target.value)}
                  placeholder={t('addOption') || 'Add option'}
                  className="flex-1 text-sm bg-transparent border-0 outline-none text-[var(--fg)] min-w-0"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
                />
              </div>
              <input aria-label="SKU"
                value={newOptionSku}
                onChange={(e) => setNewOptionSku(e.target.value)}
                placeholder="—"
                className="text-sm bg-transparent border-0 outline-none text-[var(--fg-muted)]"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
              />
              <NumberInput
                min={0} aria-label={t('price')}
                value={newOptionPrice}
                onChange={setNewOptionPrice}
                placeholder="0.00"
                className="text-sm bg-transparent border-0 outline-none text-[var(--fg)] text-end pe-1"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddOption(); }}
              />
              <span />
              {newOptionName.trim() ? (
                <button
                  onClick={handleAddOption}
                  className="text-sm font-medium text-[var(--brand-ink)] hover:underline justify-self-end"
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
            className="text-sm font-medium text-[var(--danger-500)] hover:underline"
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
      className="grid min-w-[640px] items-center gap-2 px-4 py-3 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors"
      style={{ gridTemplateColumns: '1fr 140px 110px 100px 36px' }}
    >
      {isSourceTab ? (
        <input aria-label={t('optionSetName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          readOnly={!canEdit}
          className="text-sm bg-transparent border-0 outline-none text-[var(--fg)] pe-2"
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
          className="text-sm bg-transparent border-0 outline-none text-[var(--fg)] pe-2 italic"
        />
      )}
      <input
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        onBlur={handleSkuBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        readOnly={!canEdit}
        placeholder="—"
        className="text-sm bg-transparent border-0 outline-none text-[var(--fg-muted)]"
      />
      <NumberInput
        min={0}
        value={price}
        onChange={setPrice}
        onBlur={handlePriceBlur}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        readOnly={!canEdit}
        placeholder="0.00"
        className="text-sm bg-transparent border-0 outline-none text-[var(--fg)] text-end pe-1"
      />
      <select
        value={isActive ? 'active' : 'inactive'}
        onChange={(e) => handleActiveChange(e.target.value === 'active')}
        disabled={!canEdit}
        className="text-xs bg-transparent border-0 outline-none text-[var(--fg-muted)]"
      >
        <option value="active">{t('available')}</option>
        <option value="inactive">{t('unavailable')}</option>
      </select>
      {canEdit ? (
        <button
          onClick={handleDelete}
          className="size-9 flex items-center justify-center rounded-lg text-[var(--fg-subtle)] hover:text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
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
