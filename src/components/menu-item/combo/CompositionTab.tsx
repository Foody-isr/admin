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
import type { Menu, MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { ComboStepDraft } from './types';
import { effectiveStepKind } from './types';
import StepCard from './StepCard';
import PricingCard from './PricingCard';
import CustomerOutcomePreview from './CustomerOutcomePreview';
import { validateCombo } from './validation';
import { buildWebItemIdSet, buildAnyCarteItemIdSet } from './webCarte';

interface Props {
  comboName: string;
  basePrice: number;
  onBasePriceChange: (next: number) => void;
  steps: ComboStepDraft[];
  onStepsChange: (next: ComboStepDraft[]) => void;
  categories: MenuCategory[];
  /** Available cartes — forwarded into the step picker so the operator can
   *  scope the catalog to a single menu while composing the combo. */
  menus: Menu[];
  /** Forwarded to the PricingCard's savings cell — host opens the breakdown
   *  modal. */
  onShowSavingsDetail?: () => void;
}

export default function CompositionTab({
  comboName, basePrice, onBasePriceChange,
  steps, onStepsChange,
  categories,
  menus,
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

  // Web-orderable item IDs across every menu. Drives the per-step
  // "won't show to web guests" amber summary below each StepCard.
  const webItemIds = useMemo(() => buildWebItemIdSet(menus), [menus]);

  // Items reachable through any non-hidden group on any carte, either channel.
  // Drives the category-step preview's "not on any carte" zone — items that
  // wouldn't resolve at order time because they aren't on any carte at all.
  const anyCarteItemIds = useMemo(() => buildAnyCarteItemIdSet(menus), [menus]);


  const errors = useMemo(
    () => validateCombo(steps, itemsById, {
      noSteps: t('comboValidNoSteps'),
      stepNoOptions: (n) => t('comboValidStepNoOptions').replace('{name}', n),
      stepRange: (n) => t('comboValidStepRange').replace('{name}', n),
      stepNoVariants: (n, item) =>
        t('comboValidStepNoVariantsIncluded').replace('{name}', n).replace('{item}', item),
      stepNoCategory: (n) => t('comboValidStepNoCategory').replace('{name}', n),
      stepSizeNoMatch: (n, size) =>
        t('comboValidStepSizeNoMatch').replace('{name}', n).replace('{size}', size),
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
    const choiceCount = steps.filter((s) => s.kind !== 'fixed').length;
    const fresh: ComboStepDraft = {
      key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `step-${Date.now()}`,
      name: t('composeStepDefaultName').replace('{n}', String(choiceCount + 1)),
      description: '',
      min_picks: 1,
      max_picks: 1,
      items: [],
      source_type: 'explicit',
      kind: 'choice',
    };
    onStepsChange([...steps, fresh]);
  };

  // Fixed item = a step whose contents are pre-defined and the customer makes
  // no choice. Encoded as a single-item step with min_picks === max_picks. The
  // foodyweb modal auto-detects when every step matches this shape and renders
  // a "What's included" preview instead of the stepper.
  const addFixedItem = () => {
    const fixedCount = steps.filter((s) => s.kind === 'fixed').length;
    const fresh: ComboStepDraft = {
      key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `fixed-${Date.now()}`,
      name: t('composeFixedItemDefaultName').replace('{n}', String(fixedCount + 1)),
      description: '',
      min_picks: 1,
      max_picks: 1,
      items: [],
      source_type: 'explicit',
      kind: 'fixed',
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
        onShowSavingsDetail={onShowSavingsDetail}
      />

      {/* Steps. Choice-step indices restart at 0 because the numbered circle
          encodes the customer's pick sequence — fixed items aren't part of
          that flow (they're just "what's included") and render with a pin
          glyph instead of a number, so they're skipped when numbering. */}
      <div className="flex flex-col gap-[var(--s-3)]">
        {(() => {
          let choiceIdx = 0;
          return steps.map((step) => {
            const displayIndex = effectiveStepKind(step) === 'fixed' ? 0 : choiceIdx++;
            return (
              <StepCard
                key={step.key}
                step={step}
                index={displayIndex}
                basePrice={basePrice}
                categories={categories}
                itemsById={itemsById}
                menus={menus}
                webItemIds={webItemIds}
                anyCarteItemIds={anyCarteItemIds}
                onChange={(next) => updateStep(step.key, next)}
                onRemove={() => removeStep(step.key)}
              />
            );
          });
        })()}

        {/* Add CTAs — "New step" for choices, "Fixed item" for pre-defined contents. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s-3)]">
          <button
            type="button"
            onClick={addStep}
            className="py-[var(--s-4)] rounded-r-lg border border-dashed border-[var(--line-strong)] text-fs-sm font-medium text-[var(--fg-muted)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_4%,transparent)] transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> {t('composeNewStep')}
          </button>
          <button
            type="button"
            onClick={addFixedItem}
            title={t('composeAddFixedItemHint')}
            className="py-[var(--s-4)] rounded-r-lg border border-dashed border-[var(--line-strong)] text-fs-sm font-medium text-[var(--fg-muted)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_4%,transparent)] transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> {t('composeAddFixedItem')}
          </button>
        </div>
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
        basePrice={basePrice}
        steps={steps}
        itemsById={itemsById}
      />
    </div>
  );
}
