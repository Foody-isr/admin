'use client';

import { CalendarCheck, Trash2 } from 'lucide-react';
import { Field, Input, Select } from '@/components/ds';
import type { BatchCycleSummary, BatchFulfillmentDay } from '@/lib/api';

export const WEEKDAYS_FR = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

/** A pill switch — the on/off control shared by service toggles, pause and rules. */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
      style={{ background: checked ? 'var(--brand-500)' : 'var(--surface-3)' }}
    >
      <span
        className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

/** A labelled row with a trailing switch — used for the order-mode toggles. */
export function ServiceToggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-center justify-between gap-[var(--s-4)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md border border-[var(--line)] cursor-pointer hover:border-[var(--line-strong)] transition-colors"
      style={{
        background: checked
          ? 'color-mix(in oklab, var(--brand-500) 6%, var(--surface))'
          : 'var(--surface)',
      }}
    >
      <div className="min-w-0">
        <div className="text-fs-sm font-medium text-[var(--fg)]">{label}</div>
        <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{sub}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </label>
  );
}

/** A selectable card — used for the three pre-order modes. */
export function ModeCard({
  title,
  desc,
  selected,
  onClick,
}: {
  title: string;
  desc: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="text-left p-[var(--s-4)] rounded-r-md border transition-colors h-full"
      style={{
        background: selected
          ? 'color-mix(in oklab, var(--brand-500) 10%, var(--surface))'
          : 'var(--surface)',
        borderColor: selected ? 'var(--brand-500)' : 'var(--line)',
      }}
    >
      <div className="text-fs-sm font-semibold text-[var(--fg)]">{title}</div>
      <div className="text-fs-xs text-[var(--fg-subtle)] mt-1">{desc}</div>
    </button>
  );
}

/** Maps the app locale to a BCP-47 tag for date formatting. */
function localeTag(locale: string): string {
  return locale === 'he' ? 'he-IL' : locale === 'fr' ? 'fr-FR' : 'en-US';
}

/** Formats an ISO datetime as a short weekday + day + month, e.g. "ven. 24 juil.". */
function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(localeTag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * BatchCyclePreview reflects the actual opening / cutoff / delivery dates the
 * batch config produces, computed by the server. The first row is the cycle
 * customers are ordering for right now — seeing its delivery date is what catches
 * a cutoff that silently pushes delivery a week out (e.g. cutoff on the same day
 * as the opening). There is no reliable heuristic for that misconfiguration
 * because a legitimate "order this week, deliver next week" schedule looks
 * identical — so we show the truth rather than guess.
 */
export function BatchCyclePreview({
  cycles,
  locale,
  t,
}: {
  cycles: BatchCycleSummary[];
  locale: string;
  t: (key: string) => string;
}) {
  if (cycles.length === 0) return null;

  return (
    <div
      className="rounded-r-md border border-[var(--line)] overflow-hidden"
      style={{ background: 'var(--surface-2)' }}
    >
      <div className="flex items-center gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-3)] border-b border-[var(--line)]">
        <CalendarCheck className="w-4 h-4 text-[var(--brand-500)]" />
        <div className="text-fs-sm font-semibold text-[var(--fg)]">
          {t('batchPreviewTitle') || 'Aperçu des prochaines commandes'}
        </div>
      </div>
      <div className="px-[var(--s-4)] py-[var(--s-3)] text-fs-xs text-[var(--fg-subtle)]">
        {t('batchPreviewHint') ||
          'Dates que verront vos clients. Vérifiez que le jour de livraison correspond à ce que vous attendez.'}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-[var(--s-4)] gap-y-[var(--s-2)] px-[var(--s-4)] pb-[var(--s-2)] text-fs-xs font-medium text-[var(--fg-muted)]">
        <div>{t('batchPreviewOrdering') || 'Commandes'}</div>
        <div>{t('batchPreviewDelivery') || 'Retrait / livraison'}</div>
      </div>
      <ul>
        {cycles.map((cy, i) => {
          const delivery = cy.fulfillment_days.map((d) => shortDate(d.date, locale)).join(' · ');
          return (
            <li
              key={i}
              className="grid grid-cols-[auto_1fr] items-baseline gap-x-[var(--s-4)] px-[var(--s-4)] py-[var(--s-3)] border-t border-[var(--line)]"
              style={i === 0 ? { background: 'color-mix(in oklab, var(--brand-500) 6%, transparent)' } : undefined}
            >
              <div className="text-fs-sm text-[var(--fg)] whitespace-nowrap">
                {shortDate(cy.open_at, locale)}
                <span className="text-[var(--fg-subtle)]"> → </span>
                {shortDate(cy.cutoff_at, locale)}
              </div>
              <div className="flex items-center gap-[var(--s-2)] min-w-0">
                <span className="text-fs-sm font-semibold text-[var(--fg)] truncate">
                  {delivery || (t('batchPreviewNoDay') || '—')}
                </span>
                {i === 0 && (
                  <span
                    className="shrink-0 text-fs-xs px-[var(--s-2)] py-0.5 rounded-full"
                    style={{ background: 'var(--brand-500)', color: 'white' }}
                  >
                    {t('batchPreviewCurrent') || 'Prochaine'}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One configurable batch fulfillment day (pickup + delivery windows). */
export function FulfillmentDayRow({
  value,
  used,
  onChange,
  onRemove,
  t,
}: {
  value: BatchFulfillmentDay;
  used: Set<number>;
  onChange: (patch: Partial<BatchFulfillmentDay>) => void;
  onRemove: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      className="flex flex-wrap items-end gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md border border-[var(--line)]"
      style={{ background: 'var(--surface-2)' }}
    >
      <Field label={t('day') || 'Jour'}>
        <Select
          value={String(value.day)}
          onChange={(e) => onChange({ day: Number(e.target.value) })}
        >
          {WEEKDAYS_FR.map((label, i) => (
            <option key={i} value={i} disabled={used.has(i) && i !== value.day}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={t('batchFulfillmentPickupWindow') || 'Fenêtre retrait'}>
        <div className="flex items-center gap-[var(--s-2)]">
          <Input
            type="time"
            value={value.pickup_start ?? ''}
            onChange={(e) => onChange({ pickup_start: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
          <span className="text-[var(--fg-subtle)]">→</span>
          <Input
            type="time"
            value={value.pickup_end ?? ''}
            onChange={(e) => onChange({ pickup_end: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
        </div>
      </Field>

      <Field label={t('batchFulfillmentDeliveryWindow') || 'Fenêtre livraison'}>
        <div className="flex items-center gap-[var(--s-2)]">
          <Input
            type="time"
            value={value.delivery_start ?? ''}
            onChange={(e) => onChange({ delivery_start: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
          <span className="text-[var(--fg-subtle)]">→</span>
          <Input
            type="time"
            value={value.delivery_end ?? ''}
            onChange={(e) => onChange({ delivery_end: e.target.value })}
            className="font-mono text-center"
            style={{ width: 100 }}
          />
        </div>
      </Field>

      <button
        type="button"
        onClick={onRemove}
        className="self-end p-2 rounded-r-md text-[var(--fg-muted)] hover:text-[var(--danger-500)] transition-colors"
        aria-label={t('remove') || 'Supprimer'}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
