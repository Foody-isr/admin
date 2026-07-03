'use client';

import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  ProductionSheetResponse,
  ProductionSheetOrder,
  ProductionSheetItem,
} from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { ProductionToPrepare } from './ProductionToPrepare';

type MobileView = 'clients' | 'items' | 'status';

interface Props {
  /** Day sheet, already search-filtered + column-ordered by the page. */
  sheet: ProductionSheetResponse;
  /** Open the full order drawer. */
  onRowClick: (orderId: number) => void;
  /** Order ids marked prepared (shared, live-synced). */
  doneIds: Set<number>;
  /** Flip an order's done state. */
  onToggleDone: (orderId: number) => void;
}

/** Delivery / pickup time chip, mirroring the desktop matrix badge. */
function OrderBadge({ order }: { order: ProductionSheetOrder }) {
  const isDelivery = order.order_type === 'delivery';
  return (
    <span
      className={`ms-2 shrink-0 text-fs-micro px-2 py-0.5 rounded-r-sm font-medium ${
        isDelivery
          ? 'bg-[var(--info-50)] text-[var(--info-500)]'
          : 'bg-[var(--success-50)] text-[var(--success-500)]'
      }`}
    >
      {isDelivery ? '🚚' : '🛍'} {order.window_start ?? ''}
    </span>
  );
}

/** Weighed items read in grams, unit items as a plain count. */
function fmtQty(item: ProductionSheetItem, qty: number): string {
  return item.measure === 'weight' ? `${qty.toLocaleString()} g` : String(qty);
}

/**
 * Phone production plan. A wide clients × items matrix can't be read on a narrow
 * screen, so instead of shrinking it we drop the grid and offer a single-axis
 * lens the staffer switches between: Clients (assemble per order), Items (batch
 * cook-list), Status (what's left vs ready). Desktop keeps the matrix.
 */
export function ProductionMobile({ sheet, onRowClick, doneIds, onToggleDone }: Props) {
  const { t } = useI18n();
  const [view, setView] = useState<MobileView>('clients');

  const tabs: { key: MobileView; label: string }[] = [
    { key: 'clients', label: t('productionViewClients') },
    { key: 'items', label: t('productionViewItems') },
    { key: 'status', label: t('productionViewStatus') },
  ];

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      {/* Segmented view switcher — one axis at a time on a phone. */}
      <div className="grid grid-cols-3 gap-1 rounded-r-lg border border-[var(--line-strong)] bg-[var(--surface-2)] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`h-9 rounded-r-md text-fs-sm font-medium transition-colors ${
              view === tab.key
                ? 'bg-[var(--surface)] text-[var(--brand-500)] shadow-1'
                : 'text-[var(--fg-muted)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {view === 'clients' && (
        <ClientsView
          sheet={sheet}
          onRowClick={onRowClick}
          doneIds={doneIds}
          onToggleDone={onToggleDone}
        />
      )}
      {view === 'items' && <ProductionToPrepare sheet={sheet} />}
      {view === 'status' && (
        <StatusView
          sheet={sheet}
          onRowClick={onRowClick}
          doneIds={doneIds}
          onToggleDone={onToggleDone}
        />
      )}
    </div>
  );
}

/** One expandable card per client: tick done, tap to reveal that order's lines. */
function ClientsView({ sheet, onRowClick, doneIds, onToggleDone }: Props) {
  const { t } = useI18n();
  const itemsById = new Map(sheet.items.map((i) => [i.menu_item_id, i]));
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-[var(--s-3)]">
      {sheet.orders.map((o) => {
        const done = doneIds.has(o.order_id);
        const open = expanded.has(o.order_id);
        const lines = Object.entries(o.cells)
          .filter(([, qty]) => qty > 0)
          .map(([id, qty]) => ({ item: itemsById.get(Number(id)), qty }))
          .filter((l): l is { item: ProductionSheetItem; qty: number } => !!l.item);
        return (
          <div
            key={o.order_id}
            className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden"
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleExpand(o.order_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleExpand(o.order_id);
                }
              }}
              className="flex items-center gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-3)] cursor-pointer select-none"
            >
              <span className="inline-flex shrink-0" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={done}
                  onCheckedChange={() => onToggleDone(o.order_id)}
                  aria-label={t('productionMarkDone')}
                />
              </span>
              <span
                className={`flex-1 min-w-0 flex items-center ${done ? 'opacity-60 line-through' : ''}`}
              >
                <span className="font-medium truncate">{o.customer_name}</span>
                <OrderBadge order={o} />
              </span>
              <span className="shrink-0 text-fs-xs text-[var(--fg-muted)] tabular-nums">
                {lines.length} {t('productionItemsLabel')}
              </span>
              <ChevronDownIcon
                className={`w-4 h-4 shrink-0 text-[var(--fg-muted)] transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
              />
            </div>
            {open && (
              <div className="border-t border-[var(--line)] px-[var(--s-4)] py-[var(--s-3)] flex flex-col gap-[var(--s-2)]">
                {lines.map(({ item, qty }) => (
                  <div
                    key={item.menu_item_id}
                    className="flex items-center justify-between gap-[var(--s-3)] text-fs-sm"
                  >
                    <span className="min-w-0 truncate">{item.name}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-[var(--brand-500)]">
                      {fmtQty(item, qty)}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => onRowClick(o.order_id)}
                  className="mt-[var(--s-1)] self-start text-fs-xs font-medium text-[var(--brand-500)]"
                >
                  {t('productionOpenOrder')}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Progress overview + To-prepare / Done sections (honest to the boolean done state). */
function StatusView({ sheet, onRowClick, doneIds, onToggleDone }: Props) {
  const { t } = useI18n();
  const total = sheet.orders.length;
  const toPrepare = sheet.orders.filter((o) => !doneIds.has(o.order_id));
  const doneList = sheet.orders.filter((o) => doneIds.has(o.order_id));
  const doneCount = doneList.length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;

  const row = (o: ProductionSheetOrder) => {
    const done = doneIds.has(o.order_id);
    return (
      <div
        key={o.order_id}
        className="flex items-center gap-[var(--s-2)] px-[var(--s-4)] py-[var(--s-3)] border-t border-[var(--line)] first:border-t-0"
      >
        <span className="inline-flex shrink-0">
          <Checkbox
            checked={done}
            onCheckedChange={() => onToggleDone(o.order_id)}
            aria-label={t('productionMarkDone')}
          />
        </span>
        <button
          onClick={() => onRowClick(o.order_id)}
          className={`flex-1 min-w-0 flex items-center text-start ${
            done ? 'opacity-60 line-through' : ''
          }`}
        >
          <span className="font-medium truncate">{o.customer_name}</span>
          <OrderBadge order={o} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-[var(--s-4)]">
      <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 px-[var(--s-4)] py-[var(--s-4)]">
        <div className="flex items-center justify-between mb-[var(--s-2)] text-fs-sm font-medium">
          <span className="tabular-nums">
            {doneCount} / {total} {t('productionReady')}
          </span>
          <span className="tabular-nums text-[var(--fg-muted)]">{pct}%</span>
        </div>
        <div className="h-2 rounded-r-full bg-[var(--surface-2)] overflow-hidden">
          <div
            className="h-full rounded-r-full bg-[var(--brand-500)] transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {toPrepare.length > 0 && (
        <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden">
          <p className="px-[var(--s-4)] py-[var(--s-2)] text-fs-xs font-semibold uppercase tracking-[0.06em] text-[var(--brand-500)] bg-[var(--surface-2)]">
            {t('productionToPrepare')} ({toPrepare.length})
          </p>
          {toPrepare.map(row)}
        </div>
      )}

      {doneList.length > 0 && (
        <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 overflow-hidden">
          <p className="px-[var(--s-4)] py-[var(--s-2)] text-fs-xs font-semibold uppercase tracking-[0.06em] text-[var(--fg-muted)] bg-[var(--surface-2)]">
            {t('productionDoneDivider')} ({doneList.length})
          </p>
          {doneList.map(row)}
        </div>
      )}
    </div>
  );
}
