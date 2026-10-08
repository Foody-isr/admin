'use client';

import {
  RefreshCw,
  AlertTriangle,
  Languages,
  UtensilsCrossed,
  ChevronDown,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import * as Popover from '@radix-ui/react-popover';
import { useParams } from 'next/navigation';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import type {
  ItemType,
  PricingMode,
  TranslationMap,
  MenuItemCustomerFacts,
} from '@/lib/api';
import { Field, Input, NumberField, Textarea } from '@/components/ds';
import { type Locale } from '@/components/i18n/LocaleTabs';
import { Switch } from '@/components/ui/switch';
import { LocaleEditingBanner } from '@/components/i18n/LocaleEditingBanner';
import ItemEditorSection from './ItemEditorSection';
import CustomerFactsEditor from './CustomerFactsEditor';

const SUPPORTED_LOCALES: Locale[] = ['en', 'he', 'fr'];

/** Shared field layout for creating and editing an item on one continuous page. */

interface Props {
  name: string;
  setName: (v: string) => void;
  price: number;
  setPrice: (v: number) => void;
  /** How the item is priced: a flat/size "standard" price, or "by_weight"
   *  (₪/kg against a measured weight). Controls which price inputs show. */
  pricingMode: PricingMode;
  setPricingMode: (v: PricingMode) => void;
  /** Price per kilogram (₪) — only used when pricingMode is "by_weight". */
  pricePerKg: number;
  setPricePerKg: (v: number) => void;
  /** Estimated weight per unit (grams) — used when pricingMode is "by_weight". */
  estimatedWeightGrams: number;
  setEstimatedWeightGrams: (v: number) => void;
  description: string;
  setDescription: (v: string) => void;
  customerFacts: MenuItemCustomerFacts;
  setCustomerFacts: (v: MenuItemCustomerFacts) => void;
  suggestedCustomerIngredients?: string[];
  /** Private staff guidance about this item for the AI ordering assistant only
   *  (never shown to customers). */
  aiContext?: string;
  setAiContext?: (v: string) => void;
  /** Item-level serving size shown under the title when the item has no size
   *  options (e.g. "par personne"). Items WITH sizes derive their range from
   *  the per-size portions in the VariantsEditor instead. */
  portion: string;
  setPortion: (v: string) => void;
  /** Per-item toggle for the guest "special instructions" field. Default true
   *  (shown). The control only renders when setAllowNotes is provided. */
  allowNotes?: boolean;
  setAllowNotes?: (v: boolean) => void;
  vatRate: number;
  itemType: ItemType;
  /** Request a type change. The parent decides whether to confirm or apply
   *  immediately (it owns the variant/recipe/modifier/step state that may
   *  be lost). */
  onTypeChange: (next: ItemType) => void;
  /**
   * Restaurant's default content language. When omitted (e.g. on the
   * new-item page), the language selector is not rendered and the editor
   * behaves as before.
   */
  sourceLocale?: Locale;
  /** Per-locale name/description overrides. */
  translations?: TranslationMap;
  /** Updater for translations. Pass a fresh object back to the parent. */
  setTranslations?: (t: TranslationMap) => void;
  /**
   * Force-refresh translations from AWS Translate. Called by the per-field
   * "Re-translate this field" link (with a single-element `fields` array)
   * and the "Re-translate all" button (no `fields` argument). The parent
   * is responsible for the API call AND for persisting the result so the
   * editor reflects what the DB now holds. Omit to hide the buttons (e.g.
   * on the new-item page, where there is no item ID yet).
   */
  onRetranslate?: (fields?: string[]) => Promise<TranslationMap>;
  /**
   * When the article has meaningful sizes/variants, the single base-price
   * field is replaced by a hint — price is then owned solely by the size rows
   * (rendered just below by the page's VariantsEditor). This removes the
   * "same price shown in two places" confusion. Combos never set this (they
   * keep a base price).
   */
  hideBasePrice?: boolean;
  photo?: React.ReactNode;
  pricingContent?: React.ReactNode;
  personalizationContent?: React.ReactNode;
  compositionContent?: React.ReactNode;
  availabilityContent?: React.ReactNode;
  recipeContent?: React.ReactNode;
}

/** Renders every applicable item section without hiding or unmounting the form. */
export default function MenuItemEditorForm({
  name,
  setName,
  price,
  setPrice,
  pricingMode,
  setPricingMode,
  pricePerKg,
  setPricePerKg,
  estimatedWeightGrams,
  setEstimatedWeightGrams,
  description,
  setDescription,
  customerFacts,
  setCustomerFacts,
  suggestedCustomerIngredients,
  aiContext,
  setAiContext,
  portion,
  setPortion,
  allowNotes = true,
  setAllowNotes,
  vatRate,
  itemType,
  onTypeChange,
  sourceLocale,
  translations,
  setTranslations,
  onRetranslate,
  hideBasePrice = false,
  photo,
  pricingContent,
  personalizationContent,
  compositionContent,
  availabilityContent,
  recipeContent,
}: Props) {
  const { symbol } = useCurrency();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  // Track which field is currently being re-translated so we can show a spinner
  // and disable the button. `'all'` covers the strip-level "Re-translate all"
  // action; individual field names cover the per-field links.
  const [retranslating, setRetranslating] = useState<
    null | 'all' | 'name' | 'description' | 'portion'
  >(null);
  const [retranslateError, setRetranslateError] = useState<string | null>(null);

  const runRetranslate = async (
    target: 'all' | 'name' | 'description' | 'portion',
  ) => {
    if (!onRetranslate || !setTranslations) return;
    setRetranslating(target);
    setRetranslateError(null);
    try {
      const next = await onRetranslate(target === 'all' ? undefined : [target]);
      setTranslations(next);
    } catch (e) {
      setRetranslateError(
        t('languageRetranslateFailed') || 'Re-translation failed. Try again.',
      );
      // Surface to console for debugging; users see the inline message.
      console.error('retranslate failed', e);
    } finally {
      setRetranslating(null);
    }
  };
  // i18n editor is only enabled when the parent passes the trio of
  // sourceLocale / translations / setTranslations. The new-item page omits
  // them, so the editor behaves exactly as before there.
  const i18nEnabled = !!sourceLocale && !!setTranslations;
  const effectiveSource: Locale = sourceLocale ?? 'en';
  const [activeLocale, setActiveLocale] = useState<Locale>(effectiveSource);
  // The real source locale isn't known on first render: the parent seeds
  // `sourceLocale` with an 'en' placeholder and only learns the restaurant's
  // actual default_locale after an async fetch. useState() captured that
  // placeholder once, so without this sync the editor stays stuck on the
  // English tab while the true source is (e.g.) French — and every name /
  // description edit silently lands in the English translation map instead of
  // the source field the web renders ("saved but invisible"). Follow the
  // source whenever it changes, until the owner explicitly picks a tab.
  const userPickedLocale = useRef(false);
  useEffect(() => {
    if (!userPickedLocale.current) {
      setActiveLocale(effectiveSource);
    }
  }, [effectiveSource]);
  const selectLocale = (loc: Locale) => {
    userPickedLocale.current = true;
    setActiveLocale(loc);
  };
  const isCombo = itemType === 'combo';
  // Retain staged recipe instructions when an existing article changes type.
  const [recipeMounted, setRecipeMounted] = useState(!isCombo);
  useEffect(() => {
    if (!isCombo) setRecipeMounted(true);
  }, [isCombo]);

  const isSourceTab = !i18nEnabled || activeLocale === effectiveSource;
  const nameTranslation = translations?.name?.[activeLocale] ?? '';
  const descriptionTranslation =
    translations?.description?.[activeLocale] ?? '';
  const portionTranslation = translations?.portion?.[activeLocale] ?? '';

  const setTranslatedField = (
    field: 'name' | 'description' | 'portion',
    value: string,
  ) => {
    if (!setTranslations) return;
    const next: TranslationMap = { ...(translations ?? {}) };
    const fieldMap = { ...(next[field] ?? {}) };
    if (value === '') {
      delete fieldMap[activeLocale];
    } else {
      fieldMap[activeLocale] = value;
    }
    if (Object.keys(fieldMap).length === 0) {
      delete next[field];
    } else {
      next[field] = fieldMap;
    }
    setTranslations(next);
  };

  // Source-language sanity check: the source text lives in name/description/
  // portion (the translation tabs bind the translations map, so these props
  // always hold the source-locale value). If that text is Hebrew-script while
  // the restaurant's source language is set to something else, every auto-
  // translation comes back as a Hebrew pass-through (AWS Translate is told the
  // wrong source language) — warn and link to the Language settings.
  const { restaurantId } = useParams();
  const sourceLooksHebrew = /[\u0590-\u05FF]/.test(
    `${name} ${description} ${portion}`,
  );
  const localeMismatch =
    i18nEnabled && effectiveSource !== 'he' && sourceLooksHebrew;

  // Highlight tabs where a non-source translation is missing, so the owner
  // can see at a glance which locales still need attention. The source tab
  // is never marked missing — its content lives in `name` / `description`.
  const missing: Partial<Record<Locale, boolean>> = {};
  for (const loc of SUPPORTED_LOCALES) {
    if (loc === effectiveSource) continue;
    const hasName = !!translations?.name?.[loc];
    const hasDesc = !!translations?.description?.[loc] || !description.trim();
    const hasPortion = !!translations?.portion?.[loc] || !portion.trim();
    missing[loc] = !hasName || !hasDesc || !hasPortion;
  }

  const priceLabel = isCombo
    ? t('composeBasePriceLabel')
    : t('sellingPriceLabel') || 'Prix de vente';

  // By-weight pricing is only offered for regular articles — combos keep an
  // explicit base price, and the toggle is meaningless for them.
  const canByWeight = !isCombo;
  const isByWeight = canByWeight && pricingMode === 'by_weight';

  return (
    <div className="item-editor-form">
      <ItemEditorSection
        id="information"
        title={t('itemSectionInformation')}
        hideTitle
      >
        <div className="item-identity">
          <div className="item-type-field">
            <UtensilsCrossed aria-hidden />
            <Field htmlFor="menu-item-type" label={t('itemType')}>
              <select
                id="menu-item-type"
                className="input"
                disabled={!canEdit}
                value={itemType}
                onChange={(event) =>
                  onTypeChange(event.target.value as ItemType)
                }
              >
                <option value="food_and_beverage">{t('tabArticle')}</option>
                <option value="combo">{t('combo')}</option>
              </select>
            </Field>
            <ChevronDown className="item-type-chevron" aria-hidden />
          </div>
          {/* Prominent, stateful language banner — sits in the reading path right
            above the fields so owners can't miss whether they're editing the
            source or a translation. */}
          {i18nEnabled && !isSourceTab && (
            <LocaleEditingBanner
              active={activeLocale}
              source={effectiveSource}
            />
          )}

          {/* Source-language mismatch warning — the item text is Hebrew but the
            restaurant's source language says otherwise, so auto-translations
            are pass-through garbage until the setting is corrected. */}
          {localeMismatch && (
            <div
              className="flex items-center gap-[var(--s-3)] rounded-r-lg border p-[var(--s-3)]"
              style={{
                background:
                  'color-mix(in oklab, var(--warning-500) 6%, var(--surface))',
                borderColor:
                  'color-mix(in oklab, var(--warning-500) 30%, var(--line))',
              }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--warning-500)' }}
                aria-hidden
              />
              <span className="flex-1 text-fs-xs text-[var(--fg)]">
                {(
                  t('languageMismatchWarning') ||
                  'This item is written in Hebrew, but your menu source language is set to {lang}. Auto-translations will be wrong until you fix it.'
                ).replace(
                  '{lang}',
                  effectiveSource === 'en'
                    ? t('languageEnglish') || 'English'
                    : t('languageFrench') || 'French',
                )}
              </span>
              <Link
                href={`/${restaurantId}/settings/language`}
                className="text-fs-xs font-medium text-[var(--brand-500)] hover:underline whitespace-nowrap"
              >
                {t('languageMismatchCta') || 'Fix in Language settings'}
              </Link>
            </div>
          )}

          {/* Item name in the selected content language. */}
          <div className="item-name-field">
            {/* The language selector changes localized text; operational fields stay shared. */}
            {i18nEnabled && (
              <Popover.Root>
                <div className="item-translations">
                  <Popover.Trigger asChild>
                    <button type="button" aria-label={t('itemContentLanguage')}>
                      <Languages size={18} />
                      <span>{activeLocale.toUpperCase()}</span>
                      <ChevronDown size={14} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Content
                    align="end"
                    sideOffset={8}
                    className="item-translations-panel"
                  >
                    <label className="flex items-center gap-2 text-sm text-[var(--fg-muted)]">
                      {t('itemContentLanguage')}
                      <select
                        className="input w-auto"
                        value={activeLocale}
                        onChange={(event) =>
                          selectLocale(event.target.value as Locale)
                        }
                      >
                        {SUPPORTED_LOCALES.map((loc) => (
                          <option key={loc} value={loc}>
                            {t(
                              loc === 'he'
                                ? 'languageHebrew'
                                : loc === 'fr'
                                  ? 'languageFrench'
                                  : 'languageEnglish',
                            )}
                            {loc === effectiveSource
                              ? ` · ${t('languageSourceLabel')}`
                              : missing[loc]
                                ? ` · ${t('itemTranslationMissing')}`
                                : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    {canEdit && onRetranslate && (
                      <button
                        type="button"
                        onClick={() => runRetranslate('all')}
                        disabled={retranslating !== null}
                        className="inline-flex items-center gap-1.5 h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        title={
                          t('languageRetranslateAll') || 'Re-translate all'
                        }
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${retranslating === 'all' ? 'animate-spin' : ''}`}
                          aria-hidden
                        />
                        <span>
                          {retranslating === 'all'
                            ? t('languageRetranslateRunning') ||
                              'Re-translating…'
                            : t('languageRetranslateAll') || 'Re-translate all'}
                        </span>
                      </button>
                    )}
                    <p className="text-sm text-[var(--fg-muted)]">
                      {t('itemLanguageScopeHint')}
                    </p>
                    {retranslateError && (
                      <span className="text-fs-xs text-[var(--danger-500)]">
                        {retranslateError}
                      </span>
                    )}
                  </Popover.Content>
                </div>
              </Popover.Root>
            )}

            <Field
              className="item-field"
              htmlFor="menu-item-name"
              label={t('itemNameLabel') || "Nom de l'article"}
            >
              {isSourceTab ? (
                <Input
                  disabled={!canEdit}
                  id="menu-item-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('nameRequired') || 'Nom *'}
                />
              ) : (
                <>
                  <Input
                    disabled={!canEdit}
                    id="menu-item-name"
                    value={nameTranslation}
                    onChange={(e) => setTranslatedField('name', e.target.value)}
                    placeholder={name || t('nameRequired') || 'Nom *'}
                  />
                  <div className="flex items-center justify-between gap-[var(--s-3)] mt-1">
                    <div className="text-fs-xs text-[var(--fg-subtle)]">
                      {(t('languageSourceLabel') || 'Source') + ': '}
                      <span className="font-medium text-[var(--fg-muted)]">
                        {name || '—'}
                      </span>
                    </div>
                    {canEdit && onRetranslate && (
                      <button
                        type="button"
                        onClick={() => runRetranslate('name')}
                        disabled={retranslating !== null}
                        className="inline-flex items-center gap-1 text-fs-xs text-[var(--brand-500)] hover:underline disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${retranslating === 'name' ? 'animate-spin' : ''}`}
                          aria-hidden
                        />
                        {retranslating === 'name'
                          ? t('languageRetranslateRunning') || 'Re-translating…'
                          : t('languageRetranslateField') ||
                            'Re-translate this field'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </Field>
          </div>
        </div>
        {/* Pricing mode — Standard vs By weight. Only for regular articles;
            combos always price by a base amount. Selecting "By weight" swaps
            the base-price field below for per-kg + estimated-weight inputs. */}
        {/* Flat price or weight-based pricing. */}
        <div className="item-primary-price">
          {isByWeight ? (
            // By-weight items are priced per kg (not by size), so the standard
            // base-price field is replaced by a ₪/kg input plus an estimated
            // weight used to size the card hold before the real weigh-in.
            <>
              <Field
                className="item-field"
                label={t('pricePerKgLabel') || 'Price per kg'}
                hint={
                  t('pricePerKgHint') ||
                  'Rate charged against the measured weight.'
                }
              >
                {canByWeight && (
                  <select
                    className="item-price-mode"
                    aria-label={t('pricingModeLabel')}
                    disabled={!canEdit}
                    value={pricingMode}
                    onChange={(event) =>
                      setPricingMode(event.target.value as PricingMode)
                    }
                  >
                    <option value="standard">{t('pricingModeStandard')}</option>
                    <option value="by_weight">
                      {t('pricingModeByWeight')}
                    </option>
                  </select>
                )}
                <div className="relative">
                  <NumberField
                    disabled={!canEdit}
                    aria-label={t('pricePerKgLabel')}
                    min={0}
                    value={pricePerKg}
                    onChange={setPricePerKg}
                    placeholder="0.00"
                    className="pe-16 tabular-nums"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                    {symbol}/kg
                  </span>
                </div>
              </Field>

              <Field
                className="item-field"
                label={t('estimatedWeightLabel') || 'Estimated weight'}
                hint={
                  t('estimatedWeightHint') ||
                  'Used to place the card hold before weighing.'
                }
              >
                <div className="relative">
                  <NumberField
                    disabled={!canEdit}
                    aria-label={t('estimatedWeightLabel')}
                    min={0}
                    value={estimatedWeightGrams}
                    onChange={setEstimatedWeightGrams}
                    placeholder="0"
                    className="pe-10 tabular-nums"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                    g
                  </span>
                </div>
              </Field>
            </>
          ) : (
            <Field
              className="item-field"
              label={priceLabel}
              hint={isCombo ? t('composeBasePriceHint') : undefined}
            >
              {canByWeight && (
                <select
                  className="item-price-mode"
                  aria-label={t('pricingModeLabel')}
                  disabled={!canEdit}
                  value={pricingMode}
                  onChange={(event) =>
                    setPricingMode(event.target.value as PricingMode)
                  }
                >
                  <option value="standard">{t('pricingModeStandard')}</option>
                  <option value="by_weight">{t('pricingModeByWeight')}</option>
                </select>
              )}
              {hideBasePrice ? (
                // Sizes own the price — show a read-only hint pointing at the
                // size rows below instead of a second editable price field.
                <div className="item-price-from-variants">
                  {t('priceFromSizes') ||
                    'Le prix est défini par les tailles ci-dessous.'}
                </div>
              ) : (
                <div className="relative">
                  <NumberField
                    disabled={!canEdit}
                    aria-label={priceLabel}
                    min={0}
                    value={price}
                    onChange={setPrice}
                    placeholder="0.00"
                    className="pe-8 tabular-nums"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                    {symbol}
                  </span>
                </div>
              )}
            </Field>
          )}
        </div>
        <p className="item-vat-note">
          {t('vat')}: {vatRate}%
        </p>

        {/* Description */}
        <Field
          className="item-field item-description"
          htmlFor="menu-item-description"
          label={t('description') || 'Description'}
        >
          {isSourceTab ? (
            <Textarea
              disabled={!canEdit}
              id="menu-item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('addDescription') || 'Ajouter une description'}
              rows={4}
            />
          ) : (
            <>
              <Textarea
                disabled={!canEdit}
                id="menu-item-description"
                value={descriptionTranslation}
                onChange={(e) =>
                  setTranslatedField('description', e.target.value)
                }
                placeholder={
                  description ||
                  t('addDescription') ||
                  'Ajouter une description'
                }
                rows={4}
              />
              <div className="flex items-center justify-between gap-[var(--s-3)] mt-1">
                <div className="text-fs-xs text-[var(--fg-subtle)]">
                  {(t('languageSourceLabel') || 'Source') + ': '}
                  <span className="text-[var(--fg-muted)]">
                    {description || '—'}
                  </span>
                </div>
                {canEdit && onRetranslate && (
                  <button
                    type="button"
                    onClick={() => runRetranslate('description')}
                    disabled={retranslating !== null}
                    className="inline-flex items-center gap-1 text-fs-xs text-[var(--brand-500)] hover:underline disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${retranslating === 'description' ? 'animate-spin' : ''}`}
                      aria-hidden
                    />
                    {retranslating === 'description'
                      ? t('languageRetranslateRunning') || 'Re-translating…'
                      : t('languageRetranslateField') ||
                        'Re-translate this field'}
                  </button>
                )}
              </div>
            </>
          )}
        </Field>
        {photo}
      </ItemEditorSection>
      <ItemEditorSection id="pricing" title={t('itemSectionPricing')} hideTitle>
        {(!hideBasePrice || isByWeight) && (
          <>
            {/* Portion / serving size — shown under the item title in guest apps.
            Used when the item has no size options; items WITH sizes derive the
            range from the per-size portions in the VariantsEditor below. */}
            <Field
              className="item-field item-portion"
              label={t('portion') || 'Portion'}
              hint={
                t('portionHint') ||
                'Affichée sous le titre côté client. Pour les articles sans tailles (ex. « par personne »).'
              }
            >
              {isSourceTab ? (
                <Input
                  disabled={!canEdit}
                  value={portion}
                  onChange={(e) => setPortion(e.target.value)}
                  placeholder={t('portionPlaceholder') || 'ex. par personne'}
                />
              ) : (
                <>
                  <Input
                    disabled={!canEdit}
                    value={portionTranslation}
                    onChange={(e) =>
                      setTranslatedField('portion', e.target.value)
                    }
                    placeholder={
                      portion || t('portionPlaceholder') || 'ex. par personne'
                    }
                  />
                  <div className="flex items-center justify-between gap-[var(--s-3)] mt-1">
                    <div className="text-fs-xs text-[var(--fg-subtle)]">
                      {(t('languageSourceLabel') || 'Source') + ': '}
                      <span className="text-[var(--fg-muted)]">
                        {portion || '—'}
                      </span>
                    </div>
                    {canEdit && onRetranslate && (
                      <button
                        type="button"
                        onClick={() => runRetranslate('portion')}
                        disabled={retranslating !== null}
                        className="inline-flex items-center gap-1 text-fs-xs text-[var(--brand-500)] hover:underline disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${retranslating === 'portion' ? 'animate-spin' : ''}`}
                          aria-hidden
                        />
                        {retranslating === 'portion'
                          ? t('languageRetranslateRunning') || 'Re-translating…'
                          : t('languageRetranslateField') ||
                            'Re-translate this field'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </Field>
          </>
        )}
        {pricingContent}
      </ItemEditorSection>
      {compositionContent && (
        <ItemEditorSection id="composition" title={t('tabComposition')}>
          {compositionContent}
        </ItemEditorSection>
      )}
      {!isCombo && (
        <ItemEditorSection
          id="personalizations"
          title={t('itemSectionPersonalizations')}
        >
          {/* Per-item "special instructions" (notes) toggle — guest web only.
            Default is on; turn off to hide the note field for this item. */}
          {setAllowNotes && (
            <label className="item-notes-setting">
              <span>{t('itemNotesFieldLabel')}</span>
              <Switch
                checked={allowNotes}
                onCheckedChange={(value) => canEdit && setAllowNotes(value)}
                disabled={!canEdit}
                aria-label={t('itemNotesFieldLabel')}
                className="data-[state=unchecked]:bg-input"
              />
            </label>
          )}

          {personalizationContent}
        </ItemEditorSection>
      )}
      <ItemEditorSection
        id="customer-facts"
        hideTitle
        title={t('itemSectionCustomerFacts')}
      >
        {
          <CustomerFactsEditor
            value={customerFacts}
            onChange={setCustomerFacts}
            disabled={!canEdit}
            suggestedIngredients={suggestedCustomerIngredients}
          />
        }
      </ItemEditorSection>
      <ItemEditorSection id="availability" title={t('tabStock')}>
        {availabilityContent}
      </ItemEditorSection>
      {(!isCombo || recipeMounted) && (
        <ItemEditorSection
          id="recipe"
          title={t('itemSectionRecipe')}
          hidden={isCombo}
        >
          {recipeContent}
        </ItemEditorSection>
      )}
      <ItemEditorSection id="assistant" title={t('aiItemContext')}>
        {/* AI assistant context — private staff guidance, never shown to guests. */}
        {setAiContext && (
          <Field
            label={t('aiItemContext') || 'AI assistant context'}
            hint={
              t('aiItemContextHint') ||
              'Private notes that help the AI assistant describe this dish accurately. Never shown to customers.'
            }
          >
            <Textarea
              disabled={!canEdit}
              aria-label={t('aiItemContext')}
              value={aiContext || ''}
              onChange={(e) => setAiContext(e.target.value)}
              placeholder={
                t('aiItemContextPlaceholder') ||
                'e.g. Braided Shabbat bread, served as bread — not a dessert.'
              }
              rows={3}
              maxLength={1000}
            />
          </Field>
        )}
      </ItemEditorSection>
    </div>
  );
}
