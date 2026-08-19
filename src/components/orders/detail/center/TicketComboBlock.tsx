'use client';

import { Fragment } from 'react';
import { EditIcon } from 'lucide-react';
import { Badge } from '@/components/ds';
import type { OrderItem } from '@/lib/api';
import { Money } from '../primitives/Money';
import { TICKET_GRID, variantChipText } from './TicketLineRow';

/**
 * A combo, on the same money axis as everything else.
 *
 * The header behaves exactly like a regular line — a combo is one unit, so its
 * quantity reads "1×" — and its picks hang underneath against a guide rail,
 * each on the same 28 / 1fr / 92 grid so a premium supplement's delta lands in
 * the same lane as the combo's own price.
 *
 * Combo children carry their DELTA as `price`, not a menu price: the base is on
 * `combo_price`. groupOrder() has already reconciled that, so a zero here means
 * "included", not "free".
 */
export function TicketComboBlock({
  comboName,
  comboTotal,
  comboItems,
  totalPicks,
  picksLabel,
  comboLabel,
  hasBalance,
  showRule,
  t,
}: {
  comboName: string;
  comboTotal: number;
  comboItems: OrderItem[];
  totalPicks: number;
  picksLabel: string;
  comboLabel: string;
  hasBalance: boolean;
  showRule: boolean;
  t: (k: string) => string;
}) {
  const showUnpaidChip = hasBalance && comboItems.some((ci) => ci.billed_at == null);

  return (
    <div
      className={`py-[var(--s-2)] ${
        showRule ? 'border-t border-[color-mix(in_oklab,var(--line)_55%,transparent)]' : ''
      }`}
    >
      <div className={TICKET_GRID}>
        <span className="num text-fs-sm text-end text-[var(--fg-subtle)]">1×</span>

        <span className="min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-fs-md font-medium tracking-[-0.006em] text-[var(--fg)]">
            {comboName}
          </span>
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em]"
            style={{
              background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
              color: 'var(--brand-500)',
            }}
          >
            {comboLabel}
          </span>
          {showUnpaidChip && <Badge tone="warning">{t('notPaidChip')}</Badge>}
        </span>

        <Money value={comboTotal} className="text-fs-sm text-end text-[var(--fg)]" />
      </div>

      {/* Picks — indented into the name column, against a guide rail. */}
      <div className="ms-[calc(28px+var(--s-3))] ps-[var(--s-3)] border-s border-[var(--line)] mt-[var(--s-1)]">
        <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-x-[var(--s-3)] items-baseline">
          {comboItems.map((ci) => {
            const delta = ci.price * ci.quantity;
            const subVariant = variantChipText(ci);
            return (
              <Fragment key={ci.id}>
                <span className="text-fs-xs text-[var(--fg-muted)] py-0.5 min-w-0">
                  {ci.quantity > 1 && <span className="num me-1">{ci.quantity}×</span>}
                  <span className="text-[var(--fg)]">{ci.name}</span>
                  {subVariant && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 ms-2 rounded-full text-[10px] font-medium align-middle"
                      style={{
                        background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                        color: 'var(--brand-500)',
                      }}
                    >
                      {subVariant}
                    </span>
                  )}
                  {ci.modifiers?.map((m) => (
                    <span key={m.id} className="ms-1.5">
                      <span className="num">{m.action === 'add' ? '+' : '−'}</span>
                      {m.name}
                    </span>
                  ))}
                  {ci.notes && (
                    <span className="flex items-start gap-1 italic mt-0.5">
                      <EditIcon className="w-2.5 h-2.5 shrink-0 mt-0.5" />
                      <span className="min-w-0">&ldquo;{ci.notes}&rdquo;</span>
                    </span>
                  )}
                </span>
                {delta ? (
                  <Money value={delta} signed className="text-fs-xs text-end text-[var(--fg-subtle)] py-0.5" />
                ) : (
                  <span aria-hidden />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      <div className="ms-[calc(28px+var(--s-3))] mt-[var(--s-1)] text-fs-xs text-[var(--fg-subtle)]">
        <span className="num">{totalPicks}</span> {picksLabel}
      </div>
    </div>
  );
}
