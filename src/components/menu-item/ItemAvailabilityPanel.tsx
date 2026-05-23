'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { Badge, Button, Field, Section, Select } from '@/components/ds';
import { Switch } from '@/components/ui/switch';
import { useI18n } from '@/lib/i18n';

interface Props {
  rid: number;
  itemId: number;
  item: MenuItem;
  /** Called after a successful save so the parent can refresh its copy. */
  onSaved?: () => void;
}

const STATE_TONE: Record<AvailabilityState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  low: 'warning',
  sold_out: 'danger',
  hidden: 'neutral',
};

export default function ItemAvailabilityPanel({ rid, itemId, item, onSaved }: Props) {
  const { t } = useI18n();
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [ruleId, setRuleId] = useState<number>(item.availability_rule_id ?? 0); // 0 = inherit
  const [override, setOverride] = useState<AvailabilityOverride>(item.availability_override ?? 'auto');
  const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stateLabel: Record<AvailabilityState, string> = {
    available: t('availabilityStateAvailable'),
    low: t('availabilityStateLow'),
    sold_out: t('availabilityStateSoldOut'),
    hidden: t('availabilityStateHidden'),
  };

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

  // Persist a change to rule/override, then refresh the live preview.
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

  return (
    <Section title={t('availability')}>
      <div className="flex flex-col gap-4 max-w-xl">
        {/* Live preview */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-fs-sm">
          {preview == null ? (
            <span className="text-[var(--fg-muted)]">{t('availabilityComputing')}</span>
          ) : preview.unlimited ? (
            <span className="text-[var(--fg-muted)]">{t('availabilityNoTrackedRecipe')}</span>
          ) : (
            <span className="text-[var(--fg)]">
              {t('availabilityBuildableNow')} <strong>{preview.buildable}</strong> {t('availabilityPortions')}
              {preview.bottleneck && (
                <>
                  , {t('availabilityLimitedBy')} <strong>{preview.bottleneck}</strong>
                </>
              )}
            </span>
          )}
          {preview && (
            <Badge tone={STATE_TONE[preview.state]} className="ml-2">
              {stateLabel[preview.state]}
            </Badge>
          )}
        </div>

        <Field label={t('availabilityRuleField')}>
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

        <div>
          <span className="block text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)] mb-1.5">
            {t('availabilityOverrideLabel')}
          </span>
          <div className="flex gap-2">
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
        </div>

        {error && <span className="text-fs-sm text-red-400">{error}</span>}
      </div>
    </Section>
  );
}
