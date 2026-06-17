'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, ArrowRight } from 'lucide-react';
import {
  listAvailabilityRules,
  previewItemAvailability,
  updateMenuItem,
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
  const [stockTracked, setStockTracked] = useState<boolean>(item.stock_quantity != null);
  const [stockValue, setStockValue] = useState<number>(item.stock_quantity ?? 0);
  // Predefined stock is one shared counter (−1 per item sold, any size), so flag
  // items that have size variants/options to show the "shared across sizes" note.
  const hasVariants =
    (item.variant_groups?.some((g) => (g.variants?.length ?? 0) > 0) ?? false) ||
    (item.option_sets?.some((os) => (os.options?.length ?? 0) > 0) ?? false);
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

  // Persist the manual stock count. `null` stops tracking (the item goes back
  // to unlimited unless a recipe constrains it); a number sets the current
  // count. Reuses the same updateMenuItem endpoint as the rule/override save.
  const saveStock = useCallback(
    async (q: number | null) => {
      setBusy(true);
      setError(null);
      try {
        await updateMenuItem(rid, itemId, { stock_quantity: q });
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
                          saveStock(on ? stockValue : null);
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
                      <div className="ms-[calc(1rem+var(--s-3))]">
                        <Field label={t('manualStockField')}>
                          <div className="flex items-center gap-[var(--s-2)]">
                            <NumberInput
                              integer
                              min={0}
                              value={stockValue}
                              disabled={busy || !canEdit}
                              onChange={setStockValue}
                              onBlur={() => {
                                if (canEdit) saveStock(stockValue);
                              }}
                              placeholder="0"
                              className="w-28 px-3 h-10 bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm focus:outline-none focus:border-[var(--brand-500)]"
                            />
                            <span className="text-fs-xs text-[var(--fg-muted)]">
                              {t('availabilityPortions')}
                            </span>
                          </div>
                        </Field>
                        {hasVariants && (
                          <p className="text-fs-xs text-[var(--fg-subtle)] mt-[var(--s-2)]">
                            {t('manualStockSharedVariants')}
                          </p>
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
