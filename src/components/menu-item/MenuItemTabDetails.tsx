'use client';

import { ChevronDown, Boxes, ArrowRight, RefreshCw, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import type { MenuCategory, Menu, ItemType, TranslationMap } from '@/lib/api';
import MenuGroupPicker from '@/components/MenuGroupPicker';
import { Field, Input, NumberField, Textarea } from '@/components/ds';
import { LocaleTabs, type Locale } from '@/components/i18n/LocaleTabs';
import TypePickerCards from './combo/TypePickerCards';

const SUPPORTED_LOCALES: Locale[] = ['en', 'he', 'fr'];

// Aligned to design-reference/design/screens/item-editor.jsx:274-316 (DetailsTab).
// Flat 2-col and 3-col grids with Field + Input primitives; status uses dot-pulse.
//
// As of the combo refactor: the "Type d'article" select is replaced by
// `TypePickerCards` — a segmented two-card picker. For combos, a callout at
// the bottom links to the Composition tab.

interface Props {
  name: string;
  setName: (v: string) => void;
  price: number;
  setPrice: (v: number) => void;
  description: string;
  setDescription: (v: string) => void;
  /** Private staff guidance about this item for the AI ordering assistant only
   *  (never shown to customers). */
  aiContext?: string;
  setAiContext?: (v: string) => void;
  /** Item-level serving size shown under the title when the item has no size
   *  options (e.g. "par personne"). Items WITH sizes derive their range from
   *  the per-size portions in the VariantsEditor instead. */
  portion: string;
  setPortion: (v: string) => void;
  categoryId: number;
  setCategoryId: (v: number) => void;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
  /** Per-item toggle for the guest "special instructions" field. Default true
   *  (shown). The control only renders when setAllowNotes is provided. */
  allowNotes?: boolean;
  setAllowNotes?: (v: boolean) => void;
  vatRate: number;
  categories: MenuCategory[];
  // Foody-specific: menu attachment (kept below the reference fields).
  menus: Menu[];
  /** menu_group IDs this item should be a member of. */
  selectedGroupIds: Set<number>;
  setSelectedGroupIds: (s: Set<number>) => void;
  itemType: ItemType;
  /** Request a type change. The parent decides whether to confirm or apply
   *  immediately (it owns the variant/recipe/modifier/step state that may
   *  be lost). */
  onTypeChange: (next: ItemType) => void;
  /** Optional: number of combo steps to show in the "go to Composition"
   *  callout. Only used when itemType === 'combo'. */
  comboStepsCount?: number;
  /** Optional: handler to navigate to the Composition tab from the Details
   *  tab callout. */
  onJumpToComposition?: () => void;
  /**
   * Restaurant's default content language. When omitted (e.g. on the
   * new-item page), the locale tab strip is not rendered and the editor
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
}

export default function MenuItemTabDetails({
  name, setName,
  price, setPrice,
  description, setDescription,
  aiContext, setAiContext,
  portion, setPortion,
  categoryId, setCategoryId,
  isActive, setIsActive,
  allowNotes = true, setAllowNotes,
  vatRate,
  categories,
  menus,
  selectedGroupIds,
  setSelectedGroupIds,
  itemType,
  onTypeChange,
  comboStepsCount = 0,
  onJumpToComposition,
  sourceLocale,
  translations,
  setTranslations,
  onRetranslate,
  hideBasePrice = false,
}: Props) {
  const { t } = useI18n();
  const [categoryOpen, setCategoryOpen] = useState(false);
  // Track which field is currently being re-translated so we can show a spinner
  // and disable the button. `'all'` covers the strip-level "Re-translate all"
  // action; individual field names cover the per-field links.
  const [retranslating, setRetranslating] = useState<null | 'all' | 'name' | 'description' | 'portion'>(null);
  const [retranslateError, setRetranslateError] = useState<string | null>(null);

  const runRetranslate = async (target: 'all' | 'name' | 'description' | 'portion') => {
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
  const activeCategory = categories.find((c) => c.id === categoryId);
  const isCombo = itemType === 'combo';

  const isSourceTab = !i18nEnabled || activeLocale === effectiveSource;
  const nameTranslation = translations?.name?.[activeLocale] ?? '';
  const descriptionTranslation = translations?.description?.[activeLocale] ?? '';
  const portionTranslation = translations?.portion?.[activeLocale] ?? '';

  const setTranslatedField = (field: 'name' | 'description' | 'portion', value: string) => {
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
  const sourceLooksHebrew = /[\u0590-\u05FF]/.test(`${name} ${description} ${portion}`);
  const localeMismatch = i18nEnabled && effectiveSource !== 'he' && sourceLooksHebrew;

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
    : (t('sellingPriceLabel') || 'Prix de vente');

  return (
    <div className="max-w-4xl">
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
      {/* Section head with 3px brand accent */}
      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
        <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabDetails')}</h3>
      </div>

      <div className="flex flex-col gap-[var(--s-5)]">
        {/* Type d'article — segmented picker */}
        <div className="flex flex-col gap-1.5">
          <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('itemType') || "Type d'article"}
          </span>
          <TypePickerCards value={itemType} onChange={onTypeChange} />
        </div>

        {/* Locale tab strip — switches name + description between source language
            and translation overrides. Other fields (price, category, etc.) are
            language-independent and only show on the source tab. */}
        {i18nEnabled && (
          <div className="flex items-center gap-[var(--s-3)] flex-wrap">
            <LocaleTabs
              locales={SUPPORTED_LOCALES}
              source={effectiveSource}
              active={activeLocale}
              onChange={setActiveLocale}
              missing={missing}
            />
            {onRetranslate && (
              <button
                type="button"
                onClick={() => runRetranslate('all')}
                disabled={retranslating !== null}
                className="inline-flex items-center gap-1.5 h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                title={t('languageRetranslateAll') || 'Re-translate all'}
              >
                <RefreshCw
                  className={`w-3 h-3 ${retranslating === 'all' ? 'animate-spin' : ''}`}
                  aria-hidden
                />
                <span>
                  {retranslating === 'all'
                    ? (t('languageRetranslateRunning') || 'Re-translating…')
                    : (t('languageRetranslateAll') || 'Re-translate all')}
                </span>
              </button>
            )}
            {!isSourceTab && (
              <span className="text-fs-xs text-[var(--fg-subtle)]">
                {t('languageEditingTranslation') ||
                  'Editing translation. Leave blank to use the auto-translation; what you type here overrides it.'}
              </span>
            )}
            {retranslateError && (
              <span className="text-fs-xs text-[var(--danger-500)]">{retranslateError}</span>
            )}
          </div>
        )}

        {/* Source-language mismatch warning — the item text is Hebrew but the
            restaurant's source language says otherwise, so auto-translations
            are pass-through garbage until the setting is corrected. */}
        {localeMismatch && (
          <div
            className="flex items-center gap-[var(--s-3)] rounded-r-lg border p-[var(--s-3)]"
            style={{
              background: 'color-mix(in oklab, var(--warning-500) 6%, var(--surface))',
              borderColor: 'color-mix(in oklab, var(--warning-500) 30%, var(--line))',
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
                  ? (t('languageEnglish') || 'English')
                  : (t('languageFrench') || 'French'),
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

        {/* Row 1 — Nom | Catégorie */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--s-4)]">
          <Field label={t('itemNameLabel') || "Nom de l'article"}>
            {isSourceTab ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('nameRequired') || 'Nom *'}
                autoFocus
              />
            ) : (
              <>
                <Input
                  value={nameTranslation}
                  onChange={(e) => setTranslatedField('name', e.target.value)}
                  placeholder={name || (t('nameRequired') || 'Nom *')}
                />
                <div className="flex items-center justify-between gap-[var(--s-3)] mt-1">
                  <div className="text-fs-xs text-[var(--fg-subtle)]">
                    {(t('languageSourceLabel') || 'Source') + ': '}
                    <span className="font-medium text-[var(--fg-muted)]">{name || '—'}</span>
                  </div>
                  {onRetranslate && (
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
                        ? (t('languageRetranslateRunning') || 'Re-translating…')
                        : (t('languageRetranslateField') || 'Re-translate this field')}
                    </button>
                  )}
                </div>
              </>
            )}
          </Field>

          <Field label={t('category') || 'Catégorie'}>
            <div className="relative">
              <button
                type="button"
                onClick={() => setCategoryOpen((v) => !v)}
                className="flex items-center justify-between w-full h-9 px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm hover:border-[var(--fg-subtle)] focus:outline-none focus:border-[var(--brand-500)] focus:shadow-ring transition-colors"
              >
                <span className={activeCategory ? 'text-[var(--fg)]' : 'text-[var(--fg-subtle)]'}>
                  {activeCategory?.name ?? (t('addToCategories') || 'Ajouter à une catégorie')}
                </span>
                <ChevronDown className="w-4 h-4 text-[var(--fg-muted)]" />
              </button>
              {categoryOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--surface)] border border-[var(--line)] rounded-r-md shadow-3 z-20 max-h-64 overflow-y-auto">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategoryId(cat.id);
                        setCategoryOpen(false);
                      }}
                      className={`w-full text-start px-[var(--s-3)] py-2 hover:bg-[var(--surface-2)] transition-colors text-fs-sm ${
                        cat.id === categoryId
                          ? 'text-[var(--brand-500)] font-medium'
                          : 'text-[var(--fg)]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </div>

        {/* Row 2 — Prix | TVA | Statut */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-4)]">
          <Field
            label={priceLabel}
            hint={isCombo ? t('composeBasePriceHint') : undefined}
          >
            {hideBasePrice ? (
              // Sizes own the price — show a read-only hint pointing at the
              // size rows below instead of a second editable price field.
              <div className="flex items-center h-9 px-[var(--s-3)] rounded-r-md border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)]/40 text-fs-xs text-[var(--fg-muted)]">
                {t('priceFromSizes') || 'Le prix est défini par les tailles ci-dessous.'}
              </div>
            ) : (
              <div className="relative">
                <NumberField
                  min={0}
                  value={price}
                  onChange={setPrice}
                  placeholder="0.00"
                  className="pr-8 font-mono"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                  ₪
                </span>
              </div>
            )}
          </Field>

          <Field label={t('vat') || 'TVA'}>
            <div className="relative">
              <Input
                type="text"
                value={`${vatRate}`}
                readOnly
                className="pr-8 cursor-not-allowed font-mono"
                title={`${t('vat')} — ${vatRate}%`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                %
              </span>
            </div>
          </Field>

          <Field label={t('status') || 'Statut'}>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className="flex items-center gap-[var(--s-2)] h-9 text-start"
              aria-pressed={isActive}
            >
              <span
                className="relative inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: isActive ? 'var(--success-500)' : 'var(--fg-subtle)' }}
              >
                {isActive && (
                  <span
                    className="absolute inset-0 rounded-full opacity-60 animate-ping"
                    style={{ background: 'var(--success-500)' }}
                  />
                )}
              </span>
              <span className="text-fs-sm font-medium text-[var(--fg)]">
                {isActive ? (t('active') || 'Actif') : (t('unavailable') || 'Indisponible')}
              </span>
            </button>
          </Field>
        </div>

        {/* Per-item "special instructions" (notes) toggle — guest web only.
            Default is on; turn off to hide the note field for this item. */}
        {setAllowNotes && (
          <Field label={t('itemNotesFieldLabel') || 'Special instructions field'}>
            <button
              type="button"
              onClick={() => setAllowNotes(!allowNotes)}
              className="flex items-center gap-[var(--s-2)] h-9 text-start"
              aria-pressed={allowNotes}
            >
              <span
                className="relative inline-block w-2 h-2 rounded-full shrink-0"
                style={{ background: allowNotes ? 'var(--success-500)' : 'var(--fg-subtle)' }}
              />
              <span className="text-fs-sm font-medium text-[var(--fg)]">
                {allowNotes ? (t('itemNotesOn') || 'On') : (t('itemNotesOff') || 'Off')}
              </span>
            </button>
            <p className="mt-1 text-fs-xs text-[var(--fg-muted)]">
              {allowNotes
                ? (t('itemNotesFieldHelpOn') || 'Guests can add a note to this item')
                : (t('itemNotesFieldHelpOff') || 'Hidden for this item')}
            </p>
          </Field>
        )}

        {/* Description */}
        <Field label={t('description') || 'Description'}>
          {isSourceTab ? (
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('addDescription') || 'Ajouter une description'}
              rows={4}
            />
          ) : (
            <>
              <Textarea
                value={descriptionTranslation}
                onChange={(e) => setTranslatedField('description', e.target.value)}
                placeholder={description || (t('addDescription') || 'Ajouter une description')}
                rows={4}
              />
              <div className="flex items-center justify-between gap-[var(--s-3)] mt-1">
                <div className="text-fs-xs text-[var(--fg-subtle)]">
                  {(t('languageSourceLabel') || 'Source') + ': '}
                  <span className="text-[var(--fg-muted)]">{description || '—'}</span>
                </div>
                {onRetranslate && (
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
                      ? (t('languageRetranslateRunning') || 'Re-translating…')
                      : (t('languageRetranslateField') || 'Re-translate this field')}
                  </button>
                )}
              </div>
            </>
          )}
        </Field>

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

        {/* Portion / serving size — shown under the item title in guest apps.
            Used when the item has no size options; items WITH sizes derive the
            range from the per-size portions in the VariantsEditor below. */}
        <Field
          label={t('portion') || 'Portion'}
          hint={t('portionHint') || 'Affichée sous le titre côté client. Pour les articles sans tailles (ex. « par personne »).'}
        >
          {isSourceTab ? (
            <Input
              value={portion}
              onChange={(e) => setPortion(e.target.value)}
              placeholder={t('portionPlaceholder') || 'ex. par personne'}
            />
          ) : (
            <>
              <Input
                value={portionTranslation}
                onChange={(e) => setTranslatedField('portion', e.target.value)}
                placeholder={portion || (t('portionPlaceholder') || 'ex. par personne')}
              />
              <div className="flex items-center justify-between gap-[var(--s-3)] mt-1">
                <div className="text-fs-xs text-[var(--fg-subtle)]">
                  {(t('languageSourceLabel') || 'Source') + ': '}
                  <span className="text-[var(--fg-muted)]">{portion || '—'}</span>
                </div>
                {onRetranslate && (
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
                      ? (t('languageRetranslateRunning') || 'Re-translating…')
                      : (t('languageRetranslateField') || 'Re-translate this field')}
                  </button>
                )}
              </div>
            </>
          )}
        </Field>

        {/* Menus / Cartes — foody-specific; below reference fields. The picker
            lets the owner choose exact groups (not just menus) so that items
            don't silently land in whichever group happens to be first. */}
        <Field label={t('menus') || 'Cartes'} hint={t('cartesPickHint') || 'Où cet article apparaît côté client.'}>
          <MenuGroupPicker
            menus={menus}
            selectedGroupIds={selectedGroupIds}
            onChange={setSelectedGroupIds}
            placeholder={t('addToMenus') || 'Ajouter à des cartes'}
            emptyLabel={t('noMenusAvailable') || 'Aucune carte disponible'}
            noGroupsHint={t('noGroupsInMenu') || 'Aucun groupe dans cette carte'}
          />
        </Field>

        {/* Combo-only callout — link to Composition tab. */}
        {isCombo && onJumpToComposition && (
          <button
            type="button"
            onClick={onJumpToComposition}
            className="flex items-center gap-[var(--s-3)] text-start rounded-r-lg border p-[var(--s-4)] transition-colors hover:bg-[color-mix(in_oklab,var(--brand-500)_6%,transparent)]"
            style={{
              background: 'color-mix(in oklab, var(--brand-500) 4%, var(--surface))',
              borderColor: 'color-mix(in oklab, var(--brand-500) 22%, var(--line))',
            }}
          >
            <div
              className="w-10 h-10 rounded-r-md grid place-items-center shrink-0"
              style={{
                background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                color: 'var(--brand-500)',
              }}
            >
              <Boxes className="w-[18px] h-[18px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-fs-sm font-semibold">{t('composeDetailsCalloutTitle')}</div>
              <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                {comboStepsCount === 0
                  ? t('composeNoStepsCallout')
                  : comboStepsCount === 1
                    ? t('composeStepsConfiguredOne')
                    : t('composeStepsConfigured').replace('{n}', String(comboStepsCount))
                }
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-fs-sm font-medium text-[var(--brand-500)]">
              {t('composeConfigureCta').replace('→', '')} <ArrowRight className="w-4 h-4" />
            </span>
          </button>
        )}
      </div>
      </section>
    </div>
  );
}
