'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface Props {
  rid: number;
  itemId: number;
  item: MenuItem;
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
export default function ItemAvailabilityPanel({ rid, itemId, item, onSaved }: Props) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
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
  // Unit of the predefined count. Seed from the saved unit / mode.
  const initialUnit: StockUnit =
    item.stock_unit === 'kg' ? 'kg' : item.stock_unit === 'g' || item.stock_mode === 'measure' ? 'g' : '';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const save = useCallback(
    async (next: { ruleId?: number; override?: AvailabilityOverride }) => {
      setBusy(true);
      setError(null);
      try {
        await updateMenuItem(rid, itemId, {
          availability_rule_id: next.ruleId ?? ruleId, // 0 clears to inherit
          availability_override: next.override ?? override,
        });
        await loadPreview();
        onSaved?.();
      } catch (e: any) {
        setError(e?.message || t('availabilityCouldNotSave'));
      } finally {
        setBusy(false);
      }
    },
    [rid, itemId, ruleId, override, loadPreview, onSaved, t],
  );

  // Persist the SHARED predefined stock. `null` stops tracking. Otherwise the unit
  // picks the server mode: portions -> "count" (the value is a plain unit count);
  // weight -> "measure" (the value is stored in the base unit, grams, and each
  // ordered size deducts its own weight). Always sends stock_mode so leaving
  // 'per_variant' makes the server drop the now-stale per-size counts.
  const saveSharedStock = useCallback(
    async (val: number | null, unit: StockUnit) => {
      setBusy(true);
      setError(null);
      try {
        if (val == null) {
          await updateMenuItem(rid, itemId, { stock_quantity: null, stock_mode: '', stock_unit: '' });
        } else if (unit === '') {
          await updateMenuItem(rid, itemId, {
            stock_quantity: Math.max(0, Math.round(val)),
            stock_mode: 'count',
            stock_unit: '',
          });
        } else {
          await updateMenuItem(rid, itemId, {
            stock_quantity: Math.max(0, Math.round(toBaseUnit(val, unit))), // base grams
            stock_mode: 'measure',
            stock_unit: unit,
          });
        }
        await loadPreview();
        onSaved?.();
      } catch (e: any) {
        setError(e?.message || t('availabilityCouldNotSave'));
      } finally {
        setBusy(false);
      }
    },
    [rid, itemId, loadPreview, onSaved, t],
  );

  // Switch to per-size stock: push every size's count, then set the mode (clearing
  // the shared count). Order matters — an unset size defaults to 0 (sold out)
  // server-side, so we seed all sizes before flipping the mode. `unit` persists as
  // a display hint; the per-option values stay portion counts either way.
  const saveStockPerVariant = useCallback(
    async (unit: StockUnit, fields: Record<number, number>) => {
      if (!sizeSet) return;
      setBusy(true);
      setError(null);
      try {
        await Promise.all(
          sizeOptions.map((o) =>
            setItemOptionStock(rid, sizeSet.id, itemId, o.id, fieldToCount(o.id, fields[o.id] ?? 0, unit)),
          ),
        );
        await updateMenuItem(rid, itemId, { stock_mode: 'per_variant', stock_quantity: null, stock_unit: unit });
        await loadPreview();
        onSaved?.();
      } catch (e: any) {
        setError(e?.message || t('availabilityCouldNotSave'));
      } finally {
        setBusy(false);
      }
    },
    [rid, itemId, sizeSet, sizeOptions, fieldToCount, loadPreview, onSaved, t],
  );

  // Persist a single size's count (field blur) without disturbing the others.
  const saveSizeCount = useCallback(
    async (optionId: number, val: number, unit: StockUnit) => {
      if (!sizeSet) return;
      setBusy(true);
      setError(null);
      try {
        await setItemOptionStock(rid, sizeSet.id, itemId, optionId, fieldToCount(optionId, val, unit));
        await loadPreview();
        onSaved?.();
      } catch (e: any) {
        setError(e?.message || t('availabilityCouldNotSave'));
      } finally {
        setBusy(false);
      }
    },
    [rid, itemId, sizeSet, fieldToCount, loadPreview, onSaved, t],
  );

  // Change the display unit and re-persist. Per-size converts cleanly through the
  // stable portion count. Shared portions<->weight can't be inferred (a gram
  // budget has no fixed portion count without a size mix), so it resets to 0;
  // weight<->weight (g<->kg) converts.
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
        saveSharedStock(next, newUnit);
      } else {
        const nextFields: Record<number, number> = {};
        for (const o of sizeOptions) {
          const count = fieldToCount(o.id, perSizeField[o.id] ?? 0, stockUnit);
          nextFields[o.id] = countToField(o.id, count, newUnit);
        }
        setStockUnit(newUnit);
        setPerSizeField(nextFields);
        saveStockPerVariant(newUnit, nextFields);
      }
    },
    [
      canEdit,
      stockUnit,
      stockMode,
      stockValue,
      sizeOptions,
      perSizeField,
      fieldToCount,
      countToField,
      saveSharedStock,
      saveStockPerVariant,
    ],
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
                disabled={busy || !canEdit}
                onClick={() => {
                  if (!canEdit) return;
                  setOverride(m.value);
                  save({ override: m.value });
                }}
                className={cn(
                  'w-full flex items-start gap-[var(--s-3)] rounded-r-lg border p-[var(--s-4)] text-start transition-colors',
                  selected
                    ? 'border-[var(--brand-500)]'
                    : 'border-[var(--line)] hover:border-[var(--line-strong)]',
                  busy && 'opacity-60 cursor-not-allowed',
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
                        disabled={busy || !canEdit}
                        onChange={(e) => {
                          if (!canEdit) return;
                          const v = Number(e.target.value);
                          setRuleId(v);
                          save({ ruleId: v });
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
                        disabled={busy || !canEdit}
                        onChange={(e) => {
                          if (!canEdit) return;
                          const on = e.target.checked;
                          setStockTracked(on);
                          if (on) {
                            // Always (re)start in shared mode; per-size is opt-in below.
                            setStockMode('shared');
                            saveSharedStock(stockValue, stockUnit);
                          } else {
                            saveSharedStock(null, '');
                          }
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
                      <div className="ms-[calc(1rem+var(--s-3))] flex flex-col gap-[var(--s-3)]">
                        {/* Shared vs per-size selector — only for items whose first
                            option set gives a set of trackable sizes. */}
                        {hasOptionSizes && (
                          <div className="inline-flex w-fit rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] p-0.5">
                            {(['shared', 'per_variant'] as const).map((m) => (
                              <button
                                key={m}
                                type="button"
                                disabled={busy || !canEdit}
                                onClick={() => {
                                  if (!canEdit || stockMode === m) return;
                                  setStockMode(m);
                                  if (m === 'shared') saveSharedStock(stockValue, stockUnit);
                                  else saveStockPerVariant(stockUnit, perSizeField);
                                }}
                                className={cn(
                                  'px-3 h-8 rounded-[5px] text-fs-xs font-medium transition-colors',
                                  stockMode === m
                                    ? 'bg-[var(--brand-500)] text-white'
                                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
                                )}
                              >
                                {t(m === 'shared' ? 'manualStockModeShared' : 'manualStockModePerVariant')}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Unit selector — Portions vs weight. Only offered when
                            every size has a parseable weight, so weight always
                            deducts correctly. */}
                        {hasWeightedSizes && (
                          <div className="flex items-center gap-[var(--s-2)]">
                            <span className="text-fs-xs text-[var(--fg-muted)]">{t('manualStockUnitLabel')}</span>
                            <div className="inline-flex rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] p-0.5">
                              {(['', 'g', 'kg'] as StockUnit[]).map((u) => (
                                <button
                                  key={u || 'portions'}
                                  type="button"
                                  disabled={busy || !canEdit}
                                  onClick={() => changeUnit(u)}
                                  className={cn(
                                    'px-3 h-8 rounded-[5px] text-fs-xs font-medium transition-colors',
                                    stockUnit === u
                                      ? 'bg-[var(--brand-500)] text-white'
                                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
                                  )}
                                >
                                  {u === '' ? t('manualStockUnitPortions') : u}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {(!hasOptionSizes || stockMode === 'shared') && (
                          <div>
                            <Field label={t('manualStockField')}>
                              <div className="flex items-center gap-[var(--s-2)]">
                                <NumberInput
                                  integer={stockUnit !== 'kg'}
                                  min={0}
                                  value={stockValue}
                                  disabled={busy || !canEdit}
                                  onChange={setStockValue}
                                  onBlur={() => {
                                    if (canEdit) saveSharedStock(stockValue, stockUnit);
                                  }}
                                  placeholder="0"
                                  className="w-28 px-3 h-10 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm focus:outline-none focus:border-[var(--brand-500)]"
                                />
                                <span className="text-fs-xs text-[var(--fg-muted)]">{unitLabel}</span>
                              </div>
                            </Field>
                            {stockUnit !== '' ? (
                              <p className="text-fs-xs text-[var(--fg-subtle)] mt-[var(--s-2)]">
                                {t('manualStockMeasureHint')}
                              </p>
                            ) : (
                              hasVariants && (
                                <p className="text-fs-xs text-[var(--fg-subtle)] mt-[var(--s-2)]">
                                  {t('manualStockSharedVariants')}
                                </p>
                              )
                            )}
                          </div>
                        )}

                        {hasOptionSizes && stockMode === 'per_variant' && (
                          <div className="flex flex-col gap-[var(--s-2)]">
                            <p className="text-fs-xs text-[var(--fg-subtle)]">
                              {stockUnit === '' ? t('manualStockPerVariantHint') : t('manualStockPerVariantWeightHint')}
                            </p>
                            {sizeOptions.map((o) => {
                              // In weight mode, show the whole-portion equivalent so the
                              // operator sees that grams round down to sellable portions.
                              const portions =
                                stockUnit === '' ? null : fieldToCount(o.id, perSizeField[o.id] ?? 0, stockUnit);
                              return (
                                <div key={o.id} className="flex items-center gap-[var(--s-3)]">
                                  <span className="min-w-0 flex-1 truncate text-fs-sm text-[var(--fg)]">
                                    {o.name}
                                    {o.portion ? (
                                      <span className="text-[var(--fg-subtle)]"> · {o.portion}</span>
                                    ) : null}
                                  </span>
                                  {portions != null && (
                                    <span className="shrink-0 text-fs-xs text-[var(--fg-subtle)]">
                                      = {portions} {t('availabilityPortions')}
                                    </span>
                                  )}
                                  <NumberInput
                                    integer={stockUnit !== 'kg'}
                                    min={0}
                                    value={perSizeField[o.id] ?? 0}
                                    disabled={busy || !canEdit}
                                    onChange={(v) => setPerSizeField((prev) => ({ ...prev, [o.id]: v }))}
                                    onBlur={() => {
                                      if (canEdit) saveSizeCount(o.id, perSizeField[o.id] ?? 0, stockUnit);
                                    }}
                                    placeholder="0"
                                    className="w-24 px-3 h-10 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm focus:outline-none focus:border-[var(--brand-500)]"
                                  />
                                  <span className="w-16 shrink-0 text-fs-xs text-[var(--fg-muted)]">
                                    {unitLabel}
                                  </span>
                                </div>
                              );
                            })}
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

        {error && (
          <div
            className="rounded-r-md border p-[var(--s-3)] text-fs-sm"
            style={{
              background: 'color-mix(in oklab, var(--danger-500) 8%, transparent)',
              borderColor: 'color-mix(in oklab, var(--danger-500) 30%, transparent)',
              color: 'var(--danger-500)',
            }}
          >
            {error}
          </div>
        )}
      </section>

      <LearnMore feature="availability" label={t('helpLearnMoreAvailability')} />
    </div>
  );
}
