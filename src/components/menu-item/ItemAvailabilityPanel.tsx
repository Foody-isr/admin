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

const STATE_LABEL: Record<AvailabilityState, string> = {
  available: 'Available',
  low: 'Low stock',
  sold_out: 'Sold out',
  hidden: 'Hidden',
};

const OVERRIDES: { value: AvailabilityOverride; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'force_available', label: 'Always available' },
  { value: 'force_sold_out', label: 'Force sold out' },
];

export default function ItemAvailabilityPanel({ rid, itemId, item, onSaved }: Props) {
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [ruleId, setRuleId] = useState<number>(item.availability_rule_id ?? 0); // 0 = inherit
  const [override, setOverride] = useState<AvailabilityOverride>(item.availability_override ?? 'auto');
  const [preview, setPreview] = useState<AvailabilityPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError(e?.message || 'Could not save');
      } finally {
        setBusy(false);
      }
    },
    [rid, itemId, ruleId, override, loadPreview, onSaved],
  );

  return (
    <Section title="Availability">
      <div className="flex flex-col gap-4 max-w-xl">
        {/* Live preview */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5 text-fs-sm">
          {preview == null ? (
            <span className="text-[var(--fg-muted)]">Computing…</span>
          ) : preview.unlimited ? (
            <span className="text-[var(--fg-muted)]">No tracked recipe — always available.</span>
          ) : (
            <span className="text-[var(--fg)]">
              Buildable now: <strong>{preview.buildable}</strong> portion{preview.buildable === 1 ? '' : 's'}
              {preview.bottleneck && <> — limited by <strong>{preview.bottleneck}</strong></>}
            </span>
          )}
          {preview && (
            <Badge tone={STATE_TONE[preview.state]} className="ml-2">
              {STATE_LABEL[preview.state]}
            </Badge>
          )}
        </div>

        <Field label="Availability rule">
          <Select
            value={String(ruleId)}
            disabled={busy}
            onChange={(e) => {
              const v = Number(e.target.value);
              setRuleId(v);
              save({ ruleId: v });
            }}
          >
            <option value="0">Inherit (category / default)</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.is_default ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="block text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)] mb-1.5">
            Override (beats the computed result)
          </span>
          <div className="flex gap-2">
            {OVERRIDES.map((o) => (
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
