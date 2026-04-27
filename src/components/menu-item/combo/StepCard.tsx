'use client';

// One step in a combo's composition. Two visual states:
//   • collapsed/expanded view of the step header + options (default)
//   • inline picker (StepPicker) when the user clicks "+ Ajouter…"
//
// All option mutations are emitted through `onChange(nextDraft)`. The parent
// CompositionTab owns the `ComboStepDraft[]` array.

import { ChevronUp, ChevronDown, GripVertical, Settings, Trash2, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ComboStepDraft, ComboOptionView, VariantView } from './types';
import { buildOptions, toDraftItems, promoteDefaultOption, promoteDefaultVariant } from './types';
import OptionRow from './OptionRow';
import OptionRowWithVariants from './OptionRowWithVariants';
import StepPicker from './StepPicker';
import StepRulesPanel from './StepRulesPanel';

interface Props {
  step: ComboStepDraft;
  index: number;
  basePrice: number;
  categories: MenuCategory[];
  itemsById: Map<number, MenuItem>;
  onChange: (next: ComboStepDraft) => void;
  onRemove: () => void;
}

export default function StepCard({ step, index, basePrice, categories, itemsById, onChange, onRemove }: Props) {
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

  if (picking) {
    return (
      <StepPicker
        step={step}
        categories={categories}
        itemsById={itemsById}
        stepNumber={index + 1}
        onCancel={() => setPicking(false)}
        onCommit={(nextDraft) => {
          onChange(nextDraft);
          setPicking(false);
        }}
      />
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
            <input
              value={step.name}
              onChange={(e) => onChange({ ...step, name: e.target.value })}
              placeholder={t('composeStepDefaultName').replace('{n}', String(index + 1))}
              className="bg-transparent border-none outline-none text-fs-md font-semibold text-[var(--fg)] focus:underline focus:underline-offset-4 decoration-[var(--brand-500)]"
            />
            <span className={`inline-flex items-center h-[20px] px-2 rounded-r-sm text-fs-xs font-medium ${
              required
                ? 'bg-[color-mix(in_oklab,var(--brand-500)_14%,transparent)] text-[var(--brand-500)]'
                : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
            }`}>
              {required ? t('composeRequired') : t('composeOptional')}
            </span>
          </div>
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
          {options.length === 0 ? (
            <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-3)]">
              {t('composeStepEmpty')}
            </div>
          ) : (
            options.map((opt) => (
              opt.hasVariants ? (
                <OptionRowWithVariants
                  key={opt.key}
                  option={opt}
                  basePrice={basePrice}
                  onChange={(variants) => handleVariantsChange(opt.menuItemId, variants)}
                  onRemove={() => handleRemoveOption(opt.menuItemId)}
                />
              ) : (
                <OptionRow
                  key={opt.key}
                  option={opt}
                  onUpchargeChange={(next) => handleOptionUpchargeChange(opt.menuItemId, next)}
                  onRemove={() => handleRemoveOption(opt.menuItemId)}
                  onSetDefault={() => handleSetDefaultOption(opt.menuItemId)}
                />
              )
            ))
          )}

          <button
            type="button"
            onClick={() => setPicking(true)}
            className="self-start inline-flex items-center gap-1 h-8 px-2 rounded-r-sm text-fs-sm font-medium text-[var(--brand-500)] hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> {t('composeAddOption')}
          </button>
        </div>
      )}
    </div>
  );
}
