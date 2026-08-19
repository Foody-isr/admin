'use client';

import { Fragment } from 'react';
import { EditIcon } from 'lucide-react';
import { Badge } from '@/components/ds';
import type { OrderItem } from '@/lib/api';
import { formatGrams, formatPricePerKg, weightDrift } from '@/lib/orders/format-weight';
import { Money } from '../primitives/Money';

/**
 * The ticket grid. One template, reused by every row of a line.
 *
 *   28px  quantity, in the margin, right-aligned
 *   1fr   what it is
 *   92px  what it costs, right-aligned — fits ₪1,234.00 at 13px mono
 *
 * Modifiers, weights and notes are SIBLING rows of this same grid rather than
 * nested markup, each emitting an empty quantity cell, its label, and either a
 * figure or an empty cell. That is what makes a modifier's price land on the
 * same vertical axis as the line total above it, with no alignment to maintain.
 */
export const TICKET_GRID =
  'grid grid-cols-[28px_minmax(0,1fr)_92px] gap-x-[var(--s-3)] items-baseline';

/**
 * Variant chip text: the variant name plus the snapshotted portion, deduped.
 * "Normal" + "250 g" reads "Normal · 250 g", but a variant already named "250g"
 * does not repeat itself.
 */
export function variantChipText(item: {
  selected_variant_name?: string;
  variant_portion?: string;
}): string | null {
  const name = (item.selected_variant_name || '').trim();
  const portion = (item.variant_portion || '').trim();
  if (!name && !portion) return null;
  const nameIsNumericPortion = /^\d+(?:[.,]\d+)?\s*(?:g|kg)?$/i.test(name);
  if (!portion || nameIsNumericPortion) return name || portion;
  if (!name) return portion;
  return `${name} · ${portion}`;
}

/** Empty grid cell. */
const Gap = () => <span aria-hidden />;

/**
 * Modifier rows.
 *
 * The sign carries the meaning: `+` for an addition, `−` (U+2212, never a
 * hyphen) for everything else, matching print-ticket.ts exactly so a screen and
 * a printed kitchen ticket cannot disagree. Colour is deliberately NOT used —
 * eight coloured chips on a long ticket is noise. Emphasis instead: additions
 * in --fg, removals muted, and a paid delta's price at full strength.
 *
 * Before this, `m.name` was rendered alone in a neutral pill, so "Sans
 * coriandre" and "Extra citron +₪4" looked identical.
 */
export function ModifierRows({ item }: { item: OrderItem }) {
  if (!item.modifiers?.length) return null;
  return (
    <>
      {item.modifiers.map((m) => {
        const isAdd = m.action === 'add';
        const delta = m.price_delta ?? 0;
        return (
          <Fragment key={m.id}>
            <Gap />
            <span
              className={`text-fs-xs ps-[var(--s-2)] ${
                isAdd ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'
              }`}
            >
              <span className="num me-1">{isAdd ? '+' : '−'}</span>
              {m.name}
            </span>
            {delta ? (
              <Money value={delta} signed className="text-fs-xs text-end text-[var(--fg)]" />
            ) : (
              <Gap />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Weight row, for a by-weight line.
 *
 * `pricing_mode`, `price_per_kg`, `estimated_weight_grams` and
 * `actual_weight_grams` sit on every such line and were rendered nowhere — the
 * numbers were only visible inside the confirm-weights modal, so a ₪124.60
 * salmon line said nothing about being 1.4 kg at ₪89/kg.
 *
 * An unweighed line is prefixed "~" and muted; a weighed one is at full
 * strength. A weighed line more than 5% off its estimate appends the gap,
 * because that is the difference staff will have to explain.
 */
export function WeightRow({ item }: { item: OrderItem }) {
  if (item.pricing_mode !== 'by_weight') return null;

  const weighed = typeof item.actual_weight_grams === 'number';
  const grams = formatGrams(weighed ? item.actual_weight_grams : item.estimated_weight_grams);
  const perKg = formatPricePerKg(item.price_per_kg);
  if (!grams && !perKg) return null;

  const drift = weightDrift(item.estimated_weight_grams, item.actual_weight_grams);

  return (
    <>
      <Gap />
      <span
        className={`num text-fs-xs ps-[var(--s-2)] ${
          weighed ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'
        }`}
      >
        {grams && <>{weighed ? '' : '~'}{grams}</>}
        {grams && perKg && <span className="opacity-40"> · </span>}
        {perKg}
        {drift?.significant && (
          <span className="ms-1.5" style={{ color: 'var(--warning-500)' }}>
            ({drift.grams > 0 ? '+' : '−'}
            {formatGrams(Math.abs(drift.grams))})
          </span>
        )}
      </span>
      <Gap />
    </>
  );
}

/** Free-text note the customer left on this line. */
export function NoteRow({ note }: { note: string }) {
  return (
    <>
      <Gap />
      <span className="flex items-start gap-1 text-fs-xs text-[var(--fg-muted)] italic ps-[var(--s-2)]">
        <EditIcon className="w-3 h-3 shrink-0 mt-0.5" />
        <span className="min-w-0">&ldquo;{note}&rdquo;</span>
      </span>
      <Gap />
    </>
  );
}

/** One regular (non-combo) line of the ticket. */
export function TicketLineRow({
  item,
  hasBalance,
  showRule,
  t,
}: {
  item: OrderItem;
  hasBalance: boolean;
  /** Half-weight separator above every line but the first of its section. */
  showRule: boolean;
  t: (k: string) => string;
}) {
  const variantText = variantChipText(item);
  const showUnpaidChip = hasBalance && item.billed_at == null;

  return (
    <div
      className={`${TICKET_GRID} py-[var(--s-2)] ${
        showRule ? 'border-t border-[color-mix(in_oklab,var(--line)_55%,transparent)]' : ''
      }`}
    >
      {/* The quantity lives in the margin. A single unit stays quiet; two or
          more is operationally significant, so it takes full weight. */}
      <span
        className={`num text-fs-sm text-end ${
          item.quantity > 1 ? 'font-semibold text-[var(--fg)]' : 'text-[var(--fg-subtle)]'
        }`}
      >
        {item.quantity}×
      </span>

      <span className="min-w-0 flex items-center gap-2 flex-wrap">
        <span className="text-fs-md font-medium tracking-[-0.006em] text-[var(--fg)]">
          {item.name}
        </span>
        {variantText && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-[-0.005em]"
            style={{
              background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
              color: 'var(--brand-500)',
            }}
          >
            {variantText}
          </span>
        )}
        {showUnpaidChip && <Badge tone="warning">{t('notPaidChip')}</Badge>}
      </span>

      <Money value={item.price * item.quantity} className="text-fs-sm text-end text-[var(--fg)]" />

      <ModifierRows item={item} />
      <WeightRow item={item} />
      {item.notes && <NoteRow note={item.notes} />}

      {item.quantity > 1 && (
        <>
          <Gap />
          <Gap />
          <span className="num text-fs-xs text-end text-[var(--fg-subtle)]">
            <Money value={item.price} /> × {item.quantity}
          </span>
        </>
      )}
    </div>
  );
}
