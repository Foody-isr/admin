'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createOptionSet, getRestaurant, OptionSetInput, TranslationMap } from '@/lib/api';
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

// Create Option Set page — Figma-style full-screen modal with lucide icons,
// orange gradient Save, and a rounded-card options table that mirrors the
// MenuItemDetails modal shell.
//
// Portion size is per-item (ItemOptionOverride), so it's not captured here —
// it appears in the per-item variants editor instead.

interface LocalOption {
  key: string;
  name: string;
  price: number;
  sku: string;
  translations: TranslationMap;
}

const newOption = (): LocalOption => ({
  key: crypto.randomUUID(),
  name: '',
  price: 0,
  sku: '',
  translations: {},
});

export default function NewOptionSetPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [name, setName] = useState('');
  const [setTranslations, setSetTranslations] = useState<TranslationMap>({});
  const [options, setOptions] = useState<LocalOption[]>([newOption()]);
  const [saving, setSaving] = useState(false);
  const [sourceLocale, setSourceLocale] = useState<Locale>('en');
  const [activeLocale, setActiveLocale] = useState<Locale>('en');
  const isSourceTab = activeLocale === sourceLocale;

  useEffect(() => {
    getRestaurant(rid)
      .then((restaurant) => {
        const locale = restaurant.default_locale;
        if (locale === 'en' || locale === 'he' || locale === 'fr') {
          setSourceLocale(locale);
          setActiveLocale(locale);
        }
      })
      .catch(() => {});
  }, [rid]);

  const handleSave = async () => {
    if (!name.trim()) return;
    const validOptions = options.filter((o) => o.name.trim());
    if (validOptions.length === 0) return;
    setSaving(true);
    try {
      const input: OptionSetInput = {
        name: name.trim(),
        translations: setTranslations,
        options: validOptions.map((o, i) => ({
          name: o.name.trim(),
          price: o.price,
          sku: o.sku.trim() || undefined,
          is_active: true,
          sort_order: i,
          translations: o.translations,
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

  const missingTranslations = Object.fromEntries(
    SUPPORTED_LOCALES.filter((locale) => locale !== sourceLocale).map((locale) => [
      locale,
      !setTranslations?.name?.[locale] ||
        options.some((option) => option.name.trim() && !option.translations?.name?.[locale]),
    ]),
  );

  return (
    <CenteredModalShell
      title={t('createOptionSet')}
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
            <LocaleTabs
              locales={SUPPORTED_LOCALES}
              source={sourceLocale}
              active={activeLocale}
              onChange={setActiveLocale}
              missing={missingTranslations}
            />
            <LocaleEditingBanner active={activeLocale} source={sourceLocale} />
            <label className="block text-sm font-medium text-[var(--fg-muted)] mb-2">
              {t('optionSetName')}
            </label>
            {isSourceTab ? (
              <input aria-label={t('optionSetName')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('optionSetName')}
                autoFocus
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
                <div className="text-xs text-[var(--fg-subtle)]">
                  {(t('languageSourceLabel') || 'Source') + ': '}
                  <span className="text-[var(--fg-muted)]">{name || '—'}</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Options table */}
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
              style={{ gridTemplateColumns: '1fr 140px 110px 36px' }}
            >
              <span>{t('variantName')}</span>
              <span>SKU</span>
              <span className="text-end">{t('price')}</span>
              <span />
            </div>

            {options.map((opt) => (
              <div
                key={opt.key}
                className="grid min-w-[640px] items-center gap-2 px-4 py-3 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-2)] transition-colors"
                style={{ gridTemplateColumns: '1fr 140px 110px 36px' }}
              >
                {isSourceTab ? (
                  <input aria-label={t('variantName')}
                    value={opt.name}
                    onChange={(e) => updateOption(opt.key, { name: e.target.value })}
                    placeholder={t('addVariant') || 'Option name'}
                    className="text-sm bg-transparent border-0 outline-none text-[var(--fg)] pe-2"
                  />
                ) : (
                  <input
                    value={opt.translations?.name?.[activeLocale] ?? ''}
                    onChange={(e) =>
                      updateOption(opt.key, {
                        translations: setLocaleOverride(
                          opt.translations,
                          'name',
                          activeLocale,
                          e.target.value,
                        ),
                      })
                    }
                    placeholder={opt.name || (t('addVariant') || 'Option name')}
                    className="text-sm bg-transparent border-0 outline-none text-[var(--fg)] pe-2 italic"
                  />
                )}
                <input aria-label="SKU"
                  value={opt.sku}
                  onChange={(e) => updateOption(opt.key, { sku: e.target.value })}
                  placeholder="—"
                  className="text-sm bg-transparent border-0 outline-none text-[var(--fg-muted)]"
                />
                <NumberInput
                  min={0} aria-label={t('price')}
                  value={opt.price}
                  onChange={(n) => updateOption(opt.key, { price: n })}
                  placeholder="0.00"
                  className="text-sm bg-transparent border-0 outline-none text-[var(--fg)] text-end pe-1"
                />
                {canEdit && options.length > 1 ? (
                  <button
                    onClick={() => removeOption(opt.key)}
                    className="size-9 flex items-center justify-center rounded-lg text-[var(--fg-subtle)] hover:text-[var(--danger-500)] hover:bg-[var(--danger-50)] transition-colors"
                    title={t('delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            ))}

            {canEdit && (
              <button
                onClick={addOption}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-[var(--brand-ink)] hover:bg-[var(--brand-soft)] transition-colors border-t border-[var(--line)]"
              >
                <Plus size={16} />
                {t('addVariant') || 'Add option'}
              </button>
            )}
          </div>
        </section>
      </div>
    </CenteredModalShell>
  );
}
