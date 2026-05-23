'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
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
import { Button, Section, Select } from '@/components/ds';
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

  // Plain-language summary of the currently selected rule, shown under the picker.
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
  const state: AvailabilityState | 'loading' = preview == null ? 'loading' : preview.unlimited ? 'available' : preview.state;

  const StatusIcon =
    state === 'available' ? CheckCircle2 : state === 'low' ? AlertTriangle : state === 'sold_out' ? XCircle : Info;
  const iconColor =
    state === 'available'
      ? 'text-emerald-500'
      : state === 'low'
        ? 'text-amber-500'
        : state === 'sold_out'
          ? 'text-red-400'
          : 'text-[var(--fg-muted)]';

  return (
    <Section title={t('availability')}>
      <div className="flex max-w-xl flex-col gap-4">
        <p className="-mt-1 text-fs-sm text-[var(--fg-muted)]">{t('availabilityPanelIntro')}</p>

        {/* Live status */}
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
          <StatusIcon className={cn('mt-0.5 size-4 shrink-0', iconColor)} />
          <div className="min-w-0 text-fs-sm">
            {preview == null ? (
              <span className="text-[var(--fg-muted)]">{t('availabilityComputing')}</span>
            ) : preview.unlimited ? (
              <>
                <div className="font-medium text-[var(--fg)]">{t('availabilityStateAvailable')}</div>
                <div className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">{t('availabilityNoRecipeHint')}</div>
              </>
            ) : (
              <>
                <div className="font-medium text-[var(--fg)]">
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
                <div className="mt-0.5 text-fs-xs text-[var(--fg-muted)]">
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

        {/* Rule picker */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
              {t('availabilityRuleField')}
            </span>
            <InfoTip text={t('availabilityRuleHelp')} />
          </div>
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
          <p className="mt-1.5 text-fs-xs text-[var(--fg-muted)]">
            {ruleId === 0 ? t('availabilityInheritHint') : ruleSummary(selectedRule)}
          </p>
        </div>

        {/* Override */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
              {t('availabilityOverrideLabel')}
            </span>
            <InfoTip text={t('availabilityOverrideHelp')} />
          </div>
          <div className="flex flex-wrap gap-2">
            {overrides.map((o) => (
              <Button
                key={o.value}
                size="sm"
                variant={override === o.value ? 'primary' : 'ghost'}
                disabled={busy}
                onClick={() => {
                  setOverride(o.value);
                  save({ override: o.value });
                }}
              >
                {o.label}
              </Button>
            ))}
          </div>
          <p className="mt-1.5 text-fs-xs text-[var(--fg-muted)]">{t('availabilityOverrideHint')}</p>
        </div>

        {error && <span className="text-fs-sm text-red-400">{error}</span>}

        <LearnMore feature="availability" label={t('helpLearnMoreAvailability')} className="mt-1" />
      </div>
    </Section>
  );
}
