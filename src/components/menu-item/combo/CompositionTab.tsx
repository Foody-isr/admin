'use client';

// Two-pane combo composer (Design B):
//   • Left pane (CarteCatalog) — carte selector + browsable category tree.
//                                 Adds items / categories to the *active* step.
//   • Right pane              — the combo's steps as cards. Clicking a step
//                                makes it active. New empty step picks up the
//                                next add automatically.
//
// One unified step type — there is no Fixed/Step toggle. Every row is just a
// step with items and min/max rules. "Always include X" is encoded as a step
// with min=max=items.length (the foodyweb modal still auto-detects this
// shape via isFixedComboShape and renders the customer flow accordingly).

import { Plus, AlertCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Menu, MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { ComboStepDraft, ComboStepDraftItem } from './types';
import StepCard from './StepCard';
import PricingCard from './PricingCard';
import CarteCatalog from './CarteCatalog';
import CustomerOutcomePreview from './CustomerOutcomePreview';
import { validateCombo } from './validation';
import { buildAnyCarteItemIdSet } from './webCarte';
import { useComboStepPreviews } from './useComboStepPreviews';

interface Props {
  comboName: string;
  basePrice: number;
  onBasePriceChange: (next: number) => void;
  steps: ComboStepDraft[];
  onStepsChange: (next: ComboStepDraft[]) => void;
  categories: MenuCategory[];
  menus: Menu[];
  restaurantId: number;
  onShowSavingsDetail?: () => void;
}

export default function CompositionTab({
  comboName, basePrice, onBasePriceChange,
  steps, onStepsChange,
  categories,
  menus,
  restaurantId,
  onShowSavingsDetail,
}: Props) {
  const { t } = useI18n();

  // Server-resolved preview per dynamic step — the authoritative "available to
  // customer" set, replacing the old client-side estimate that ignored the
  // carte date window.
  const stepPreviews = useComboStepPreviews(restaurantId, steps);

  const itemsById = useMemo(() => {
    const m = new Map<number, MenuItem>();
    for (const cat of categories) {
      for (const it of cat.items ?? []) m.set(it.id, it);
    }
    return m;
  }, [categories]);

  const anyCarteItemIds = useMemo(() => buildAnyCarteItemIdSet(menus), [menus]);

  const errors = useMemo(
    () => validateCombo(steps, itemsById, {
      noSteps: t('comboValidNoSteps'),
      stepNoOptions: (n) => t('comboValidStepNoOptions').replace('{name}', n),
      stepRange: (n) => t('comboValidStepRange').replace('{name}', n),
      stepNoVariants: (n, item) =>
        t('comboValidStepNoVariantsIncluded').replace('{name}', n).replace('{item}', item),
      stepNoCategory: (n) => t('comboValidStepNoCategory').replace('{name}', n),
      stepNoGroup: (n) => t('comboValidStepNoGroup').replace('{name}', n),
      stepSizeNoMatch: (n, size) =>
        t('comboValidStepSizeNoMatch').replace('{name}', n).replace('{size}', size),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, itemsById],
  );

  // Active step — the one the catalog's clicks target. Null on load (no
  // step opened by default — the operator opens the one they want to edit).
  // Stays in sync with steps[] so a deleted step's key doesn't dangle.
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);
  const effectiveActiveKey =
    activeStepKey && steps.some((s) => s.key === activeStepKey) ? activeStepKey : null;
  const activeStep =
    steps.find((s) => s.key === effectiveActiveKey) ?? null;

  const updateStep = (key: string, next: ComboStepDraft) => {
    onStepsChange(steps.map((s) => (s.key === key ? next : s)));
  };

  const removeStep = (key: string) => {
    onStepsChange(steps.filter((s) => s.key !== key));
    if (activeStepKey === key) setActiveStepKey(null);
  };

  const freshStep = (): ComboStepDraft => ({
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `step-${Date.now()}`,
    name: t('composeStepDefaultName').replace('{n}', String(steps.length + 1)),
    description: '',
    min_picks: 1,
    max_picks: 1,
    items: [],
    source_type: 'explicit',
  });

  const addStep = () => {
    const fresh = freshStep();
    onStepsChange([...steps, fresh]);
    setActiveStepKey(fresh.key);
  };

  const ensureActiveStep = (): ComboStepDraft => {
    if (activeStep) return activeStep;
    const fresh = freshStep();
    onStepsChange([...steps, fresh]);
    setActiveStepKey(fresh.key);
    return fresh;
  };

  // ── Catalog actions ───────────────────────────────────────────────────

  const handleAddItem = (menuItemId: number) => {
    const target = ensureActiveStep();
    // If the active step is currently in a dynamic mode (category/group),
    // adding an explicit item switches it to explicit mode (mixing the two has
    // no coherent server semantic). Otherwise just append.
    if (target.source_type === 'category' || target.source_type === 'group') {
      updateStep(target.key, {
        ...target,
        source_type: 'explicit',
        source_category_id: undefined,
        source_group_id: undefined,
        source_variant_label: undefined,
        items: [{ menu_item_id: menuItemId, price_delta: 0, pick_key: `item:${menuItemId}` }],
      });
      return;
    }
    if (target.items.some((it) => it.menu_item_id === menuItemId)) return;
    updateStep(target.key, {
      ...target,
      items: [
        ...target.items,
        { menu_item_id: menuItemId, price_delta: 0, pick_key: `item:${menuItemId}` },
      ],
    });
  };

  const handleRemoveItem = (menuItemId: number) => {
    if (!activeStep) return;
    updateStep(activeStep.key, {
      ...activeStep,
      items: activeStep.items.filter((it) => it.menu_item_id !== menuItemId),
    });
  };

  const handleSetCategory = (categoryId: number) => {
    // Active step in explicit mode → "tout ajouter" means "bulk-import these
    // items as individual entries, stay in Liste manuelle". Skip items
    // already present so repeated clicks are idempotent.
    if (activeStep && activeStep.source_type === 'explicit') {
      const cat = categories.find((c) => c.id === categoryId);
      if (!cat) return;
      const existing = new Set(activeStep.items.map((it) => it.menu_item_id));
      const additions: ComboStepDraftItem[] = [];
      for (const it of cat.items ?? []) {
        if (!existing.has(it.id)) {
          additions.push({ menu_item_id: it.id, price_delta: 0, pick_key: `item:${it.id}` });
        }
      }
      if (additions.length === 0) return;
      updateStep(activeStep.key, { ...activeStep, items: [...activeStep.items, ...additions] });
      return;
    }
    // Otherwise (no active step, or active step already in category mode) →
    // bind to a dynamic category. ensureActiveStep makes a fresh explicit
    // step that we immediately convert — fine since the operator's click on
    // "tout ajouter" on a category header signals category-mode intent.
    const target = ensureActiveStep();
    updateStep(target.key, {
      ...target,
      source_type: 'category',
      source_category_id: categoryId,
      source_variant_label: undefined,
      items: [],
    });
  };

  return (
    <div className="flex flex-col gap-[var(--s-5)]">
      {/* Section head + pricing — full-width above the two-pane composer. */}
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

      {/* Two-pane composer — catalog left, steps right. The catalog is
          sticky to the viewport so it stays in view no matter how many
          steps the operator adds. Right pane scrolls naturally with the
          page; the catalog scrolls internally within its sticky frame.
          `items-start` is required for sticky to engage in a grid (without
          it the grid item stretches to the row height and never sticks). */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-[var(--s-4)] items-start">
        <aside
          className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-3)] flex flex-col lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] min-h-0"
        >
          <CarteCatalog
            menus={menus}
            categories={categories}
            itemsById={itemsById}
            activeStep={activeStep}
            anyCarteItemIds={anyCarteItemIds}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onSetCategory={handleSetCategory}
          />
        </aside>

        <section className="flex flex-col gap-[var(--s-3)] min-w-0">
          {steps.length === 0 && (
            <div className="rounded-r-lg border border-dashed border-[var(--line-strong)] p-[var(--s-5)] text-center text-fs-sm text-[var(--fg-muted)]">
              {t('composeEmptyHint')}
            </div>
          )}

          {steps.map((step, i) => {
            const isActive = step.key === effectiveActiveKey;
            return (
              <StepCard
                key={step.key}
                step={step}
                index={i}
                basePrice={basePrice}
                categories={categories}
                menus={menus}
                itemsById={itemsById}
                anyCarteItemIds={anyCarteItemIds}
                preview={stepPreviews.get(step.key)}
                isActive={isActive}
                onActivate={() => setActiveStepKey(isActive ? null : step.key)}
                onChange={(next) => updateStep(step.key, next)}
                onRemove={() => removeStep(step.key)}
              />
            );
          })}

          <button
            type="button"
            onClick={addStep}
            className="py-[var(--s-4)] rounded-r-lg border border-dashed border-[var(--line-strong)] text-fs-sm font-medium text-[var(--fg-muted)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_4%,transparent)] transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> {t('composeNewStep')}
          </button>
        </section>
      </div>

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

      <CustomerOutcomePreview
        comboName={comboName}
        basePrice={basePrice}
        steps={steps}
        itemsById={itemsById}
      />
    </div>
  );
}
