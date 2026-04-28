'use client';

// Top-level Composition tab content for combo items.
//
// Owns nothing persistent — pure prop-down. The host page passes:
//   • the current draft steps + base price
//   • the catalog (categories) for the picker
//   • change handlers for each
//
// Renders: section heading, PricingCard, list of StepCards with reordering,
// "+ Nouvelle étape" CTA, CustomerOutcomePreview, and any validation errors.

import { Plus, AlertCircle } from 'lucide-react';
import { useMemo } from 'react';
import type { MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { ComboStepDraft } from './types';
import StepCard from './StepCard';
import PricingCard from './PricingCard';
import CustomerOutcomePreview from './CustomerOutcomePreview';
import { validateCombo } from './validation';
import type { PricingMode } from './pricing';

interface Props {
  comboName: string;
  basePrice: string;
  onBasePriceChange: (next: string) => void;
  steps: ComboStepDraft[];
  onStepsChange: (next: ComboStepDraft[]) => void;
  categories: MenuCategory[];
  pricingMode?: PricingMode;
  onPricingModeChange?: (next: PricingMode) => void;
  /** Forwarded to the PricingCard's savings cell — host opens the breakdown
   *  modal. */
  onShowSavingsDetail?: () => void;
}

export default function CompositionTab({
  comboName, basePrice, onBasePriceChange,
  steps, onStepsChange,
  categories,
  pricingMode = 'fixed', onPricingModeChange,
  onShowSavingsDetail,
}: Props) {
  const { t } = useI18n();

  // Flat lookup of all items, keyed by id, for the picker / view-model layer.
  const itemsById = useMemo(() => {
    const m = new Map<number, MenuItem>();
    for (const cat of categories) {
      for (const it of cat.items ?? []) m.set(it.id, it);
    }
    return m;
  }, [categories]);

  const baseNum = parseFloat(basePrice) || 0;

  const errors = useMemo(
    () => validateCombo(steps, itemsById, {
      noSteps: t('comboValidNoSteps'),
      stepNoOptions: (n) => t('comboValidStepNoOptions').replace('{name}', n),
      stepRange: (n) => t('comboValidStepRange').replace('{name}', n),
      stepNoVariants: (n, item) =>
        t('comboValidStepNoVariantsIncluded').replace('{name}', n).replace('{item}', item),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, itemsById],
  );

  const updateStep = (key: string, next: ComboStepDraft) => {
    onStepsChange(steps.map((s) => (s.key === key ? next : s)));
  };

  const removeStep = (key: string) => {
    onStepsChange(steps.filter((s) => s.key !== key));
  };

  const addStep = () => {
    const fresh: ComboStepDraft = {
      key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `step-${Date.now()}`,
      name: t('composeStepDefaultName').replace('{n}', String(steps.length + 1)),
      min_picks: 1,
      max_picks: 1,
      items: [],
    };
    onStepsChange([...steps, fresh]);
  };

  return (
    <div className="max-w-5xl flex flex-col gap-[var(--s-5)]">
      {/* Section head with brand accent */}
      <div className="flex items-center gap-[var(--s-3)]">
        <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
        <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('composeStepsHeader')}</h3>
      </div>
      <p className="text-fs-sm text-[var(--fg-muted)] -mt-3">{t('composeIntro')}</p>

      <PricingCard
        basePrice={basePrice}
        onBasePriceChange={onBasePriceChange}
        steps={steps}
        itemsById={itemsById}
        pricingMode={pricingMode}
        onPricingModeChange={onPricingModeChange ?? (() => {})}
        onShowSavingsDetail={onShowSavingsDetail}
      />

      {/* Steps */}
      <div className="flex flex-col gap-[var(--s-3)]">
        {steps.map((step, i) => (
          <StepCard
            key={step.key}
            step={step}
            index={i}
            basePrice={baseNum}
            categories={categories}
            itemsById={itemsById}
            onChange={(next) => updateStep(step.key, next)}
            onRemove={() => removeStep(step.key)}
          />
        ))}

        {/* Add step CTA */}
        <button
          type="button"
          onClick={addStep}
          className="w-full py-[var(--s-4)] rounded-r-lg border border-dashed border-[var(--line-strong)] text-fs-sm font-medium text-[var(--fg-muted)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_4%,transparent)] transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> {t('composeNewStep')}
        </button>
      </div>

      {/* Validation errors — surfaced inline at the bottom of the tab */}
      {errors.length > 0 && (
        <div
          className="rounded-r-md p-[var(--s-3)] border"
          style={{
            background: 'color-mix(in oklab, var(--danger-500) 8%, transparent)',
            borderColor: 'color-mix(in oklab, var(--danger-500) 30%, transparent)',
            color: 'var(--danger-500)',
          }}
        >
          <div className="flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <ul className="m-0 ps-[var(--s-4)] text-fs-sm leading-[1.6] list-disc">
              {errors.map((e, i) => <li key={i}>{e.message}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Customer-facing preview */}
      <CustomerOutcomePreview
        comboName={comboName}
        basePrice={baseNum}
        steps={steps}
        itemsById={itemsById}
      />
    </div>
  );
}
