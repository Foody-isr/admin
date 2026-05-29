'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { LearnMore } from '@/components/help/LearnMore';
import { InfoTip } from '@/components/help/InfoTip';

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
// • Multiple section cards using the shared `rounded-r-lg border border-[var(--line)]
//   bg-[var(--surface)] p-[var(--s-5)]` recipe, in the same vertical rhythm
//   as Composition's PricingCard / two-pane composer.
// • Field-style uppercase labels for controls, consistent with Details rows.
export default function ItemAvailabilityPanel({ rid, itemId, item, onSaved }: Props) {
  const { t } = useI18n();
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [ruleId, setRuleId] = useState<number>(item.availability_rule_id ?? 0); // 0 = inherit
  const [override, setOverride] = useState<AvailabilityOverride>(item.availability_override ?? 'auto');
  const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const overrides: { value: AvailabilityOverride; label: string }[] = [
    { value: 'auto', label: t('availabilityOverrideAuto') },
    { value: 'force_available', label: t('availabilityOverrideForceAvailable') },
    { value: 'force_sold_out', label: t('availabilityOverrideForceSoldOut') },
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

  function ruleSummary(rule: AvailabilityRule | undefined): string {
    if (!rule) return '';
    if (!rule.track) return t('availabilityAlwaysAvailableDesc');
    const parts = [t('availabilityTracksStock')];
    if (rule.low_stock_threshold > 0) parts.push(`${t('availabilityWarnAtMost')} ${rule.low_stock_threshold}`);
    parts.push(rule.out_of_stock_behavior === 'hide' ? t('availabilityHideWhenOut') : t('availabilitySoldOutBadge'));
    parts.push(rule.show_count ? t('availabilityShowsCount') : t('availabilityGenericBadge'));
    return parts.join(' · ');
  }

  const selectedRule = rules.find((r) => r.id === ruleId);
  const defaultRule = rules.find((r) => r.is_default);
  const inheritResolvesTo = ruleId === 0 ? defaultRule : null;
  const state: AvailabilityState | 'loading' =
    preview == null ? 'loading' : preview.unlimited ? 'available' : preview.state;

  const StatusIcon =
    state === 'available' ? CheckCircle2 : state === 'low' ? AlertTriangle : state === 'sold_out' ? XCircle : Info;
  // Tokens for the status pill — kept aligned with the dot colours used in
  // the items-list status chips so the visual language stays consistent.
  const statusTone: Record<AvailabilityState | 'loading', { fg: string; bgMix: string }> = {
    available:  { fg: 'var(--success-500)', bgMix: 'color-mix(in oklab, var(--success-500) 14%, transparent)' },
    low:        { fg: 'var(--warning-500)', bgMix: 'color-mix(in oklab, var(--warning-500) 14%, transparent)' },
    sold_out:   { fg: 'var(--danger-500)',  bgMix: 'color-mix(in oklab, var(--danger-500) 14%, transparent)' },
    hidden:     { fg: 'var(--fg-muted)',    bgMix: 'color-mix(in oklab, var(--fg-muted) 14%, transparent)' },
    loading:    { fg: 'var(--fg-muted)',    bgMix: 'color-mix(in oklab, var(--fg-muted) 14%, transparent)' },
  };
  const tone = statusTone[state];

  const overrideDescription: Record<AvailabilityOverride, string> = {
    auto: t('availabilityOverrideAutoDesc'),
    force_available: t('availabilityOverrideForceAvailableDesc'),
    force_sold_out: t('availabilityOverrideForceSoldOutDesc'),
  };

  const legendRows: { dot: string; label: string; desc: string }[] = [
    { dot: 'var(--success-500)', label: t('available'),    desc: t('availabilityLegendAvailableDesc') },
    { dot: 'var(--warning-500)', label: t('lowStock'),     desc: t('availabilityLegendLowDesc') },
    { dot: 'var(--danger-500)',  label: t('outOfStock'),   desc: t('availabilityLegendSoldOutDesc') },
    { dot: 'var(--fg-subtle)',   label: t('unavailable'),  desc: t('availabilityLegendInactiveDesc') },
  ];

  // Subhead block reused inside each section card — matches the inline
  // heading style used by PricingCard ("text-fs-md font-semibold" + subtitle).
  const SubHead = ({ title, subtitle, aside }: { title: string; subtitle?: string; aside?: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-[var(--s-3)] mb-[var(--s-4)]">
      <div className="min-w-0">
        <div className="text-fs-md font-semibold text-[var(--fg)]">{title}</div>
        {subtitle && (
          <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{subtitle}</div>
        )}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );

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

      {/* How it works — primer card. */}
      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
        <SubHead title={t('availabilityHowItWorksTitle')} />
        <ul className="flex flex-col gap-[var(--s-3)]">
          {[t('availabilityHowItWorksRule'), t('availabilityHowItWorksOverride')].map((line, i) => (
            <li key={i} className="flex gap-[var(--s-3)] text-fs-sm leading-[var(--lh-base)]">
              <span
                className="shrink-0 mt-0.5 w-5 h-5 rounded-r-md grid place-items-center text-fs-xs font-semibold tabular-nums"
                style={{
                  background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                  color: 'var(--brand-500)',
                }}
              >
                {i + 1}
              </span>
              <span className="text-[var(--fg-muted)] min-w-0">{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Live status — large status pill, mirrors the "callout" pattern used
          in Details (40x40 icon container + title + subtitle). */}
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

      {/* Controls — Rule picker + Override radios in one card. */}
      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)] flex flex-col gap-[var(--s-5)]">
        {/* Rule picker */}
        <div className="flex flex-col gap-[var(--s-2)]">
          <div className="flex items-center justify-between gap-[var(--s-3)]">
            <Field
              label={
                <span className="inline-flex items-center gap-1.5">
                  {t('availabilityRuleField')}
                  <InfoTip text={t('availabilityRuleHelp')} />
                </span>
              }
            >
              <Select
                value={String(ruleId)}
                disabled={busy}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setRuleId(v);
                  save({ ruleId: v });
                }}
              >
                <option value="0">{t('availabilityInherit')}</option>
                {rules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.is_default ? ` ${t('availabilityDefaultParen')}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <a
              href={`/${rid}/kitchen/availability`}
              className="shrink-0 self-end pb-[10px] inline-flex items-center gap-1 text-fs-xs font-medium text-[var(--brand-500)] hover:underline"
            >
              {t('availabilityManageRules')} <ArrowRight className="w-3 h-3" />
            </a>
          </div>
          {ruleId === 0 ? (
            <p className="text-fs-xs text-[var(--fg-subtle)]">
              {t('availabilityInheritHint')}
              {inheritResolvesTo && (
                <>
                  {' '}
                  <span className="text-[var(--fg-muted)]">
                    {t('availabilityInheritResolvesTo')}{' '}
                    <span className="font-medium text-[var(--fg)]">{inheritResolvesTo.name}</span>
                    {' · '}
                    {ruleSummary(inheritResolvesTo)}
                  </span>
                </>
              )}
            </p>
          ) : (
            <p className="text-fs-xs text-[var(--fg-subtle)]">{ruleSummary(selectedRule)}</p>
          )}
        </div>

        {/* Override — segmented radio cards. Aligned to the brand-on-select
            pattern used by TypePickerCards in the Article tab. */}
        <div className="flex flex-col gap-[var(--s-2)]">
          <span className="inline-flex items-center gap-1.5 text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('availabilityOverrideLabel')}
            <InfoTip text={t('availabilityOverrideHelp')} />
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-3)]">
            {overrides.map((o) => {
              const selected = override === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setOverride(o.value);
                    save({ override: o.value });
                  }}
                  className={cn(
                    'flex items-start gap-[var(--s-3)] rounded-r-lg border p-[var(--s-4)] text-start transition-colors',
                    selected
                      ? 'border-[var(--brand-500)]'
                      : 'border-[var(--line)] hover:border-[var(--line-strong)]',
                    busy && 'opacity-60 cursor-not-allowed',
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
                    {selected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand-500)]" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-fs-sm font-semibold text-[var(--fg)]">
                      {o.label}
                    </span>
                    <span className="block text-fs-xs text-[var(--fg-muted)] mt-1 leading-[var(--lh-base)]">
                      {overrideDescription[o.value]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

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

      {/* Legend — reference card. */}
      <section className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)]">
        <SubHead title={t('availabilityLegendTitle')} />
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-[var(--s-5)] gap-y-[var(--s-3)]">
          {legendRows.map((row) => (
            <li key={row.label} className="flex items-start gap-[var(--s-3)]">
              <span
                className="mt-1.5 size-2.5 shrink-0 rounded-full"
                style={{ background: row.dot }}
              />
              <span className="min-w-0 text-fs-sm">
                <span className="font-medium text-[var(--fg)]">{row.label}</span>
                <span className="block text-fs-xs text-[var(--fg-muted)] mt-0.5">{row.desc}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <LearnMore feature="availability" label={t('helpLearnMoreAvailability')} />
    </div>
  );
}
