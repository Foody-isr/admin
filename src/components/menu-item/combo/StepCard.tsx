'use client';

// One step in a combo's composition. Two visual states:
//   • collapsed/expanded view of the step header + options (default)
//   • inline picker (StepPicker) when the user clicks "+ Ajouter…"
//
// All option mutations are emitted through `onChange(nextDraft)`. The parent
// CompositionTab owns the `ComboStepDraft[]` array.

import { ChevronUp, ChevronDown, GripVertical, Pin, Settings, Trash2, Plus, Minus, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Menu, MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ComboStepDraft, ComboOptionView, VariantView } from './types';
import { buildOptions, toDraftItems, promoteDefaultOption, promoteDefaultVariant, effectiveStepKind, getSourceVariants } from './types';
import OptionRow from './OptionRow';
import OptionRowWithVariants from './OptionRowWithVariants';
import StepPicker from './StepPicker';
import StepRulesPanel from './StepRulesPanel';
import Thumb from './Thumb';
import { isOffWebCarte } from './webCarte';

// Small amber chip surfacing the "not on any web carte" warning next to the
// specific row it applies to. Matches the chip already used by the picker
// (StepPicker) so the language and styling stay consistent across the
// composer. Click-through-friendly via `title` for the tooltip text.
function OffWebChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-fs-xs px-1.5 py-0.5 rounded-r-sm shrink-0"
      style={{
        background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
        color: 'var(--warning-500)',
      }}
      title={label}
    >
      ⚠ {label}
    </span>
  );
}

// Editable title/description input with a hover-pencil affordance. The input
// stays borderless so the card reads quietly at rest, but: (1) the placeholder
// is always visible when empty, (2) hovering reveals a small pencil that
// signals the field is editable, and (3) `cursor: text` makes the affordance
// match the cursor. Used for every step kind (fixed-single, fixed-bundle,
// choice) so the pattern is uniform across the composer.
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
  return (
    <div className="group/edit relative inline-flex items-center gap-1.5 w-full min-w-0">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          isTitle
            ? 'flex-1 min-w-0 bg-transparent border-none outline-none cursor-text text-fs-md font-semibold text-[var(--fg)] placeholder:text-[var(--fg-subtle)] placeholder:font-normal focus:underline focus:underline-offset-4 decoration-[var(--brand-500)]'
            : 'flex-1 min-w-0 bg-transparent border-none outline-none cursor-text text-fs-xs text-[var(--fg-muted)] placeholder:text-[var(--fg-subtle)] focus:text-[var(--fg)]'
        }
      />
      <Pencil
        className={`shrink-0 ${isTitle ? 'w-3 h-3' : 'w-2.5 h-2.5'} opacity-0 group-hover/edit:opacity-60 transition-opacity text-[var(--fg-subtle)] pointer-events-none`}
        aria-hidden
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
  /** Items currently surfaced to web guests. Used to flag rows whose item is
   *  not on any web-enabled carte so the operator sees the warning next to the
   *  specific row instead of a vague step-level pill. */
  webItemIds: Set<number>;
  onChange: (next: ComboStepDraft) => void;
  onRemove: () => void;
}

export default function StepCard({ step, index, basePrice, categories, itemsById, menus, webItemIds, onChange, onRemove }: Props) {
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

  const required = step.min_picks > 0;
  const optionsCount = options.length;
  const hint = step.max_picks > step.min_picks
    ? t('composeStepHintRange')
        .replace('{min}', String(step.min_picks))
        .replace('{max}', String(step.max_picks))
        .replace('{n}', String(optionsCount))
    : t('composeStepHint')
        .replace('{min}', String(step.min_picks))
        .replace('{n}', String(optionsCount));

  // ── Mutation helpers ───────────────────────────────────────────────────

  const setOptions = (nextOptions: ComboOptionView[]) => {
    onChange({ ...step, items: toDraftItems(nextOptions) });
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

    return (
      <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden">
        {/* Header: drag, badge, optional group name (bundles only), delete */}
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
            <div className="flex items-center gap-2">
              <EditableField
                value={step.name}
                onChange={(name) => onChange({ ...step, name })}
                placeholder={isBundle ? t('composeFixedGroupNamePlaceholder') : t('composeFixedItemIncluded')}
                variant="title"
              />
              <span
                className="inline-flex items-center gap-1 h-[20px] px-2 rounded-r-sm text-fs-xs font-medium shrink-0 bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-500)]"
              >
                <Pin className="w-2.5 h-2.5" />
                {t('composeKindFixed')}
              </span>
            </div>
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
                const offWeb = isOffWebCarte(draftItem.menu_item_id, webItemIds);
                return (
                  <div
                    key={draftItem.pick_key ?? `${draftItem.menu_item_id}-${idx}`}
                    className="flex items-center gap-[var(--s-3)] py-[var(--s-2)]"
                  >
                    <Thumb url={imageUrl} size={36} />
                    <span className="flex-1 min-w-0 truncate text-fs-md font-medium text-[var(--fg)]">
                      {displayName || t('composeFixedItemMissing')}
                    </span>
                    {offWeb && <OffWebChip label={t('comboWarnOffWebCarte')} />}

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
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden">
      {/* Header */}
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
          <div className="flex items-center gap-2">
            <EditableField
              value={step.name}
              onChange={(name) => onChange({ ...step, name })}
              placeholder={t('composeStepDefaultName').replace('{n}', String(index + 1))}
              variant="title"
            />
            <span className={`inline-flex items-center h-[20px] px-2 rounded-r-sm text-fs-xs font-medium shrink-0 ${
              required
                ? 'bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-500)]'
                : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
            }`}>
              {required ? t('composeRequired') : t('composeOptional')}
            </span>
          </div>
          <EditableField
            value={step.description ?? ''}
            onChange={(description) => onChange({ ...step, description })}
            placeholder={t('composeStepDescriptionPlaceholder')}
            variant="description"
          />
          <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{hint}</div>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 h-7 px-2 rounded-r-sm text-fs-xs text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
              title={t('composeStepRules')}
            >
              <Settings className="w-3.5 h-3.5" /> {t('composeStepRules')}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            className="w-64 bg-[var(--surface)] border border-[var(--line)] text-[var(--fg)] rounded-r-md shadow-2 p-[var(--s-3)]"
          >
            <StepRulesPanel
              flush
              minPicks={step.min_picks}
              maxPicks={step.max_picks}
              onChange={({ minPicks, maxPicks }) =>
                onChange({ ...step, min_picks: minPicks, max_picks: maxPicks })
              }
            />
            {/* One-click conversion to fixed bundle: forces min=max=items.length
              * so the customer auto-gets every option. Useful when an operator
              * realises a "1 of N" step is actually "all N included". After
              * conversion the card re-renders without a rules popover. */}
            {step.items.length >= 1 && step.source_type !== 'category' && (
              <button
                type="button"
                onClick={() => {
                  const n = step.items.length;
                  onChange({ ...step, min_picks: n, max_picks: n, kind: 'fixed' });
                }}
                className="mt-[var(--s-3)] w-full h-8 rounded-r-sm border border-dashed border-[var(--line-strong)] text-fs-xs font-medium text-[var(--fg-muted)] hover:border-[var(--brand-500)] hover:text-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_4%,transparent)] transition-colors"
              >
                {t('composeIncludeAll')}
              </button>
            )}
          </PopoverContent>
        </Popover>
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
                  const offWeb = isOffWebCarte(opt.menuItemId, webItemIds);
                  return opt.hasVariants ? (
                    <OptionRowWithVariants
                      key={opt.key}
                      option={opt}
                      basePrice={basePrice}
                      offWebCarte={offWeb}
                      onChange={(variants) => handleVariantsChange(opt.menuItemId, variants)}
                      onRemove={() => handleRemoveOption(opt.menuItemId)}
                    />
                  ) : (
                    <OptionRow
                      key={opt.key}
                      option={opt}
                      offWebCarte={offWeb}
                      onUpchargeChange={(next) => handleOptionUpchargeChange(opt.menuItemId, next)}
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
  onChange,
}: {
  step: ComboStepDraft;
  categories: MenuCategory[];
  itemsById: Map<number, MenuItem>;
  onChange: (next: ComboStepDraft) => void;
}) {
  const { t } = useI18n();
  const selectedId = step.source_category_id ?? 0;

  // Active items in the selected category — the set the server will resolve.
  const catItems = useMemo(() => {
    if (!selectedId) return [] as MenuItem[];
    return Array.from(itemsById.values()).filter(
      (it) => it.category_id === selectedId && it.is_active,
    );
  }, [selectedId, itemsById]);

  const previewItems = useMemo(() => catItems.map((it) => it.name), [catItems]);

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

  // Items that would be excluded because they lack a variant matching the label.
  const excluded = useMemo(() => {
    if (!label) return [] as string[];
    const want = label.toLowerCase();
    return catItems
      .filter((it) => !getSourceVariants(it).some((v) => v.name.trim().toLowerCase() === want))
      .map((it) => it.name);
  }, [catItems, label]);

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

      {selectedId > 0 && (
        <div className="text-fs-xs text-[var(--fg-muted)]">
          {previewItems.length === 0
            ? t('composeStepCategoryEmpty')
            : t('composeStepCategoryPreview').replace('{items}', previewItems.join(', '))}
        </div>
      )}

      {label && excluded.length > 0 && (
        <div className="text-fs-xs text-[var(--warn,#b45309)]">
          {t('composeStepSizeExcluded')
            .replace('{count}', String(excluded.length))
            .replace('{size}', label)
            .replace('{items}', excluded.join(', '))}
        </div>
      )}
    </div>
  );
}
