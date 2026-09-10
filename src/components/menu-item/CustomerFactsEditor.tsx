'use client';

import { AlertTriangle, BookOpen, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ds';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';
import type { MenuItemCustomerFacts } from '@/lib/api';

const ALLERGENS = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
  'tree_nuts', 'celery', 'mustard', 'sesame', 'sulfites', 'lupin', 'molluscs',
] as const;

const DIETARY_TAGS = [
  'vegetarian', 'vegan', 'gluten_free', 'dairy_free', 'spicy',
] as const;

interface Props {
  value: MenuItemCustomerFacts;
  onChange: (value: MenuItemCustomerFacts) => void;
  disabled?: boolean;
  suggestedIngredients?: string[];
}

export default function CustomerFactsEditor({
  value,
  onChange,
  disabled = false,
  suggestedIngredients = [],
}: Props) {
  const { t } = useI18n();

  const updateIngredient = (index: number, patch: { name?: string; removable?: boolean }) => {
    onChange({
      ...value,
      ingredients: value.ingredients.map((ingredient, i) =>
        i === index ? { ...ingredient, ...patch } : ingredient,
      ),
    });
  };

  const removeIngredient = (index: number) => {
    onChange({
      ...value,
      ingredients: value.ingredients.filter((_, i) => i !== index),
      complete: false,
    });
  };

  const addIngredient = () => {
    onChange({
      ...value,
      ingredients: [...value.ingredients, { name: '', removable: false }],
      complete: false,
    });
  };

  const importRecipeIngredients = () => {
    const existing = new Set(value.ingredients.map((ingredient) => ingredient.name.trim().toLocaleLowerCase()));
    const additions: MenuItemCustomerFacts['ingredients'] = [];
    for (const rawName of suggestedIngredients) {
      const name = rawName.trim();
      const key = name.toLocaleLowerCase();
      if (!name || existing.has(key)) continue;
      existing.add(key);
      additions.push({ name, removable: false });
    }
    if (additions.length === 0) return;
    onChange({
      ...value,
      ingredients: [...value.ingredients, ...additions],
      complete: false,
    });
  };

  const hasRecipeSuggestions = suggestedIngredients.some((name) =>
    name.trim() && !value.ingredients.some(
      (ingredient) => ingredient.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
    ),
  );

  const toggleValue = (field: 'allergens' | 'may_contain' | 'dietary_tags', key: string) => {
    const selected = value[field].includes(key);
    onChange({
      ...value,
      [field]: selected ? value[field].filter((item) => item !== key) : [...value[field], key],
      complete: field === 'dietary_tags' ? value.complete : false,
    });
  };

  return (
    <section className="max-w-4xl overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-start gap-[var(--s-3)] border-b border-[var(--line)] px-[var(--s-5)] py-[var(--s-4)]">
        <span className="mt-0.5 h-6 w-[3px] shrink-0 rounded-e-md bg-[var(--brand-500)]" />
        <div>
          <h3 className="text-fs-xl font-semibold text-[var(--fg)]">
            {t('customerFactsTitle')}
          </h3>
          <p className="mt-1 max-w-2xl text-fs-xs leading-relaxed text-[var(--fg-muted)]">
            {t('customerFactsHint')}
          </p>
        </div>
      </div>

      <div className="space-y-[var(--s-6)] p-[var(--s-5)]">
        <div>
          <div className="mb-[var(--s-3)] flex items-center justify-between gap-[var(--s-3)]">
            <div>
              <h4 className="text-fs-sm font-semibold text-[var(--fg)]">{t('customerIngredients')}</h4>
              <p className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">{t('customerIngredientsHint')}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {suggestedIngredients.length > 0 && (
                <button
                  type="button"
                  onClick={importRecipeIngredients}
                  disabled={disabled || !hasRecipeSuggestions}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--line)] px-3 text-fs-xs font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  {t('customerImportRecipe')}
                </button>
              )}
              <button
                type="button"
                onClick={addIngredient}
                disabled={disabled}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--line)] px-3 text-fs-xs font-medium text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t('customerAddIngredient')}
              </button>
            </div>
          </div>

          {value.ingredients.length === 0 ? (
            <button
              type="button"
              onClick={addIngredient}
              disabled={disabled}
              className="flex min-h-20 w-full items-center justify-center rounded-md border border-dashed border-[var(--line)] px-4 text-fs-sm text-[var(--fg-muted)] hover:border-[var(--brand-500)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('customerIngredientsEmpty')}
            </button>
          ) : (
            <div className="space-y-2">
              {value.ingredients.map((ingredient, index) => (
                <div key={index} className="flex min-h-11 items-center gap-3 rounded-md bg-[var(--surface-2)] px-3 py-2">
                  <Input
                    value={ingredient.name}
                    onChange={(event) => updateIngredient(index, { name: event.target.value })}
                    placeholder={t('customerIngredientPlaceholder')}
                    maxLength={120}
                    disabled={disabled}
                    className="min-w-0 flex-1 bg-transparent"
                  />
                  <label className="flex shrink-0 items-center gap-2 text-fs-xs text-[var(--fg-muted)]">
                    <Switch
                      checked={ingredient.removable}
                      onCheckedChange={(checked) => updateIngredient(index, { removable: checked })}
                      disabled={disabled}
                      aria-label={t('customerRemovable')}
                    />
                    {t('customerRemovable')}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeIngredient(index)}
                    disabled={disabled}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-[var(--fg-muted)] hover:bg-[var(--danger-50)] hover:text-[var(--danger-500)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t('delete')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <FactPicker
          title={t('customerAllergens')}
          hint={t('customerAllergensHint')}
          values={ALLERGENS}
          selected={value.allergens}
          onToggle={(key) => toggleValue('allergens', key)}
          labelFor={(key) => t(`allergen_${key}`)}
          disabled={disabled}
          warning
        />

        <details className="group rounded-md border border-[var(--line)] px-4 py-3">
          <summary className="cursor-pointer select-none text-fs-sm font-medium text-[var(--fg)]">
            {t('customerMayContain')}
          </summary>
          <div className="pt-3">
            <p className="mb-3 text-fs-xs text-[var(--fg-muted)]">{t('customerMayContainHint')}</p>
            <FactPicker
              values={ALLERGENS}
              selected={value.may_contain}
              onToggle={(key) => toggleValue('may_contain', key)}
              labelFor={(key) => t(`allergen_${key}`)}
              disabled={disabled}
              compact
            />
          </div>
        </details>

        <FactPicker
          title={t('customerDietaryTags')}
          hint={t('customerDietaryTagsHint')}
          values={DIETARY_TAGS}
          selected={value.dietary_tags}
          onToggle={(key) => toggleValue('dietary_tags', key)}
          labelFor={(key) => t(`dietary_${key}`)}
          disabled={disabled}
        />

        <div className={`flex items-start justify-between gap-4 rounded-md border p-4 ${
          value.complete
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}>
          <div className="flex min-w-0 gap-3">
            {value.complete ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" aria-hidden />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
            )}
            <div>
              <div className="text-fs-sm font-semibold text-[var(--fg)]">
                {value.complete ? t('customerFactsComplete') : t('customerFactsIncomplete')}
              </div>
              <p className="mt-1 text-fs-xs leading-relaxed text-[var(--fg-muted)]">
                {value.complete ? t('customerFactsCompleteHint') : t('customerFactsIncompleteHint')}
              </p>
            </div>
          </div>
          <Switch
            checked={value.complete}
            onCheckedChange={(complete) => onChange({ ...value, complete })}
            disabled={disabled || value.ingredients.some((ingredient) => !ingredient.name.trim())}
            aria-label={t('customerFactsMarkComplete')}
          />
        </div>
      </div>
    </section>
  );
}

function FactPicker<T extends string>({
  title,
  hint,
  values,
  selected,
  onToggle,
  labelFor,
  disabled = false,
  warning = false,
  compact = false,
}: {
  title?: string;
  hint?: string;
  values: readonly T[];
  selected: string[];
  onToggle: (value: T) => void;
  labelFor: (value: T) => string;
  disabled?: boolean;
  warning?: boolean;
  compact?: boolean;
}) {
  return (
    <div>
      {title && <h4 className="text-fs-sm font-semibold text-[var(--fg)]">{title}</h4>}
      {hint && <p className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">{hint}</p>}
      <div className={`${compact || !title ? '' : 'mt-3'} flex flex-wrap gap-2`}>
        {values.map((value) => {
          const active = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onToggle(value)}
              className={`min-h-9 rounded-full border px-3 text-fs-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? warning
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    : 'border-[var(--brand-500)] bg-[var(--brand-500)]/10 text-[var(--fg)]'
                  : 'border-[var(--line)] bg-transparent text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]'
              }`}
            >
              {labelFor(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
