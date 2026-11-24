'use client';

import { Plus, AlertCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Menu, MenuCategory, MenuItem } from '@/lib/api';
import { comboItemSizes, matchesComboSize } from '@/lib/combo-size';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import type { ComboStepDraft } from './types';
import StepCard from './StepCard';
import PricingCard from './PricingCard';
import ComboSavingsBreakdownModal from './ComboSavingsBreakdownModal';
import { computeComboSavingsBreakdown } from './pricing';
import CarteCatalog from './CarteCatalog';
import CustomerOutcomePreview from './CustomerOutcomePreview';
import { validateCombo } from './validation';
import { buildAnyCarteItemIdSet } from './webCarte';
import { useComboStepPreviews } from './useComboStepPreviews';
import { Button, ConfirmDialog } from '@/components/ds';
import { Switch } from '@/components/ui/switch';

interface Props {
  comboName: string;
  basePrice: number;
  steps: ComboStepDraft[];
  onStepsChange: (next: ComboStepDraft[]) => void;
  categories: MenuCategory[];
  menus: Menu[];
  restaurantId: number;
  comboAllowQuantity: boolean;
  onComboAllowQuantityChange: (next: boolean) => void;
}

/** Compose explicit or group-based choices while preserving the existing price rules. */
export default function CompositionTab({
  comboName, basePrice,
  steps, onStepsChange,
  categories,
  menus,
  restaurantId,
  comboAllowQuantity,
  onComboAllowQuantityChange,
}: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  // Server-resolved preview per dynamic step — the authoritative "available to
  // customer" set, replacing the old client-side estimate that ignored the
  // carte date window.
  const resolvedPreviews = useComboStepPreviews(restaurantId, steps);

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
      stepNoGroup: (n) => t('comboValidStepNoGroup').replace('{name}', n),
    }),
    [steps, itemsById, t],
  );

  const [removingStep, setRemovingStep] = useState<ComboStepDraft | null>(null);
  const [activeStepKey, setActiveStepKey] = useState<string | null>(null);
  const [showSavingsDetail, setShowSavingsDetail] = useState(false);

  const updateStep = (key: string, next: ComboStepDraft) => {
    if (!canEdit) return;
    onStepsChange(steps.map(step => step.key === key ? next : step));
  };

  const moveStep = (from: number, to: number) => {
    if (!canEdit) return;
    const reordered = [...steps];
    [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
    onStepsChange(reordered);
  };

  const removeStep = (key: string) => {
    if (!canEdit) return;
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
    if (!canEdit) return;
    const fresh = freshStep();
    onStepsChange([...steps, fresh]);
    setActiveStepKey(fresh.key);
  };

  const addItems = (step: ComboStepDraft, itemIds: number[]) => {
    const existing = new Set(step.items.map(item => item.menu_item_id));
    const additions = itemIds.filter(id => !existing.has(id)).map(id => ({
      menu_item_id: id,
      price_delta: 0,
      pick_key: `item:${id}`,
    }));
    if (additions.length > 0) updateStep(step.key, { ...step, items: [...step.items, ...additions] });
  };

  // A rule set also specifies which sizes can be selected. Resolve the
  // published items first, then expand their allowed sizes as in manual orders.
  const stepPreviews = new Map(resolvedPreviews);
  for (const step of steps) {
    const preview = resolvedPreviews.get(step.key);
    if (!preview || !step.variant_rules?.length) continue;
    const rules = step.variant_rules;
    const items = preview.items.flatMap(item =>
      comboItemSizes(itemsById.get(item.menu_item_id))
        .filter(size => rules.some(rule => matchesComboSize(rule.size_id, rule.variant_label, size.sizeId, size.name)))
        .map(size => ({
          ...item,
          name: `${item.name} (${size.name})`,
          option_id: size.optionId,
          availability_state: item.availability_state === 'hidden' || item.availability_state === 'sold_out'
            ? item.availability_state
            : size.availabilityState ?? item.availability_state,
        })),
    );
    stepPreviews.set(step.key, { ...preview, count: items.length, items });
  }

  const previewSteps = steps.map(step => {
    if (step.source_type !== 'group') return step;
    const selections = stepPreviews.get(step.key)?.items ?? [];
    return {
      ...step,
      items: selections.map(selection => ({
        menu_item_id: selection.menu_item_id,
        variant_id: selection.option_id,
        price_delta: 0,
      })),
    };
  });

  return (
    <div className="flex min-w-0 flex-col gap-[var(--s-5)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('composeIntro')}</p>
        {canEdit && (
          <Button type="button" variant="secondary" onClick={addStep}>
            <Plus aria-hidden="true" className="size-4" />
            {t('composeNewStep')}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {steps.length === 0 && (
          <div className="rounded-r-lg border border-dashed border-[var(--line-strong)] p-[var(--s-5)] text-center text-fs-sm text-[var(--fg-muted)]">
            {t('composeEmptyHint')}
          </div>
        )}

        {steps.map((step, index) => {
          const isActive = step.key === activeStepKey;
          return (
            <StepCard
              key={step.key}
              step={step}
              index={index}
              basePrice={basePrice}
              menus={menus}
              itemsById={itemsById}
              anyCarteItemIds={anyCarteItemIds}
              preview={stepPreviews.get(step.key)}
              isActive={isActive}
              catalog={isActive && step.source_type === 'explicit' && (
                <CarteCatalog
                  restaurantId={restaurantId}
                  menus={menus}
                  categories={categories}
                  itemsById={itemsById}
                  activeStep={step}
                  anyCarteItemIds={anyCarteItemIds}
                  onAddItem={id => addItems(step, [id])}
                  onRemoveItem={id => updateStep(step.key, {
                    ...step,
                    items: step.items.filter(item => item.menu_item_id !== id),
                  })}
                  onSetCategory={ids => addItems(step, ids)}
                />
              )}
              onActivate={() => setActiveStepKey(isActive ? null : step.key)}
              onChange={next => updateStep(step.key, next)}
              onRemove={() => setRemovingStep(step)}
              onMoveUp={index > 0 ? () => moveStep(index, index - 1) : undefined}
              onMoveDown={index < steps.length - 1 ? () => moveStep(index, index + 1) : undefined}
            />
          );
        })}
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

      <div className="flex items-center justify-between gap-4 rounded-r-lg border border-[var(--line)] px-4 py-3">
        <div>
          <p className="text-fs-sm font-semibold text-[var(--fg)]">{t('comboAllowQuantityLabel')}</p>
          <p className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">
            {t(comboAllowQuantity ? 'comboAllowQuantityHelpOn' : 'comboAllowQuantityHelpOff')}
          </p>
        </div>
        <Switch
          checked={comboAllowQuantity}
          onCheckedChange={value => canEdit && onComboAllowQuantityChange(value)}
          disabled={!canEdit}
          aria-label={t('comboAllowQuantityLabel')}
          className="shrink-0 data-[state=unchecked]:bg-input"
        />
      </div>

      <PricingCard
        basePrice={basePrice}
        steps={previewSteps}
        itemsById={itemsById}
        onShowSavingsDetail={() => setShowSavingsDetail(true)}
      />
      <CustomerOutcomePreview
        comboName={comboName}
        basePrice={basePrice}
        steps={previewSteps}
        itemsById={itemsById}
      />

      <ConfirmDialog
        open={removingStep !== null}
        onOpenChange={open => { if (!open) setRemovingStep(null); }}
        title={t('composeStepDelete')}
        description={t('composeStepDeleteHint').replace('{name}', removingStep?.name ?? '')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        danger
        onConfirm={() => {
          if (removingStep) removeStep(removingStep.key);
          setRemovingStep(null);
        }}
      />
      {showSavingsDetail && (
        <ComboSavingsBreakdownModal
          comboName={comboName || undefined}
          breakdown={computeComboSavingsBreakdown(basePrice, previewSteps, itemsById)}
          onClose={() => setShowSavingsDetail(false)}
        />
      )}
    </div>
  );
}
