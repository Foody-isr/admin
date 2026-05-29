'use client';

// One step in a combo's composition. Two visual states:
//   • collapsed/expanded view of the step header + options (default)
//   • inline picker (StepPicker) when the user clicks "+ Ajouter…"
//
// All option mutations are emitted through `onChange(nextDraft)`. The parent
// CompositionTab owns the `ComboStepDraft[]` array.

import { AlertTriangle, Check, ChevronUp, ChevronDown, GripVertical, HelpCircle, ListChecks, Pin, Trash2, Plus, Minus, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Menu, MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';
import type { ComboStepDraft, ComboOptionView, VariantView } from './types';
import { buildOptions, toDraftItems, promoteDefaultOption, promoteDefaultVariant, effectiveStepKind, getSourceVariants, classifyCategoryItems } from './types';
import OptionRow from './OptionRow';
import OptionRowWithVariants from './OptionRowWithVariants';
import StepPicker from './StepPicker';
import Thumb from './Thumb';
import { isOffAnyCarte } from './webCarte';

// Surfaces the off-carte warning + the operator's "Inclure quand même"
// decision. Both pieces in one component so the chip and toggle always
// render together — losing either half would make the row ambiguous.
// Used by fixed-step item rows; choice-step rows inline the same shape
// inside OptionRow / OptionRowWithVariants so the toggle sits next to the
// existing controls instead of breaking row width.
function OffCarteControl({
  forceOffCarte,
  onToggle,
  warnLabel,
  warnTooltip,
  forceLabel,
  forceTooltip,
}: {
  forceOffCarte: boolean;
  onToggle: (next: boolean) => void;
  warnLabel: string;
  warnTooltip: string;
  forceLabel: string;
  forceTooltip: string;
}) {
  return (
    <div className="inline-flex flex-col items-end gap-0.5 shrink-0">
      <span
        className="inline-flex items-center gap-1 text-fs-xs px-1.5 py-0.5 rounded-r-sm"
        style={{
          background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
          color: 'var(--warning-500)',
        }}
        title={warnTooltip}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        {warnLabel}
      </span>
      <label className="inline-flex items-center gap-1 text-fs-xs text-[var(--fg-muted)] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={forceOffCarte}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-3 h-3 accent-[var(--brand-500)]"
        />
        <span>{forceLabel}</span>
        <span title={forceTooltip} aria-label={forceTooltip} className="inline-flex">
          <HelpCircle className="w-3 h-3 opacity-60 hover:opacity-100 transition-opacity" />
        </span>
      </label>
    </div>
  );
}

// Editable title/description input with a persistent edit affordance. Earlier
// versions were borderless with a hover-only pencil; the field then read as a
// static label until the operator happened to mouse over it. Now: an
// always-visible dotted bottom border + low-opacity pencil signal "this is a
// text field" at rest, hover firms the border, focus turns it solid brand. The
// pattern is shared between fixed-single, fixed-bundle and choice steps so
// every editable label in the composer looks the same.
function EditableField({
  value,
  onChange,
  placeholder,
  variant,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  variant: 'title' | 'description';
}) {
  const isTitle = variant === 'title';
  const inputBase =
    'flex-1 min-w-0 bg-transparent outline-none cursor-text border-0 border-b border-dashed transition-colors py-0.5 focus:border-solid focus:border-[var(--brand-500)]';
  const inputTone = isTitle
    ? 'text-fs-md font-semibold text-[var(--fg)] placeholder:text-[var(--fg-subtle)] placeholder:font-normal border-[var(--line-strong)] hover:border-[var(--fg-muted)]'
    : 'text-fs-xs text-[var(--fg-muted)] placeholder:text-[var(--fg-subtle)] focus:text-[var(--fg)] border-[var(--line)] hover:border-[var(--fg-subtle)]';
  return (
    <div className="group/edit relative inline-flex items-center gap-1.5 w-full min-w-0">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputBase} ${inputTone}`}
      />
      <Pencil
        className={`shrink-0 ${isTitle ? 'w-3 h-3 opacity-40' : 'w-2.5 h-2.5 opacity-30'} group-hover/edit:opacity-80 group-focus-within/edit:opacity-100 transition-opacity text-[var(--fg-subtle)] pointer-events-none`}
        aria-hidden
      />
    </div>
  );
}

// Inline min/max stepper pair that lives directly in the step header. Replaces
// the old "Règles" gear popover so the operator never has to open a secondary
// surface to see or change the rules — the controls ARE the row's choice-step
// identity (fixed steps don't render this control at all). Reads naturally as
// "Choisir 1 à 3 (sur 4 options)" when expanded.
function InlineRules({
  minPicks,
  maxPicks,
  optionsCount,
  onChange,
}: {
  minPicks: number;
  maxPicks: number;
  optionsCount: number;
  onChange: (next: { minPicks: number; maxPicks: number }) => void;
}) {
  const { t } = useI18n();
  const setMin = (raw: number) => {
    const next = Math.max(0, Number.isFinite(raw) ? raw : 0);
    onChange({ minPicks: next, maxPicks: Math.max(next, maxPicks) });
  };
  const setMax = (raw: number) => {
    const next = Math.max(minPicks, Number.isFinite(raw) ? raw : 0);
    onChange({ minPicks, maxPicks: next });
  };
  const inputCls =
    'w-11 h-6 px-1 text-center text-fs-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm focus:outline-none focus:border-[var(--brand-500)] text-[var(--fg)]';
  return (
    <div className="inline-flex items-center gap-1.5 text-fs-xs text-[var(--fg-muted)] flex-wrap mt-1">
      <ListChecks className="w-3.5 h-3.5 text-[var(--brand-500)]" aria-hidden />
      <span className="font-semibold text-[var(--fg)]">{t('composeRulesChoose')}</span>
      <NumberInput integer min={0} value={minPicks} onChange={setMin} className={inputCls} aria-label={t('composeMin')} />
      <span>{t('composeRulesTo')}</span>
      <NumberInput integer min={Math.max(1, minPicks)} value={maxPicks} onChange={setMax} className={inputCls} aria-label={t('composeMax')} />
      {optionsCount > 0 && (
        <span className="text-[var(--fg-subtle)]">
          {t('composeRulesAmong').replace('{n}', String(optionsCount))}
        </span>
      )}
    </div>
  );
}

// Unified kind switcher rendered identically on every step row. Replaces the
// asymmetric chip + "Tout inclure" / "Convertir en étape" links the composer
// had before — operators no longer have to learn a different affordance per
// kind. The active segment shows the row's current kind; clicking the other
// flips it. For choice-mode category steps, switching to fixed silently drops
// the category binding (operator can re-pick via the standard picker); the
// reverse is non-destructive.
function KindToggle({
  current,
  onSwitch,
}: {
  current: 'fixed' | 'choice';
  onSwitch: (next: 'fixed' | 'choice') => void;
}) {
  const { t } = useI18n();
  const Seg = ({
    label,
    icon,
    active,
    onClick,
  }: {
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 h-6 px-2 text-fs-xs font-medium rounded-r-xs transition-colors ${
        active
          ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1 border border-[var(--line-strong)]'
          : 'bg-transparent text-[var(--fg-muted)] border border-transparent hover:text-[var(--fg)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-0.5 rounded-r-sm bg-[var(--surface-2)] p-0.5 shrink-0">
      <Seg
        active={current === 'choice'}
        icon={<ListChecks className="w-3 h-3" />}
        label={t('composeKindStep')}
        onClick={() => current !== 'choice' && onSwitch('choice')}
      />
      <Seg
        active={current === 'fixed'}
        icon={<Pin className="w-3 h-3" />}
        label={t('composeKindFixed')}
        onClick={() => current !== 'fixed' && onSwitch('fixed')}
      />
    </div>
  );
}

const FIXED_QTY_MAX = 99;

interface Props {
  step: ComboStepDraft;
  index: number;
  basePrice: number;
  categories: MenuCategory[];
  itemsById: Map<number, MenuItem>;
  menus: Menu[];
  /** Items reachable through any non-hidden, channel-enabled group on any
   *  carte. Used by per-item rows to surface the informational "Combo-only"
   *  badge (item reachable only through this combo) and by the category-step
   *  preview's "hors carte" zone (items the resolver would silently drop). */
  anyCarteItemIds: Set<number>;
  onChange: (next: ComboStepDraft) => void;
  onRemove: () => void;
}

export default function StepCard({ step, index, basePrice, categories, itemsById, menus, anyCarteItemIds, onChange, onRemove }: Props) {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [picking, setPicking] = useState(false);

  const options = useMemo<ComboOptionView[]>(
    () => {
      const opts = buildOptions(step.items, itemsById);
      // Promote default option/variant for display.
      promoteDefaultOption(opts);
      for (const o of opts) if (o.hasVariants) promoteDefaultVariant(o.variants);
      return opts;
    },
    [step.items, itemsById],
  );

  // Category-mode steps store no items locally — the server resolves them
  // from `source_category_id` at order time. Count the resolvable items
  // (same filter the server applies) so InlineRules reports what the
  // customer will actually see instead of "parmi 0".
  const categoryAvailableCount = useMemo(
    () =>
      step.source_type === 'category'
        ? classifyCategoryItems(step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds).available.length
        : 0,
    [step.source_type, step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds],
  );
  const optionsCount = step.source_type === 'category' ? categoryAvailableCount : options.length;

  // ── Mutation helpers ───────────────────────────────────────────────────

  const setOptions = (nextOptions: ComboOptionView[]) => {
    onChange({ ...step, items: toDraftItems(nextOptions) });
  };

  // Shared kind-switch handler used by KindToggle in both render branches.
  // Keeps the conversion semantics in one place so the choice→fixed and
  // fixed→choice paths can't drift.
  const switchKindTo = (target: 'fixed' | 'choice') => {
    const n = Math.max(1, step.items.length);
    if (target === 'fixed') {
      // Drop category binding if any — fixed steps are always explicit.
      onChange({
        ...step,
        kind: 'fixed',
        source_type: 'explicit',
        source_category_id: undefined,
        source_variant_label: undefined,
        min_picks: n,
        max_picks: n,
      });
    } else {
      // Seed a sane default — pick 1 of N. Operator refines via inline rules.
      onChange({ ...step, kind: 'choice', min_picks: 1, max_picks: n });
    }
  };

  const handleOptionUpchargeChange = (menuItemId: number, next: number) => {
    setOptions(
      options.map((o) =>
        o.menuItemId === menuItemId ? { ...o, upcharge: next } : o,
      ),
    );
  };

  const handleSetDefaultOption = (menuItemId: number) => {
    // Move the picked option to position 0 — that's how we encode "default".
    const target = options.find((o) => o.menuItemId === menuItemId);
    if (!target) return;
    const rest = options.filter((o) => o.menuItemId !== menuItemId);
    setOptions([target, ...rest]);
  };

  const handleRemoveOption = (menuItemId: number) => {
    setOptions(options.filter((o) => o.menuItemId !== menuItemId));
  };

  const handleVariantsChange = (menuItemId: number, variants: VariantView[]) => {
    promoteDefaultVariant(variants);
    setOptions(
      options.map((o) => (o.menuItemId === menuItemId ? { ...o, variants } : o)),
    );
  };

  const handleForceOffCarteToggle = (menuItemId: number, next: boolean) => {
    setOptions(
      options.map((o) =>
        o.menuItemId === menuItemId ? { ...o, forceOffCarte: next } : o,
      ),
    );
  };

  // ── Picker mode ────────────────────────────────────────────────────────

  const renderKind = effectiveStepKind(step);

  if (picking) {
    return (
      <StepPicker
        step={step}
        categories={categories}
        itemsById={itemsById}
        menus={menus}
        stepNumber={index + 1}
        onCancel={() => setPicking(false)}
        onCommit={(nextDraft) => {
          // For fixed steps, lock min_picks === max_picks. When the operator
          // ends up with multiple items, that's a bundle (× 1 each) so we
          // re-derive the count from items.length. Single-item steps keep
          // whatever min/max was set via the quantity stepper.
          let committed = nextDraft;
          if (renderKind === 'fixed') {
            const n = nextDraft.items.length;
            if (n === 0) {
              committed = { ...nextDraft, min_picks: 1, max_picks: 1 };
            } else if (n === 1) {
              const qty = Math.max(1, step.min_picks || 1);
              committed = { ...nextDraft, min_picks: qty, max_picks: qty };
            } else {
              committed = { ...nextDraft, min_picks: n, max_picks: n };
            }
          }
          onChange(committed);
          setPicking(false);
        }}
      />
    );
  }

  // ── Fixed-item mode ────────────────────────────────────────────────────
  // Renders a stripped-down card with no rules, no required badge, no mode
  // toggle. Supports two shapes:
  //   • single item × N (quantity stepper visible)
  //   • bundle of N items × 1 each (no stepper; min/max == items.length)

  if (renderKind === 'fixed') {
    const isBundle = step.items.length > 1;
    const qty = Math.max(1, step.min_picks || 1);

    const setQty = (next: number) => {
      if (isBundle) return;
      const clamped = Math.max(1, Math.min(FIXED_QTY_MAX, next));
      onChange({ ...step, min_picks: clamped, max_picks: clamped });
    };

    const removeItemAt = (idx: number) => {
      const remaining = step.items.filter((_, i) => i !== idx);
      const n = remaining.length;
      // Preserve qty stepper value when collapsing to single item; bundles
      // keep min/max in lockstep with items.length.
      const nextMinMax = n === 0 ? 1 : n === 1 ? Math.max(1, step.min_picks || 1) : n;
      onChange({ ...step, items: remaining, min_picks: nextMinMax, max_picks: nextMinMax });
    };

    const setForceOffCarteAt = (idx: number, next: boolean) => {
      onChange({
        ...step,
        items: step.items.map((it, i) =>
          i === idx ? { ...it, force_off_carte: next } : it,
        ),
      });
    };

    return (
      <div
        className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden relative"
        style={{ borderInlineStartWidth: 3, borderInlineStartColor: 'color-mix(in oklab, var(--fg-subtle) 55%, transparent)' }}
      >
        {/* Header: drag, kind glyph (pin, NOT a sequence number — fixed items
            aren't a step the customer walks through), title, badge, delete.
            The left rail (neutral) and pin circle (neutral too) read as
            "static, customer doesn't choose" — distinct from choice steps
            which carry the brand-orange rail and number badge. */}
        <div className="flex items-center gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)]">
          <span className="text-[var(--fg-subtle)] cursor-grab" aria-hidden>
            <GripVertical className="w-3.5 h-3.5" />
          </span>
          <div
            className="w-8 h-8 rounded-full grid place-items-center shrink-0 bg-[var(--surface-3)] text-[var(--fg-muted)]"
            aria-hidden
          >
            <Pin className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <EditableField
              value={step.name}
              onChange={(name) => onChange({ ...step, name })}
              placeholder={isBundle ? t('composeFixedGroupNamePlaceholder') : t('composeFixedItemIncluded')}
              variant="title"
            />
            <EditableField
              value={step.description ?? ''}
              onChange={(description) => onChange({ ...step, description })}
              placeholder={t('composeStepDescriptionPlaceholder')}
              variant="description"
            />
            {isBundle && (
              <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                {t('composeFixedGroupHint').replace('{n}', String(step.items.length))}
              </div>
            )}
          </div>
          <KindToggle current="fixed" onSwitch={switchKindTo} />
          <button
            type="button"
            onClick={onRemove}
            className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--danger-500)_15%,transparent)] hover:text-[var(--danger-500)]"
            aria-label="Delete fixed step"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Body: empty placeholder, single-item compact row, or bundle list */}
        <div className="px-[var(--s-4)] py-[var(--s-3)] flex flex-col gap-[var(--s-2)]">
          {step.items.length === 0 ? (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="w-full py-[var(--s-3)] rounded-r-md border border-dashed border-[var(--line-strong)] text-fs-sm font-medium text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_6%,transparent)] transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> {t('composeFixedItemChoose')}
            </button>
          ) : (
            <>
              {step.items.map((draftItem, idx) => {
                const sourceItem = itemsById.get(draftItem.menu_item_id);
                const displayName = sourceItem?.name ?? draftItem.item_name ?? '';
                const imageUrl = sourceItem?.image_url || undefined;
                const comboOnly = isOffAnyCarte(draftItem.menu_item_id, anyCarteItemIds);
                return (
                  <div
                    key={draftItem.pick_key ?? `${draftItem.menu_item_id}-${idx}`}
                    className="flex items-center gap-[var(--s-3)] py-[var(--s-2)]"
                  >
                    <Thumb url={imageUrl} size={36} />
                    <span className="flex-1 min-w-0 truncate text-fs-md font-medium text-[var(--fg)]">
                      {displayName || t('composeFixedItemMissing')}
                    </span>
                    {comboOnly && (
                      <OffCarteControl
                        forceOffCarte={draftItem.force_off_carte ?? true}
                        onToggle={(next) => setForceOffCarteAt(idx, next)}
                        warnLabel={t('composeOffCarteWarnShort')}
                        warnTooltip={t('composeOffCarteWarnTooltip')}
                        forceLabel={t('composeOffCarteForceLabel')}
                        forceTooltip={t('composeOffCarteForceTooltip')}
                      />
                    )}

                    {/* Quantity stepper — only shown when single item. */}
                    {!isBundle && (
                      <div className="inline-flex items-center gap-1 h-8 rounded-r-sm border border-[var(--line)] bg-[var(--surface-2)] px-1">
                        <button
                          type="button"
                          onClick={() => setQty(qty - 1)}
                          disabled={qty <= 1}
                          aria-label={t('composeFixedItemQtyDecrease')}
                          className="w-6 h-6 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="min-w-[1.25rem] text-center text-fs-sm font-semibold text-[var(--fg)] tabular-nums">
                          ×{qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(qty + 1)}
                          disabled={qty >= FIXED_QTY_MAX}
                          aria-label={t('composeFixedItemQtyIncrease')}
                          className="w-6 h-6 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => removeItemAt(idx)}
                      className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--danger-500)_15%,transparent)] hover:text-[var(--danger-500)]"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {/* + Add another item — opens picker; commit handler appends. */}
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="self-start inline-flex items-center gap-1 h-8 px-2 rounded-r-sm text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> {t('composeFixedItemAddAnother')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Default mode ───────────────────────────────────────────────────────

  return (
    <div
      className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden relative"
      style={{ borderInlineStartWidth: 3, borderInlineStartColor: 'var(--brand-500)' }}
    >
      {/* Header — brand rail + numbered badge mark this as a step the customer
          walks through. Pairs with the fixed card's neutral rail + pin badge so
          row type is unmistakable at a glance. */}
      <div className="flex items-center gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)]">
        <span className="text-[var(--fg-subtle)] cursor-grab" aria-hidden>
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <div
          className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-fs-sm shrink-0"
          style={{ background: 'var(--brand-500)' }}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <EditableField
            value={step.name}
            onChange={(name) => onChange({ ...step, name })}
            placeholder={t('composeStepDefaultName').replace('{n}', String(index + 1))}
            variant="title"
          />
          <EditableField
            value={step.description ?? ''}
            onChange={(description) => onChange({ ...step, description })}
            placeholder={t('composeStepDescriptionPlaceholder')}
            variant="description"
          />
          {/* Inline rules — always visible, always editable. The KindToggle
              in the header right slot is the sole kind-conversion affordance
              (used to be a separate "Tout inclure" link here); operators flip
              choice ↔ fixed there instead. */}
          <InlineRules
            minPicks={step.min_picks}
            maxPicks={step.max_picks}
            optionsCount={optionsCount}
            onChange={({ minPicks, maxPicks }) =>
              onChange({ ...step, min_picks: minPicks, max_picks: maxPicks })
            }
          />
        </div>
        <KindToggle current="choice" onSwitch={switchKindTo} />
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
        >
          {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--danger-500)_15%,transparent)] hover:text-[var(--danger-500)]"
          aria-label="Delete step"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="px-[var(--s-4)] py-[var(--s-3)] flex flex-col gap-[var(--s-2)]">
          {/* Mode toggle */}
          <div className="flex items-center gap-3 text-fs-xs text-[var(--fg-muted)] pb-1">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name={`step-mode-${step.key}`}
                checked={step.source_type !== 'category'}
                onChange={() =>
                  onChange({ ...step, source_type: 'explicit', source_category_id: undefined })
                }
              />
              <span>{t('composeStepModeExplicit')}</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name={`step-mode-${step.key}`}
                checked={step.source_type === 'category'}
                onChange={() => {
                  if (step.items.length > 0 && !confirm(t('composeStepModeSwitchConfirm'))) return;
                  onChange({ ...step, source_type: 'category', items: [] });
                }}
              />
              <span>{t('composeStepModeCategory')}</span>
            </label>
          </div>

          {step.source_type === 'category' ? (
            <CategoryModePanel
              step={step}
              categories={categories}
              itemsById={itemsById}
              anyCarteItemIds={anyCarteItemIds}
              onChange={onChange}
            />
          ) : (
            <>
              {options.length === 0 ? (
                <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-3)]">
                  {t('composeStepEmpty')}
                </div>
              ) : (
                options.map((opt) => {
                  const comboOnly = isOffAnyCarte(opt.menuItemId, anyCarteItemIds);
                  return opt.hasVariants ? (
                    <OptionRowWithVariants
                      key={opt.key}
                      option={opt}
                      basePrice={basePrice}
                      comboOnly={comboOnly}
                      onChange={(variants) => handleVariantsChange(opt.menuItemId, variants)}
                      onForceOffCarteToggle={(next) => handleForceOffCarteToggle(opt.menuItemId, next)}
                      onRemove={() => handleRemoveOption(opt.menuItemId)}
                    />
                  ) : (
                    <OptionRow
                      key={opt.key}
                      option={opt}
                      comboOnly={comboOnly}
                      onUpchargeChange={(next) => handleOptionUpchargeChange(opt.menuItemId, next)}
                      onForceOffCarteToggle={(next) => handleForceOffCarteToggle(opt.menuItemId, next)}
                      onRemove={() => handleRemoveOption(opt.menuItemId)}
                      onSetDefault={() => handleSetDefaultOption(opt.menuItemId)}
                    />
                  );
                })
              )}

              <button
                type="button"
                onClick={() => setPicking(true)}
                className="self-start inline-flex items-center gap-1 h-8 px-2 rounded-r-sm text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> {t('composeAddOption')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryModePanel({
  step,
  categories,
  itemsById,
  anyCarteItemIds,
  onChange,
}: {
  step: ComboStepDraft;
  categories: MenuCategory[];
  itemsById: Map<number, MenuItem>;
  anyCarteItemIds: Set<number>;
  onChange: (next: ComboStepDraft) => void;
}) {
  const { t } = useI18n();
  const selectedId = step.source_category_id ?? 0;

  const catItems = useMemo(() => {
    if (!selectedId) return [] as MenuItem[];
    return Array.from(itemsById.values()).filter(
      (it) => it.category_id === selectedId && it.is_active,
    );
  }, [selectedId, itemsById]);

  // Distinct variant labels across the category's items (for the size dropdown).
  const sizeLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const it of catItems) {
      for (const v of getSourceVariants(it)) {
        const name = v.name.trim();
        const key = name.toLowerCase();
        if (name && !seen.has(key)) {
          seen.add(key);
          out.push(name);
        }
      }
    }
    return out.sort();
  }, [catItems]);

  const label = step.source_variant_label?.trim() ?? '';

  // Split the category into three zones the operator can scan independently:
  //   • available     — passes size filter AND is on at least one carte
  //   • excludedBySize — on a carte but lacks a variant matching the label
  //   • notOnAnyCarte  — would silently not resolve at order time
  // Each zone renders only when non-empty so the panel stays quiet when
  // there's nothing to flag.
  const zones = useMemo(
    () => classifyCategoryItems(step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds),
    [step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds],
  );

  const hasAnyZone =
    zones.available.length + zones.excludedBySize.length + zones.notOnAnyCarte.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <select
        value={selectedId}
        onChange={(e) =>
          onChange({
            ...step,
            source_category_id: Number(e.target.value) || undefined,
            source_variant_label: undefined, // reset size when category changes
          })
        }
        className="h-9 px-2 rounded-r-sm border border-[var(--line)] bg-[var(--surface)] text-fs-sm text-[var(--fg)]"
      >
        <option value={0}>{t('composeStepCategoryPlaceholder')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {selectedId > 0 && sizeLabels.length > 0 && (
        <label className="flex flex-col gap-1">
          <span className="text-fs-xs text-[var(--fg-muted)]">{t('composeStepSizeLabel')}</span>
          <select
            value={label}
            onChange={(e) =>
              onChange({ ...step, source_variant_label: e.target.value || undefined })
            }
            className="h-9 px-2 rounded-r-sm border border-[var(--line)] bg-[var(--surface)] text-fs-sm text-[var(--fg)]"
          >
            <option value="">{t('composeStepSizeAll')}</option>
            {sizeLabels.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      )}

      {selectedId > 0 && !hasAnyZone && (
        <div className="text-fs-xs text-[var(--fg-muted)]">{t('composeStepCategoryEmpty')}</div>
      )}

      {selectedId > 0 && hasAnyZone && (
        <div className="flex flex-col gap-1.5 mt-1">
          {zones.available.length > 0 && (
            <CategoryZone
              tone="ok"
              icon={<Check className="w-3.5 h-3.5" />}
              title={t('composeStepCategoryAvailable').replace('{n}', String(zones.available.length))}
              items={zones.available}
            />
          )}
          {zones.excludedBySize.length > 0 && (
            <CategoryZone
              tone="warn"
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              title={t('composeStepCategoryExcludedSize')
                .replace('{n}', String(zones.excludedBySize.length))
                .replace('{size}', label)}
              items={zones.excludedBySize}
            />
          )}
          {zones.notOnAnyCarte.length > 0 && (
            <CategoryZone
              tone="warn"
              icon={<AlertTriangle className="w-3.5 h-3.5" />}
              title={t('composeStepCategoryNotOnCarte').replace('{n}', String(zones.notOnAnyCarte.length))}
              subtitle={t('composeStepCategoryNotOnCarteHint')}
              items={zones.notOnAnyCarte}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Single zone of the category-step preview. Defaults to showing the first 5
// item names, with an inline expand toggle when more exist — long lists
// otherwise wrap into walls of text that hide the count summary above them.
function CategoryZone({
  tone,
  icon,
  title,
  subtitle,
  items,
}: {
  tone: 'ok' | 'warn';
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  items: string[];
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const PEEK = 5;
  const shown = expanded ? items : items.slice(0, PEEK);
  const hidden = items.length - shown.length;
  const accent = tone === 'ok' ? 'var(--success-500)' : 'var(--warning-500)';

  return (
    <div
      className="rounded-r-md px-[var(--s-3)] py-[var(--s-2)] border"
      style={{
        background: `color-mix(in oklab, ${accent} 8%, transparent)`,
        borderColor: `color-mix(in oklab, ${accent} 26%, transparent)`,
        color: accent,
      }}
    >
      <div className="flex items-center gap-1.5 text-fs-xs font-semibold">
        {icon}
        <span>{title}</span>
      </div>
      {subtitle && (
        <div className="text-fs-xs opacity-80 mt-0.5 ms-5">{subtitle}</div>
      )}
      {items.length > 0 && (
        <div className="text-fs-xs text-[var(--fg-muted)] mt-1 ms-5 leading-relaxed">
          {shown.join(', ')}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="ms-1.5 underline hover:no-underline"
              style={{ color: accent }}
            >
              {t('composeStepCategoryShowMore').replace('{n}', String(hidden))}
            </button>
          )}
          {expanded && items.length > PEEK && (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="ms-1.5 underline hover:no-underline"
              style={{ color: accent }}
            >
              {t('composeStepCategoryShowLess')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
