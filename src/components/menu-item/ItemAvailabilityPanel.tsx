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

  // Hide deprecated "Always available"-style rules (track=false, non-default)
  // from the picker — their effect is reachable via the "Toujours disponible"
  // mode. Keep them listed when an existing item still points to one so the
  // owner can see what's selected before switching away.
  const visibleRules = useMemo(
    () => rules.filter((r) => r.id === ruleId || r.is_default || r.track !== false),
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
