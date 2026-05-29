'use client';

// One step in a combo (Design B — two-pane composer).
//
// Two visual states, driven by `isActive`:
//   • Closed (summary)  — single-line glance: number, name, rule summary,
//                         item-count badge, delete. The whole row is a
//                         button that activates the step (opens it for
//                         editing AND becomes the target of catalog clicks).
//   • Open (editor)     — full editing surface with title/description,
//                         InlineRules, source-mode segmented control, and
//                         either the items list or the category panel.
//
// Only one step is "open" at a time — CompositionTab owns activeStepKey and
// passes isActive down. Active === open === target of catalog actions.

import { AlertTriangle, Check, ChevronDown, GripVertical, ListChecks, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { MenuCategory, MenuItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';
import type { ComboStepDraft, ComboOptionView, VariantView } from './types';
import { buildOptions, toDraftItems, promoteDefaultOption, promoteDefaultVariant, getSourceVariants, classifyCategoryItems } from './types';
import OptionRow from './OptionRow';
import OptionRowWithVariants from './OptionRowWithVariants';

// ── Inline helpers ─────────────────────────────────────────────────────────

function EditableField({
  value, onChange, placeholder, variant,
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

function InlineRules({
  minPicks, maxPicks, optionsCount, onChange,
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
    'w-12 h-7 px-1 text-center text-fs-sm bg-[var(--surface)] border border-[var(--line-strong)] rounded-r-sm focus:outline-none focus:border-[var(--brand-500)] text-[var(--fg)]';
  return (
    <div className="inline-flex items-center gap-2 text-fs-sm text-[var(--fg-muted)] flex-wrap">
      <ListChecks className="w-4 h-4 text-[var(--brand-500)]" aria-hidden />
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

// Compact one-line summary of a step's rule, for the closed/summary state.
// "Choisir 2 sur 4" / "Toujours ×3" / "Optionnel jusqu'à 2 sur 4". Stays
// readable at a glance without taking on the full InlineRules controls.
function ruleSummary(step: ComboStepDraft, optionsCount: number, t: (k: string) => string): string {
  const min = step.min_picks;
  const max = step.max_picks;
  if (max === 0) return t('composeStepSummaryEmpty');
  if (min === max) {
    if (optionsCount > 0 && min === optionsCount) {
      return t('composeStepSummaryAll').replace('{n}', String(min));
    }
    return t('composeStepSummaryExact')
      .replace('{n}', String(min))
      .replace('{total}', String(optionsCount));
  }
  if (min === 0) {
    return t('composeStepSummaryUpTo')
      .replace('{max}', String(max))
      .replace('{total}', String(optionsCount));
  }
  return t('composeStepSummaryRange')
    .replace('{min}', String(min))
    .replace('{max}', String(max))
    .replace('{total}', String(optionsCount));
}

// ── Step card ──────────────────────────────────────────────────────────────

interface Props {
  step: ComboStepDraft;
  index: number;
  basePrice: number;
  categories: MenuCategory[];
  itemsById: Map<number, MenuItem>;
  anyCarteItemIds: Set<number>;
  isActive: boolean;
  onActivate: () => void;
  onChange: (next: ComboStepDraft) => void;
  onRemove: () => void;
}

export default function StepCard({
  step, index, basePrice, categories, itemsById, anyCarteItemIds,
  isActive, onActivate, onChange, onRemove,
}: Props) {
  const { t } = useI18n();

  const options = useMemo<ComboOptionView[]>(() => {
    const opts = buildOptions(step.items, itemsById);
    promoteDefaultOption(opts);
    for (const o of opts) if (o.hasVariants) promoteDefaultVariant(o.variants);
    return opts;
  }, [step.items, itemsById]);

  const categoryAvailableCount = useMemo(
    () =>
      step.source_type === 'category'
        ? classifyCategoryItems(step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds).available.length
        : 0,
    [step.source_type, step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds],
  );
  const optionsCount = step.source_type === 'category' ? categoryAvailableCount : options.length;

  // ── Mutation helpers ─────────────────────────────────────────────────

  const setOptions = (nextOptions: ComboOptionView[]) => {
    onChange({ ...step, items: toDraftItems(nextOptions) });
  };
  const handleOptionUpchargeChange = (menuItemId: number, next: number) => {
    setOptions(options.map((o) => (o.menuItemId === menuItemId ? { ...o, upcharge: next } : o)));
  };
  const handleSetDefaultOption = (menuItemId: number) => {
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
    setOptions(options.map((o) => (o.menuItemId === menuItemId ? { ...o, variants } : o)));
  };
  const handleForceOffCarteToggle = (menuItemId: number, next: boolean) => {
    setOptions(options.map((o) => (o.menuItemId === menuItemId ? { ...o, forceOffCarte: next } : o)));
  };

  // ── Closed (summary) state ───────────────────────────────────────────

  if (!isActive) {
    const itemCount = step.source_type === 'category' ? categoryAvailableCount : options.length;
    const stepName = step.name || t('composeStepDefaultName').replace('{n}', String(index + 1));
    return (
      <button
        type="button"
        onClick={onActivate}
        className="group/step w-full text-start rounded-r-lg border border-[var(--line)] bg-[var(--surface)] hover:border-[var(--brand-500)] hover:bg-[color-mix(in_oklab,var(--brand-500)_3%,transparent)] transition-colors flex items-center gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)]"
        style={{ borderInlineStartWidth: 3, borderInlineStartColor: 'color-mix(in oklab, var(--brand-500) 35%, transparent)' }}
      >
        <span className="text-[var(--fg-subtle)] shrink-0" aria-hidden>
          <GripVertical className="w-3.5 h-3.5" />
        </span>
        <div
          className="w-7 h-7 rounded-full grid place-items-center text-white font-bold text-fs-xs shrink-0"
          style={{ background: 'var(--brand-500)' }}
        >
          {index + 1}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-fs-md font-semibold text-[var(--fg)] truncate">{stepName}</div>
          <div className="text-fs-xs text-[var(--fg-muted)] flex items-center gap-2 mt-0.5">
            <span className="inline-flex items-center gap-1">
              <ListChecks className="w-3 h-3 text-[var(--brand-500)]" />
              {ruleSummary(step, optionsCount, t)}
            </span>
            {step.source_type === 'category' && step.source_category_id != null && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-r-sm bg-[color-mix(in_oklab,var(--brand-500)_10%,transparent)] text-[var(--brand-500)] font-medium">
                {categories.find((c) => c.id === step.source_category_id)?.name ?? '…'}
                {step.source_variant_label ? ` · ${step.source_variant_label}` : ''}
              </span>
            )}
            <span className="text-[var(--fg-subtle)]">·</span>
            <span>{t('composeStepSummaryItemCount').replace('{n}', String(itemCount))}</span>
          </div>
        </div>
        <span className="text-fs-xs text-[var(--fg-subtle)] opacity-0 group-hover/step:opacity-100 transition-opacity shrink-0">
          {t('composeStepSummaryEditCta')}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--danger-500)_15%,transparent)] hover:text-[var(--danger-500)] shrink-0"
          aria-label={t('composeStepDelete')}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </button>
    );
  }

  // ── Open (editor) state ──────────────────────────────────────────────

  return (
    <div
      className="rounded-r-lg border-2 border-[var(--brand-500)] bg-[var(--surface)] overflow-hidden"
      style={{
        boxShadow: '0 0 0 4px color-mix(in oklab, var(--brand-500) 12%, transparent)',
      }}
    >
      {/* Status strip — makes it unambiguous which step the catalog targets. */}
      <div className="flex items-center justify-between gap-3 px-[var(--s-4)] py-[var(--s-2)] bg-[color-mix(in_oklab,var(--brand-500)_10%,transparent)] border-b border-[var(--line)]">
        <span className="inline-flex items-center gap-1.5 text-fs-xs font-bold uppercase tracking-[.08em] text-[var(--brand-500)]">
          <span
            className="w-5 h-5 rounded-full grid place-items-center text-white font-bold text-[10px]"
            style={{ background: 'var(--brand-500)' }}
          >
            {index + 1}
          </span>
          {t('composeStepActiveLabel')}
        </span>
        <span className="text-fs-xs text-[var(--fg-muted)]">{t('composeStepActiveHint')}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onActivate}
            className="inline-flex items-center gap-1 h-7 px-2 rounded-r-sm text-fs-xs font-medium text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            {t('composeStepClose')}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="w-7 h-7 grid place-items-center rounded-r-sm text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--danger-500)_15%,transparent)] hover:text-[var(--danger-500)]"
            aria-label={t('composeStepDelete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Editor body — breathable spacing, fields stacked one per row. */}
      <div className="px-[var(--s-4)] py-[var(--s-4)] flex flex-col gap-[var(--s-4)]">

        {/* Name + description */}
        <div className="flex flex-col gap-1">
          <span className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)]">
            {t('composeStepFieldName')}
          </span>
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
        </div>

        {/* Rules */}
        <div className="flex flex-col gap-1.5">
          <span className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)]">
            {t('composeStepFieldRules')}
          </span>
          <InlineRules
            minPicks={step.min_picks}
            maxPicks={step.max_picks}
            optionsCount={optionsCount}
            onChange={({ minPicks, maxPicks }) =>
              onChange({ ...step, min_picks: minPicks, max_picks: maxPicks })
            }
          />
        </div>

        {/* Source mode — segmented control between manual list and dynamic category. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)]">
            {t('composeStepFieldSource')}
          </span>
          <div className="inline-flex items-center gap-0.5 rounded-r-sm bg-[var(--surface-2)] p-0.5 self-start">
            <SourceSeg
              active={step.source_type !== 'category'}
              onClick={() =>
                onChange({ ...step, source_type: 'explicit', source_category_id: undefined, source_variant_label: undefined })
              }
              label={t('composeStepModeExplicit')}
            />
            <SourceSeg
              active={step.source_type === 'category'}
              onClick={() => {
                if (step.items.length > 0 && !confirm(t('composeStepModeSwitchConfirm'))) return;
                onChange({ ...step, source_type: 'category', items: [] });
              }}
              label={t('composeStepModeCategory')}
            />
          </div>
        </div>

        {/* Content — either the items list or the category panel */}
        {step.source_type === 'category' ? (
          <CategoryModePanel
            step={step}
            categories={categories}
            itemsById={itemsById}
            anyCarteItemIds={anyCarteItemIds}
            onChange={onChange}
          />
        ) : options.length === 0 ? (
          <div className="text-fs-sm text-[var(--fg-subtle)] py-[var(--s-4)] text-center border border-dashed border-[var(--line)] rounded-r-md">
            {t('composeStepEmptyHint')}
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--s-2)]">
            {options.map((opt) => {
              const comboOnly = !anyCarteItemIds.has(opt.menuItemId);
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceSeg({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 px-3 rounded-r-xs text-fs-xs font-medium transition-colors ${
        active
          ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1 border border-[var(--line-strong)]'
          : 'bg-transparent text-[var(--fg-muted)] border border-transparent hover:text-[var(--fg)]'
      }`}
    >
      {label}
    </button>
  );
}

// ── Category-mode sub-panel ───────────────────────────────────────────────

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

  const zones = useMemo(
    () => classifyCategoryItems(step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds),
    [step.source_category_id, step.source_variant_label, itemsById, anyCarteItemIds],
  );

  const hasAnyZone =
    zones.available.length + zones.excludedBySize.length + zones.notOnAnyCarte.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <select
        value={selectedId}
        onChange={(e) =>
          onChange({
            ...step,
            source_category_id: Number(e.target.value) || undefined,
            source_variant_label: undefined,
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
        <div className="flex flex-col gap-1.5">
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

function CategoryZone({
  tone, icon, title, subtitle, items,
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
