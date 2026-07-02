'use client';

import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { BatchFulfillmentConfigResponse } from '@/lib/api';
import {
  buildFulfillmentTargets,
  type FulfillmentValue,
} from '@/lib/orders/fulfillment';

interface FulfillmentSectionProps {
  orderType: 'pickup' | 'delivery';
  batchConfig: BatchFulfillmentConfigResponse | null;
  value: FulfillmentValue;
  onChange: (v: FulfillmentValue) => void;
  /** Allow the Immédiate option (default true). */
  allowImmediate?: boolean;
}

function TimingTile({
  active, onClick, label,
}: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border p-[var(--s-3)] text-start text-fs-sm font-medium transition-colors',
        active
          ? 'border-[var(--brand-500)] bg-[var(--surface-2)] text-[var(--fg)] shadow-1 ring-1 ring-[var(--brand-500)]'
          : 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg-muted)] hover:border-[var(--fg-subtle)]',
      )}
    >
      {label}
    </button>
  );
}

// Locale-formatted fulfillment day ("vendredi 10 juillet") — the server's
// day_name is English-only and the raw ISO date reads as data, not language.
function formatTargetDay(iso: string, locale: string): string {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

export function FulfillmentSection({
  orderType, batchConfig, value, onChange, allowImmediate = true,
}: FulfillmentSectionProps) {
  const { t, locale } = useI18n();
  const targets = useMemo(
    () => buildFulfillmentTargets(batchConfig, orderType),
    [batchConfig, orderType],
  );
  const hasTargets = targets.length > 0;

  function selectTarget(date: string) {
    const target = targets.find((x) => x.id === date);
    onChange({
      timing: 'scheduled',
      scheduledFor: target?.date ?? date,
      windowStart: target?.windowStart,
      windowEnd: target?.windowEnd,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
        {t('fulfillment')}
      </span>

      {allowImmediate && (
        <div className="flex gap-2">
          <TimingTile
            active={value.timing === 'immediate'}
            onClick={() => onChange({ timing: 'immediate' })}
            label={t('fulfillmentImmediate')}
          />
          <TimingTile
            active={value.timing === 'scheduled'}
            onClick={() =>
              hasTargets
                ? selectTarget(value.scheduledFor ?? targets[0].id)
                : onChange({ timing: 'scheduled', scheduledFor: value.scheduledFor })
            }
            label={t('fulfillmentScheduled')}
          />
        </div>
      )}

      {value.timing === 'immediate' && (
        <p className="text-fs-xs text-[var(--fg-muted)]">{t('fulfillmentImmediateHint')}</p>
      )}

      {value.timing === 'scheduled' && hasTargets && (
        <label className="flex flex-col gap-1 text-fs-xs text-[var(--fg-muted)]">
          {t('fulfillmentDay')}
          <select
            value={value.scheduledFor ?? targets[0].id}
            onChange={(e) => selectTarget(e.target.value)}
            className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-2)] text-fs-sm text-[var(--fg)]"
          >
            {targets.map((tg) => (
              <option key={tg.id} value={tg.id}>
                {`${formatTargetDay(tg.date, locale)}${tg.windowStart ? ` · ${tg.windowStart}-${tg.windowEnd}` : ''}`}
              </option>
            ))}
          </select>
        </label>
      )}

      {value.timing === 'scheduled' && !hasTargets && (
        <div className="flex flex-col gap-2">
          {batchConfig?.enabled && (
            <p className="text-fs-xs text-[var(--fg-muted)]">
              {t('fulfillmentNoDayForType').replace('{type}', orderType === 'delivery' ? t('delivery') : t('pickup'))}
            </p>
          )}
          <label className="flex flex-col gap-1 text-fs-xs text-[var(--fg-muted)]">
            {t('fulfillmentDate')}
            <input
              type="date"
              value={value.scheduledFor ?? ''}
              onChange={(e) =>
                onChange({ ...value, timing: 'scheduled', scheduledFor: e.target.value })
              }
              className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-2)] text-fs-sm text-[var(--fg)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-fs-xs text-[var(--fg-muted)]">
              {t('fulfillmentFrom')}
              <input
                type="time"
                value={value.windowStart ?? ''}
                onChange={(e) => onChange({ ...value, windowStart: e.target.value })}
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-2)] text-fs-sm text-[var(--fg)]"
              />
            </label>
            <label className="flex flex-col gap-1 text-fs-xs text-[var(--fg-muted)]">
              {t('fulfillmentTo')}
              <input
                type="time"
                value={value.windowEnd ?? ''}
                onChange={(e) => onChange({ ...value, windowEnd: e.target.value })}
                className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-2)] text-fs-sm text-[var(--fg)]"
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
