'use client';

import { Fragment } from 'react';
import { AlertTriangleIcon, ScaleIcon, ReceiptTextIcon } from 'lucide-react';
import { Button, EmptyState } from '@/components/ds';
import type { Order } from '@/lib/api';
import type { OrderCategoryGroup, OrderComboGroup } from '@/lib/orders/group-order';
import { HairlineRule } from '../primitives/HairlineRule';
import { TicketLineRow } from './TicketLineRow';
import { TicketComboBlock } from './TicketComboBlock';

/**
 * The centre column: what was ordered, set as a ticket.
 *
 * No card, no tinted section bands, no coloured quantity squares — the previous
 * version hashed each item's name into one of eight colours, which encoded
 * nothing and competed with the section headings for attention. What is left is
 * the rhythm of a printed ticket: a rule announces a section, quantities sit in
 * the margin, and every price falls down one lane.
 */
function SettlementBanner({
  tone,
  title,
  count,
  desc,
  action,
}: {
  tone: 'warning' | 'danger';
  title: string;
  /** Rendered as a figure beside the title, deliberately not interpolated into
   *  the sentence: "1 articles" needs a plural rule in three languages to say
   *  nothing a number next to the heading does not already say. */
  count?: number;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="mb-[var(--s-4)] flex items-start gap-[var(--s-3)] rounded-r-md p-[var(--s-3)]"
      style={{
        background: `color-mix(in oklab, var(--${tone}-500) 10%, var(--surface))`,
        border: `1px solid color-mix(in oklab, var(--${tone}-500) 30%, var(--line))`,
      }}
    >
      <AlertTriangleIcon
        className="size-4 shrink-0 mt-0.5"
        style={{ color: `var(--${tone}-500)` }}
      />
      <div className="flex-1 min-w-0 flex flex-col items-start gap-[var(--s-2)]">
        <span className="text-fs-sm font-semibold text-[var(--fg)]">
          {title}
          {count != null && count > 0 && (
            <span className="num ms-1.5 font-normal text-[var(--fg-muted)]">{count}</span>
          )}
        </span>
        <span className="text-fs-xs text-[var(--fg-muted)]">{desc}</span>
        {action}
      </div>
    </div>
  );
}

export function TicketItems({
  order,
  categoryGroups,
  comboGroups,
  displayedLineCount,
  totalUnits,
  onConfirmWeights,
  t,
}: {
  order: Order;
  categoryGroups: OrderCategoryGroup[];
  comboGroups: OrderComboGroup[];
  displayedLineCount: number;
  totalUnits: number;
  /** Second entry point to the confirm-weights modal, next to the lines it
   *  concerns. The command bar keeps the first one. */
  onConfirmWeights?: () => void;
  t: (k: string) => string;
}) {
  const hasBalance = (order.balance_due ?? 0) > 0;
  const isEmpty = categoryGroups.length === 0 && comboGroups.length === 0;

  const heldCount = (order.items ?? []).filter(
    (i) => i.pricing_mode === 'by_weight' && typeof i.actual_weight_grams !== 'number',
  ).length;

  // The ticket used to open with an eyebrow row — "ARTICLES" on the left, the
  // summary on the right — directly above a rule that already said the same
  // thing on the left and carried a number on the right. Two rows, ~44px, one
  // duplicated heading. displayedLineCount is by definition the sum of the
  // per-section counts, so nothing is lost by folding it in; totalUnits is the
  // one figure not already on screen, which is why the summary survives at all.
  const isLoneSection = categoryGroups.length + (comboGroups.length > 0 ? 1 : 0) === 1;
  const summary = (
    // text-fs-xs, not the rule's own 10px: this is a written-out checksum, and
    // Hebrew at 10px is not a thing you read, it is a thing you squint at.
    <span className="text-fs-xs">
      {displayedLineCount} {displayedLineCount === 1 ? t('item') : t('items')} ·{' '}
      {totalUnits} {totalUnits === 1 ? t('unit') || 'unité' : t('units') || 'unités'}
    </span>
  );

  return (
    <>
      {/* A card hold is open until staff enter the measured weights. Previously
          the only clue was a button in the command bar; the banner puts it
          beside the lines it is about. */}
      {order.settlement_status === 'held' && (
        <SettlementBanner
          tone="warning"
          title={t('weightsPending')}
          count={heldCount}
          desc={t('weightsPendingDesc')}
          action={
            onConfirmWeights && (
              <Button variant="secondary" size="sm" onClick={onConfirmWeights}>
                <ScaleIcon /> {t('confirmWeights')}
              </Button>
            )
          }
        />
      )}

      {/* The weighed total came out above the authorised hold. This state is
          rendered nowhere else in the product. */}
      {order.settlement_status === 'over_hold_flagged' && (
        <SettlementBanner
          tone="danger"
          title={t('overHoldFlagged')}
          desc={t('overHoldFlaggedDesc')}
        />
      )}

      {isEmpty ? (
        <EmptyState
          size="compact"
          icon={<ReceiptTextIcon />}
          title={t('noItems')}
        />
      ) : (
        <>
          {/* On a ticket with more than one section the summary gets its own
              opening rule: hung off "ENTRÉES" it would read as the total for
              that course. */}
          {!isLoneSection && <HairlineRule label={t('items')} count={summary} />}

          {categoryGroups.map((group) => (
            <Fragment key={group.key}>
              <HairlineRule
                label={group.label}
                count={isLoneSection ? summary : group.items.length}
              />
              {group.items.map((item, i) => (
                <TicketLineRow
                  key={item.id}
                  item={item}
                  hasBalance={hasBalance}
                  showRule={i > 0}
                  t={t}
                />
              ))}
            </Fragment>
          ))}

          {comboGroups.length > 0 && (
            <>
              <HairlineRule
                label={(t('combos') || 'Combos').toUpperCase()}
                count={isLoneSection ? summary : comboGroups.length}
              />
              {comboGroups.map((combo, gi) => {
                const totalPicks = combo.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <TicketComboBlock
                    key={combo.key}
                    comboName={combo.name}
                    comboTotal={combo.price}
                    comboItems={combo.items}
                    totalPicks={totalPicks}
                    picksLabel={totalPicks === 1 ? t('selection') : t('selections')}
                    comboLabel={(t('combo') || 'Combo').toUpperCase()}
                    hasBalance={hasBalance}
                    showRule={gi > 0}
                    t={t}
                  />
                );
              })}
            </>
          )}
        </>
      )}
    </>
  );
}
