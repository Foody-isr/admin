'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, ArrowRight } from 'lucide-react';
import {
  listAvailabilityRules,
  previewItemAvailability,
  updateMenuItem,
  setItemOptionStock,
  AvailabilityRule,
  AvailabilityPreview,
  AvailabilityOverride,
  AvailabilityState,
  ImmediateSaleMode,
  MenuItem,
} from '@/lib/api';
import { Field, Select } from '@/components/ds';
import { NumberInput } from '@/components/ui/NumberInput';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { cn } from '@/lib/utils';
import { LearnMore } from '@/components/help/LearnMore';
import { parsePortionGrams } from '@/lib/production';
import { toBaseUnit, convertQuantity } from '@/lib/units';

// Display unit for predefined stock. '' = portion counts; 'g'/'kg' = weight,
// which maps to the server's "measure" mode (shared) or a portion count derived
// from each size's weight (per-size). Volume (ml/L) is intentionally out of scope.
type StockUnit = '' | 'g' | 'kg';
const round2 = (n: number) => Math.round(n * 100) / 100;

// Segmented control — a sunken neutral track with a raised, brand-tinted active
// pill. Calmer than a saturated fill and consistent with the app's selection
// idiom (brand border + brand-tint background). Theme-safe in light and dark.
function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex rounded-lg p-[3px]"
      style={{ background: 'color-mix(in oklab, var(--fg) 6%, transparent)' }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value || '_'}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (!disabled && o.value !== value) onChange(o.value);
            }}
            className={cn(
              'px-[var(--s-3)] h-7 rounded-[6px] text-fs-xs font-semibold transition-all duration-150',
              active ? 'text-[var(--brand-500)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            style={
              active
                ? {
                    background: 'color-mix(in oklab, var(--brand-500) 14%, var(--surface))',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                  }
                : undefined
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Number entry with the unit as an integrated suffix (hairline-divided) rather
// than a floating word — reads as one control and keeps the value and its unit
// visually bound.
function StockValueField({
  value,
  integer,
  unitLabel,
  disabled,
  width,
  onChange,
}: {
  value: number;
  integer: boolean;
  unitLabel: string;
  disabled?: boolean;
  width: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-stretch overflow-hidden rounded-md border border-[var(--line-strong)] bg-[var(--surface)] transition-colors focus-within:border-[var(--brand-500)]">
      <NumberInput
        integer={integer}
        min={0}
        value={value}
        disabled={disabled}
        onChange={onChange}
        placeholder="0"
        className={cn(
          'h-10 bg-transparent px-[var(--s-3)] text-fs-sm tabular-nums text-[var(--fg)] focus:outline-none',
          width,
        )}
      />
      <span
        className="flex items-center border-s border-[var(--line)] px-[var(--s-3)] text-fs-xs font-medium text-[var(--fg-muted)]"
        style={{ background: 'color-mix(in oklab, var(--fg) 4%, transparent)' }}
      >
        {unitLabel}
      </span>
    </div>
  );
}

/** Imperative handle so the parent modal commits this tab on "Enregistrer"
 *  (mirrors MenuItemTabRecipeHandle). Nothing on this tab persists until the
 *  modal's Save is clicked; "Annuler" simply discards the staged local state. */
export interface ItemAvailabilityPanelHandle {
  save: () => Promise<void>;
  isDirty: () => boolean;
}

interface Props {
  rid: number;
  itemId: number;
  item: MenuItem;
  /** Restaurant-wide default predefined-stock unit ('' portions | 'g' | 'kg').
   *  Seeds the unit for a not-yet-configured item that has weighted sizes. */
  defaultStockUnit?: StockUnit;
  /** Called after a successful save so the parent can refresh its copy. */
  onSaved?: () => void;
}

// Layout aligned with Article (MenuItemTabDetails) and Composition tabs:
// • Brand-accent header (3px bar + text-fs-xl title) + intro paragraph
// • max-w-4xl wrapper (matches Article tab width)
// • Section cards using the shared `rounded-r-lg border border-[var(--line)]
//   bg-[var(--surface)] p-[var(--s-5)]` recipe.
// • Two sections only: live État + the unified Disponibilité control. The
//   single radio group makes the rule a sub-option of "Suivre une règle" so
//   the rule/override layers stop reading as two redundant controls.
const ItemAvailabilityPanel = forwardRef<ItemAvailabilityPanelHandle, Props>(function ItemAvailabilityPanel(
  { rid, itemId, item, defaultStockUnit = '', onSaved },
  ref,
) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  // Any user edit on this tab flips this; the parent's Save only commits when dirty.
  const [dirty, setDirty] = useState(false);
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [ruleId, setRuleId] = useState<number>(item.availability_rule_id ?? 0); // 0 = inherit
  const [override, setOverride] = useState<AvailabilityOverride>(item.availability_override ?? 'auto');
  // Manual stock count (predefined stock): null = not tracked. `stockTracked`
  // mirrors null-ness so the toggle survives a 0 value (0 = sold out, not off).
  // Per-size mode carries the counts on the options (item.stock_quantity is null),
  // so it counts as "tracked" too.
  const [stockTracked, setStockTracked] = useState<boolean>(
    item.stock_quantity != null || item.stock_mode === 'per_variant',
  );
  // Per-size ("per_variant") counts live on the FIRST attached option set — this
  // mirrors the server's stockConfigs, which keys the pool off that set. So that
  // set's active options ARE the trackable sizes. Legacy variant_groups can't
  // carry per-size counts, so they only ever get the shared counter.
  const sizeSet = item.option_sets?.[0];
  const sizeOptions = useMemo(
    () => (sizeSet?.options ?? []).filter((o) => o.is_active !== false),
    [sizeSet],
  );
  const hasOptionSizes = sizeOptions.length > 0;
  const hasVariants =
    (item.variant_groups?.some((g) => (g.variants?.length ?? 0) > 0) ?? false) || hasOptionSizes;
  // Grams per size, parsed from the size name ("250g" -> 250). Weight tracking is
  // only offered when EVERY active size carries a parseable weight; otherwise a
  // weightless size couldn't deduct and would silently oversell.
  const sizeGrams = useMemo(() => {
    const m: Record<number, number> = {};
    for (const o of sizeOptions) {
      const g = parsePortionGrams(o.name);
      if (g != null) m[o.id] = g;
    }
    return m;
  }, [sizeOptions]);
  const hasWeightedSizes = hasOptionSizes && sizeOptions.every((o) => sizeGrams[o.id] != null);
  // Unit of the predefined count. Seed from the item's saved unit / mode; for a
  // not-yet-configured item, fall back to the restaurant default — but only when
  // the unit toggle is meaningful (weighted sizes). Weight ("measure") mode has
  // no per-size weight to deduct on a size-less item, so it must stay portions.
  const initialUnit: StockUnit =
    item.stock_unit === 'kg'
      ? 'kg'
      : item.stock_unit === 'g' || item.stock_mode === 'measure'
        ? 'g'
        : (hasWeightedSizes ? defaultStockUnit : '') || '';
  const [stockUnit, setStockUnit] = useState<StockUnit>(initialUnit);
  // 'shared' = one pool for every size; 'per_variant' = a pool per size.
  const [stockMode, setStockMode] = useState<'shared' | 'per_variant'>(
    item.stock_mode === 'per_variant' ? 'per_variant' : 'shared',
  );
  // Shared field value in the CURRENT unit. Measure stores base grams, so convert
  // for display when the unit is weight.
  const [stockValue, setStockValue] = useState<number>(() =>
    item.stock_mode === 'measure' && item.stock_quantity != null
      ? round2(convertQuantity(item.stock_quantity, 'g', initialUnit || 'g'))
      : item.stock_quantity ?? 0,
  );
  // Per-size field values in the CURRENT unit. Canonical storage is always a
  // portion count (per-option stock_remaining); weight = count x size weight.
  const [perSizeField, setPerSizeField] = useState<Record<number, number>>(() => {
    const f: Record<number, number> = {};
    for (const o of sizeSet?.options ?? []) {
      const count = o.stock_remaining ?? 0;
      const g = parsePortionGrams(o.name) ?? 0;
      f[o.id] = initialUnit === '' ? count : round2(convertQuantity(count * g, 'g', initialUnit));
    }
    return f;
  });
  // Field value <-> canonical portion count, given a unit. In weight mode a
  // per-size gram amount becomes floor(grams / size weight) whole portions.
  const fieldToCount = useCallback(
    (oid: number, val: number, unit: StockUnit): number => {
      if (unit === '') return Math.max(0, Math.round(val || 0));
      const g = sizeGrams[oid];
      if (!g) return 0;
      return Math.max(0, Math.floor(toBaseUnit(val || 0, unit) / g));
    },
    [sizeGrams],
  );
  const countToField = useCallback(
    (oid: number, count: number, unit: StockUnit): number =>
      unit === '' ? count : round2(convertQuantity(count * (sizeGrams[oid] ?? 0), 'g', unit)),
    [sizeGrams],
  );
  const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
  // Immediate-sale channel + preparation lead time. Both are opt-in and mutually
  // exclusive: an immediate item needs a plain count stock and no lead time.
  // Staged like the rest of the tab — committed by doSave, discarded on Annuler.
  const [immediateSaleMode, setImmediateSaleMode] = useState<ImmediateSaleMode>(
    item.immediate_sale_mode ?? '',
  );
  const [leadTimeDays, setLeadTimeDays] = useState<number>(item.lead_time_days ?? 0);

  const modes: { value: AvailabilityOverride; label: string; desc: string }[] = [
    {
      value: 'auto',
      label: t('availabilityOverrideAuto'),
      desc: t('availabilityOverrideAutoDesc'),
    },
    {
      value: 'force_available',
      label: t('availabilityOverrideForceAvailable'),
      desc: t('availabilityOverrideForceAvailableDesc'),
    },
    {
      value: 'force_sold_out',
      label: t('availabilityOverrideForceSoldOut'),
      desc: t('availabilityOverrideForceSoldOutDesc'),
    },
  ];

  const loadPreview = useCallback(async () => {
    try {
      setPreview(await previewItemAvailability(rid, itemId));
    } catch {
      setPreview(null);
    }
  }, [rid, itemId]);

  useEffect(() => {
    listAvailabilityRules(rid).then(setRules).catch(() => setRules([]));
    loadPreview();
  }, [rid, loadPreview]);

  // Coalesce "pinned to the rule that IS the restaurant default" into "inherit".
  // The two are equivalent, and inherit is the canonical, future-proof form — so
  // an item explicitly pinned to e.g. "Standard" (the default) is shown as
  // "Par défaut du restaurant", never as a duplicate explicit entry. Local only;
  // it's persisted to availability_rule_id = 0 on the next save.
  useEffect(() => {
    if (ruleId !== 0 && rules.some((r) => r.is_default && r.id === ruleId)) {
      setRuleId(0);
    }
  }, [rules, ruleId]);

  // Immediate sale requires a plain count stock (shared, portions) and no lead
  // time. Lead time is disabled while an immediate mode is on. Mirrors the
  // server's validateSaleAndLeadTime so the user never hits a rejection.
  // Derived before doSave because the save payload applies the same rule.
  const hasCountStock = stockTracked && stockMode === 'shared' && stockUnit === '';
  const immediateOptionsEnabled = hasCountStock && leadTimeDays <= 0;
  const leadEnabled = immediateSaleMode === '';

  // Commit the whole tab in one shot from current local state — called by the
  // parent modal on "Enregistrer" (never on change/blur). Availability, the
  // sale mode / lead time and the shared stock fields go in a single
  // updateMenuItem; per-size mode seeds every size's count first (an unset size
  // defaults to 0 = sold out server-side) then flips the mode. Throws on failure
  // so the parent's Save flow surfaces it.
  const doSave = useCallback(async () => {
    if (!canEdit) return;
    const availability = {
      availability_rule_id: ruleId, // 0 clears to inherit
      availability_override: override,
      // Staged stock can invalidate an earlier immediate-sale pick (e.g. the user
      // switches to per-size counts while "surplus" is on). The buttons disable
      // but keep their value, so drop it here rather than let the server reject
      // the whole save.
      immediate_sale_mode: immediateOptionsEnabled ? immediateSaleMode : '',
      lead_time_days: Math.max(0, Math.round(leadTimeDays || 0)),
    };
    if (!stockTracked) {
      await updateMenuItem(rid, itemId, { ...availability, stock_quantity: null, stock_mode: '', stock_unit: '' });
    } else if (stockMode === 'per_variant' && sizeSet) {
      await Promise.all(
        sizeOptions.map((o) =>
          setItemOptionStock(rid, sizeSet.id, itemId, o.id, fieldToCount(o.id, perSizeField[o.id] ?? 0, stockUnit)),
        ),
      );
      await updateMenuItem(rid, itemId, {
        ...availability,
        stock_mode: 'per_variant',
        stock_quantity: null,
        stock_unit: stockUnit,
      });
    } else if (stockUnit === '') {
      await updateMenuItem(rid, itemId, {
        ...availability,
        stock_quantity: Math.max(0, Math.round(stockValue)),
        stock_mode: 'count',
        stock_unit: '',
      });
    } else {
      await updateMenuItem(rid, itemId, {
        ...availability,
        stock_quantity: Math.max(0, Math.round(toBaseUnit(stockValue, stockUnit))), // base grams
        stock_mode: 'measure',
        stock_unit: stockUnit,
      });
    }
    setDirty(false);
    await loadPreview();
    onSaved?.();
  }, [
    canEdit,
    rid,
    itemId,
    ruleId,
    override,
    immediateOptionsEnabled,
    immediateSaleMode,
    leadTimeDays,
    stockTracked,
    stockMode,
    stockUnit,
    stockValue,
    perSizeField,
    sizeSet,
    sizeOptions,
    fieldToCount,
    loadPreview,
    onSaved,
  ]);

  useImperativeHandle(ref, () => ({ save: doSave, isDirty: () => dirty }), [doSave, dirty]);

  // Change the display unit (staged, not persisted). Per-size converts cleanly
  // through the stable portion count. Shared portions<->weight can't be inferred
  // (a gram budget has no fixed portion count without a size mix), so it resets to
  // 0; weight<->weight (g<->kg) converts.
  const changeUnit = useCallback(
    (newUnit: StockUnit) => {
      if (!canEdit || newUnit === stockUnit) return;
      if (stockMode === 'shared') {
        const next =
          stockUnit !== '' && newUnit !== ''
            ? round2(convertQuantity(toBaseUnit(stockValue, stockUnit), 'g', newUnit))
            : 0;
        setStockUnit(newUnit);
        setStockValue(next);
      } else {
        const nextFields: Record<number, number> = {};
        for (const o of sizeOptions) {
          const count = fieldToCount(o.id, perSizeField[o.id] ?? 0, stockUnit);
          nextFields[o.id] = countToField(o.id, count, newUnit);
        }
        setStockUnit(newUnit);
        setPerSizeField(nextFields);
      }
      setDirty(true);
    },
    [canEdit, stockUnit, stockMode, stockValue, sizeOptions, perSizeField, fieldToCount, countToField],
  );

  // Suffix shown next to stock fields: the unit itself for weight, else "portions".
  const unitLabel = stockUnit === '' ? t('availabilityPortions') : stockUnit;

  function ruleSummary(rule: AvailabilityRule | undefined): string {
    if (!rule) return '';
    if (!rule.track) return t('availabilityAlwaysAvailableDesc');
    const parts = [t('availabilityTracksStock')];
    if (rule.low_stock_threshold > 0) parts.push(`${t('availabilityWarnAtMost')} ${rule.low_stock_threshold}`);
    parts.push(rule.out_of_stock_behavior === 'hide' ? t('availabilityHideWhenOut') : t('availabilitySoldOutBadge'));
    parts.push(rule.show_count ? t('availabilityShowsCount') : t('availabilityGenericBadge'));
    return parts.join(' · ');
  }

  // Which rules to list explicitly in the picker. Two are intentionally hidden,
  // because each is already represented by another control — listing them again
  // is redundant and confusing:
  //   • the restaurant default rule → already the "Inherit (… default)" option,
  //     which is the canonical, future-proof way to follow it (it tracks
  //     whichever rule is the default over time);
  //   • deprecated "Always available" presets (track === false) → reachable via
  //     the "Toujours disponible" mode.
  // Either is kept when the item is *explicitly* pinned to it (r.id === ruleId)
  // so the owner still sees their current selection before switching away.
  const visibleRules = useMemo(
    () => rules.filter((r) => r.id === ruleId || (!r.is_default && r.track !== false)),
    [rules, ruleId],
  );

  const selectedRule = rules.find((r) => r.id === ruleId);
  const defaultRule = rules.find((r) => r.is_default);
  const resolvedRule = ruleId === 0 ? defaultRule : selectedRule;
  const state: AvailabilityState | 'loading' =
    preview == null ? 'loading' : preview.unlimited ? 'available' : preview.state;

  const StatusIcon =
    state === 'available' ? CheckCircle2 : state === 'low' ? AlertTriangle : state === 'sold_out' ? XCircle : Info;
  const statusTone: Record<AvailabilityState | 'loading', { fg: string; bgMix: string }> = {
    available:  { fg: 'var(--success-500)', bgMix: 'color-mix(in oklab, var(--success-500) 14%, transparent)' },
    low:        { fg: 'var(--warning-500)', bgMix: 'color-mix(in oklab, var(--warning-500) 14%, transparent)' },
    sold_out:   { fg: 'var(--danger-500)',  bgMix: 'color-mix(in oklab, var(--danger-500) 14%, transparent)' },
    hidden:     { fg: 'var(--fg-muted)',    bgMix: 'color-mix(in oklab, var(--fg-muted) 14%, transparent)' },
    loading:    { fg: 'var(--fg-muted)',    bgMix: 'color-mix(in oklab, var(--fg-muted) 14%, transparent)' },
  };
  const tone = statusTone[state];

  const saleModes: { value: ImmediateSaleMode; label: string; desc: string }[] = [
    { value: '', label: t('saleModePreorderOnly'), desc: t('saleModePreorderOnlyDesc') },
    { value: 'surplus', label: t('saleModeSurplus'), desc: t('saleModeSurplusDesc') },
    { value: 'standalone', label: t('saleModeStandalone'), desc: t('saleModeStandaloneDesc') },
  ];

  return (
    <div className="max-w-4xl flex flex-col gap-[var(--s-5)]">
      {/* Brand-accent header — matches Composition tab. */}
      <div className="flex flex-col gap-[var(--s-2)]">
        <div className="flex items-center gap-[var(--s-3)]">
          <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
          <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabStock')}</h3>
        </div>
        <p className="text-fs-sm text-[var(--fg-muted)]">{t('availabilityPanelIntro')}</p>
      </div>

      {/* État — live status pill. */}
      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
        <div className="flex items-center gap-[var(--s-4)]">
          <div
            className="w-10 h-10 rounded-r-md grid place-items-center shrink-0"
            style={{ background: tone.bgMix, color: tone.fg }}
          >
            <StatusIcon className="w-[18px] h-[18px]" />
          </div>
          <div className="min-w-0">
            {preview == null ? (
              <div className="text-fs-sm text-[var(--fg-muted)]">{t('availabilityComputing')}</div>
            ) : preview.unlimited ? (
              <>
                <div className="text-fs-md font-semibold text-[var(--fg)]">
                  {t('availabilityStateAvailable')}
                </div>
                <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                  {t('availabilityNoRecipeHint')}
                </div>
              </>
            ) : (
              <>
                <div className="text-fs-md font-semibold text-[var(--fg)]">
                  {t(
                    preview.state === 'low'
                      ? 'availabilityStateLow'
                      : preview.state === 'sold_out'
                        ? 'availabilityStateSoldOut'
                        : preview.state === 'hidden'
                          ? 'availabilityStateHidden'
                          : 'availabilityStateAvailable',
                  )}
                </div>
                <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                  {t('availabilityBuildableNow')} {preview.buildable} {t('availabilityPortions')}
                  {preview.bottleneck && (
                    <>
                      , {t('availabilityLimitedBy')} {preview.bottleneck}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Disponibilité — single 3-option control. The rule picker appears
          inline under "Suivre une règle" only; collapses otherwise. */}
      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)] flex flex-col gap-[var(--s-3)]">
        <div className="flex items-start justify-between gap-[var(--s-3)] mb-[var(--s-2)]">
          <div className="min-w-0">
            <div className="text-fs-md font-semibold text-[var(--fg)]">
              {t('availabilityModeTitle')}
            </div>
            <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
              {t('availabilityModeSubtitle')}
            </div>
          </div>
        </div>

        {modes.map((m) => {
          const selected = override === m.value;
          return (
            <div key={m.value}>
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => {
                  if (!canEdit) return;
                  setOverride(m.value);
                  setDirty(true);
                }}
                className={cn(
                  'w-full flex items-start gap-[var(--s-3)] rounded-r-lg border p-[var(--s-4)] text-start transition-colors',
                  selected
                    ? 'border-[var(--brand-500)]'
                    : 'border-[var(--line)] hover:border-[var(--line-strong)]',
                  !canEdit && 'cursor-default',
                )}
                style={{
                  background: selected
                    ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))'
                    : 'var(--surface)',
                }}
              >
                <span
                  className={cn(
                    'mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 grid place-items-center',
                    selected ? 'border-[var(--brand-500)]' : 'border-[var(--line-strong)]',
                  )}
                >
                  {selected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-500)]" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-fs-sm font-semibold text-[var(--fg)]">{m.label}</span>
                  <span className="block text-fs-xs text-[var(--fg-muted)] mt-1 leading-[var(--lh-base)]">
                    {m.desc}
                  </span>
                </span>
              </button>

              {selected && m.value === 'auto' && (
                <div className="mt-[var(--s-3)] ms-[calc(1rem+var(--s-3))] rounded-r-md border border-[var(--line)] bg-[var(--surface-2,var(--surface))] p-[var(--s-4)] flex flex-col gap-[var(--s-2)]">
                  <div className="flex items-end justify-between gap-[var(--s-3)]">
                    <Field label={t('availabilityRuleField')}>
                      <Select
                        value={String(ruleId)}
                        disabled={!canEdit}
                        onChange={(e) => {
                          if (!canEdit) return;
                          const v = Number(e.target.value);
                          setRuleId(v);
                          setDirty(true);
                        }}
                      >
                        <option value="0">
                          {t('availabilityInherit')}
                          {defaultRule ? ` (${defaultRule.name})` : ''}
                        </option>
                        {visibleRules.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                            {r.is_default ? ` ${t('availabilityDefaultParen')}` : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <a
                      href={`/${rid}/kitchen/availability`}
                      className="shrink-0 pb-[10px] inline-flex items-center gap-1 text-fs-xs font-medium text-[var(--brand-500)] hover:underline"
                    >
                      {t('availabilityManageRules')} <ArrowRight className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-fs-xs text-[var(--fg-subtle)]">{ruleSummary(resolvedRule)}</p>

                  {/* Predefined stock — lets a restaurant track stock by just
                      setting a number, no recipe required. Used as the buildable
                      count when the item has no recipe; decrements on orders. */}
                  <div className="mt-[var(--s-2)] pt-[var(--s-3)] border-t border-[var(--line)] flex flex-col gap-[var(--s-3)]">
                    <label className="flex items-start gap-[var(--s-3)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stockTracked}
                        disabled={!canEdit}
                        onChange={(e) => {
                          if (!canEdit) return;
                          const on = e.target.checked;
                          setStockTracked(on);
                          // Always (re)start in shared mode; per-size is opt-in below.
                          if (on) setStockMode('shared');
                          setDirty(true);
                        }}
                        className="mt-0.5 accent-[var(--brand-500)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-fs-sm font-semibold text-[var(--fg)]">
                          {t('manualStockTitle')}
                        </span>
                        <span className="block text-fs-xs text-[var(--fg-muted)] mt-1 leading-[var(--lh-base)]">
                          {t('manualStockHint')}
                        </span>
                      </span>
                    </label>
                    {stockTracked && (
                      <div className="ms-[calc(1rem+var(--s-3))] flex flex-col gap-[var(--s-4)]">
                        {/* "How you count" — distribution (shared/per-size) and unit,
                            as an aligned two-row cluster. Each control only appears
                            when it's meaningful for this item. */}
                        {(hasOptionSizes || hasWeightedSizes) && (
                          <div className="flex flex-col gap-[var(--s-3)]">
                            {hasOptionSizes && (
                              <div className="flex items-center gap-[var(--s-3)]">
                                <span className="w-[5.5rem] shrink-0 text-fs-xs font-medium text-[var(--fg-muted)]">
                                  {t('manualStockDistributionLabel')}
                                </span>
                                <Segmented
                                  value={stockMode}
                                  disabled={!canEdit}
                                  onChange={(m) => {
                                    setStockMode(m);
                                    setDirty(true);
                                  }}
                                  options={[
                                    { value: 'shared', label: t('manualStockModeShared') },
                                    { value: 'per_variant', label: t('manualStockModePerVariant') },
                                  ]}
                                />
                              </div>
                            )}
                            {/* Unit — only when every size has a parseable weight, so
                                weight always deducts correctly. */}
                            {hasWeightedSizes && (
                              <div className="flex items-center gap-[var(--s-3)]">
                                <span className="w-[5.5rem] shrink-0 text-fs-xs font-medium text-[var(--fg-muted)]">
                                  {t('manualStockUnitLabel')}
                                </span>
                                <Segmented
                                  value={stockUnit}
                                  disabled={!canEdit}
                                  onChange={changeUnit}
                                  options={[
                                    { value: '', label: t('manualStockUnitPortions') },
                                    { value: 'g', label: 'g' },
                                    { value: 'kg', label: 'kg' },
                                  ]}
                                />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Hairline — separates "how you count" from "how much". */}
                        {(hasOptionSizes || hasWeightedSizes) && <div className="h-px bg-[var(--line)]" />}

                        {(!hasOptionSizes || stockMode === 'shared') && (
                          <div className="flex flex-col gap-[var(--s-2)]">
                            <span className="text-fs-micro font-semibold uppercase tracking-wide text-[var(--fg-subtle)]">
                              {t('manualStockField')}
                            </span>
                            <StockValueField
                              value={stockValue}
                              integer={stockUnit !== 'kg'}
                              unitLabel={unitLabel}
                              disabled={!canEdit}
                              width="w-28"
                              onChange={(v) => {
                                setStockValue(v);
                                setDirty(true);
                              }}
                            />
                            {(stockUnit !== '' || hasVariants) && (
                              <p className="text-fs-xs text-[var(--fg-subtle)] leading-[var(--lh-base)]">
                                {stockUnit !== '' ? t('manualStockMeasureHint') : t('manualStockSharedVariants')}
                              </p>
                            )}
                          </div>
                        )}

                        {hasOptionSizes && stockMode === 'per_variant' && (
                          <div className="flex flex-col gap-[var(--s-3)]">
                            <p className="text-fs-xs text-[var(--fg-subtle)] leading-[var(--lh-base)]">
                              {stockUnit === '' ? t('manualStockPerVariantHint') : t('manualStockPerVariantWeightHint')}
                            </p>
                            <div className="flex flex-col gap-[var(--s-2)]">
                              {sizeOptions.map((o) => {
                                // In weight mode, show the whole-portion equivalent so the
                                // operator sees grams round down to sellable portions.
                                const portions =
                                  stockUnit === '' ? null : fieldToCount(o.id, perSizeField[o.id] ?? 0, stockUnit);
                                return (
                                  <div key={o.id} className="flex items-center gap-[var(--s-3)]">
                                    <span className="min-w-0 flex-1 truncate text-fs-sm font-medium text-[var(--fg)]">
                                      {o.name}
                                      {o.portion ? (
                                        <span className="text-fs-xs font-normal text-[var(--fg-subtle)]">
                                          {' '}
                                          · {o.portion}
                                        </span>
                                      ) : null}
                                    </span>
                                    {portions != null && (
                                      <span
                                        className="shrink-0 rounded-full px-[var(--s-2)] py-0.5 text-fs-micro font-semibold"
                                        style={{
                                          background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                                          color: 'var(--brand-500)',
                                        }}
                                      >
                                        ≈ {portions} {t('availabilityPortions')}
                                      </span>
                                    )}
                                    <StockValueField
                                      value={perSizeField[o.id] ?? 0}
                                      integer={stockUnit !== 'kg'}
                                      unitLabel={unitLabel}
                                      disabled={!canEdit}
                                      width="w-20"
                                      onChange={(v) => {
                                        setPerSizeField((prev) => ({ ...prev, [o.id]: v }));
                                        setDirty(true);
                                      }}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </section>

      {/* Vente & délai — immediate-sale channel ("Disponible maintenant") and
          preparation lead time. */}
      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)] flex flex-col gap-[var(--s-3)]">
        <div className="min-w-0 mb-[var(--s-2)]">
          <div className="text-fs-md font-semibold text-[var(--fg)]">{t('saleModeTitle')}</div>
          <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{t('saleModeSubtitle')}</div>
        </div>

        {saleModes.map((m) => {
          const selected = immediateSaleMode === m.value;
          const disabled = !canEdit || (m.value !== '' && !immediateOptionsEnabled);
          return (
            <button
              key={m.value || '_'}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!canEdit || disabled || m.value === immediateSaleMode) return;
                setImmediateSaleMode(m.value);
                setDirty(true);
              }}
              className={cn(
                'w-full flex items-start gap-[var(--s-3)] rounded-r-lg border p-[var(--s-4)] text-start transition-colors',
                selected ? 'border-[var(--brand-500)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]',
                disabled && 'opacity-60 cursor-not-allowed',
              )}
              style={{
                background: selected
                  ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))'
                  : 'var(--surface)',
              }}
            >
              <span
                className={cn(
                  'mt-0.5 w-4 h-4 shrink-0 rounded-full border-2 grid place-items-center',
                  selected ? 'border-[var(--brand-500)]' : 'border-[var(--line-strong)]',
                )}
              >
                {selected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-500)]" />}
              </span>
              <span className="min-w-0">
                <span className="block text-fs-sm font-semibold text-[var(--fg)]">{m.label}</span>
                <span className="block text-fs-xs text-[var(--fg-muted)] mt-1 leading-[var(--lh-base)]">
                  {m.desc}
                </span>
              </span>
            </button>
          );
        })}

        {!hasCountStock && (
          <p className="text-fs-xs text-[var(--fg-subtle)] leading-[var(--lh-base)]">
            {t('saleModeNeedsCountStock')}
          </p>
        )}

        {/* Préparation — minimum advance notice in days. */}
        <div className="mt-[var(--s-2)] pt-[var(--s-3)] border-t border-[var(--line)] flex flex-col gap-[var(--s-2)]">
          <div className="text-fs-sm font-semibold text-[var(--fg)]">{t('leadTimeTitle')}</div>
          <div className="text-fs-xs text-[var(--fg-muted)] leading-[var(--lh-base)]">{t('leadTimeHint')}</div>
          <StockValueField
            value={leadTimeDays}
            integer
            unitLabel={t('leadTimeDaysUnit')}
            disabled={!canEdit || !leadEnabled}
            width="w-16"
            onChange={(v) => {
              setLeadTimeDays(v);
              setDirty(true);
            }}
          />
          {!leadEnabled && (
            <p className="text-fs-xs text-[var(--fg-subtle)]">{t('leadTimeDisabledByImmediate')}</p>
          )}
        </div>
      </section>

      <LearnMore feature="availability" label={t('helpLearnMoreAvailability')} />
    </div>
  );
});

export default ItemAvailabilityPanel;
