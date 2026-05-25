'use client';

import { useI18n } from '@/lib/i18n';
import { ProductionSheetResponse, ProductionSheetItem } from '@/lib/api';
import {
  DataTable,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table/DataTable';

interface Props {
  sheet: ProductionSheetResponse;
  onRowClick: (orderId: number) => void;
}

// Opaque brand tint for the "À préparer" totals row (sticky cells must be opaque).
const TOTAL_BG = 'color-mix(in oklab, var(--brand-500) 12%, var(--surface))';

function cellVal(value: number | undefined, measure: 'weight' | 'unit'): string {
  if (!value) return '0';
  return measure === 'weight' ? value.toLocaleString() : String(value);
}
function fmtTotal(item: ProductionSheetItem): string {
  return item.measure === 'weight' ? item.total.toLocaleString() : String(item.total);
}

const HEAD_ROW = 'bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-800';
const STICKY_HEAD = 'sticky left-0 z-20 bg-neutral-50 dark:bg-[#0a0a0a]';

/** "Par client" production grid, built on the shared DataTable so it matches the
 *  orders table's fonts/styles. Slim category band, item-name header, an
 *  "À préparer" totals row, and a sticky-left Client column. */
export function ProductionMatrix({ sheet, onRowClick }: Props) {
  const { t } = useI18n();
  const itemsById = new Map(sheet.items.map((i) => [i.menu_item_id, i]));
  const cats = sheet.categories;

  return (
    <DataTable responsive={false} className="overflow-x-auto">
      <thead>
        {/* category band — a slim caption, not a full header */}
        <tr className={HEAD_ROW}>
          <th className={`${STICKY_HEAD} px-4 py-1.5`} />
          {cats.map((cat) => (
            <th
              key={`g-${cat.id}`}
              colSpan={cat.item_ids.length}
              className="px-4 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)]"
            >
              {cat.name} {cat.measure === 'weight' ? '(g)' : '(u.)'}
            </th>
          ))}
        </tr>

        {/* item names */}
        <tr className={HEAD_ROW}>
          <DataTableHeadCell className={STICKY_HEAD}>{t('productionClient')}</DataTableHeadCell>
          {cats.flatMap((cat) =>
            cat.item_ids.map((id) => (
              <DataTableHeadCell key={`n-${id}`} align="center" className="whitespace-nowrap">
                {itemsById.get(id)?.name}
              </DataTableHeadCell>
            )),
          )}
        </tr>

        {/* À préparer totals — the fridge-puller's row */}
        <tr className="border-b-2 border-neutral-300 dark:border-neutral-700">
          <DataTableHeadCell className="sticky left-0 z-20 text-[var(--brand-500)]" style={{ background: TOTAL_BG }}>
            {t('productionToPrepare')}
          </DataTableHeadCell>
          {cats.flatMap((cat) =>
            cat.item_ids.map((id) => {
              const item = itemsById.get(id)!;
              return (
                <DataTableHeadCell key={`tt-${id}`} align="center" className="text-[var(--brand-500)]" style={{ background: TOTAL_BG }}>
                  <span className="text-base font-extrabold tabular-nums normal-case">{fmtTotal(item)}</span>
                  {item.measure === 'weight' && item.packaging && item.packaging.length > 0 && (
                    <span className="block mt-0.5 text-[10px] font-medium normal-case tracking-normal text-[var(--fg-muted)]">
                      {item.packaging.map((p) => `${p.count}×${p.portion_g}`).join(' · ')}
                    </span>
                  )}
                </DataTableHeadCell>
              );
            }),
          )}
        </tr>
      </thead>

      <DataTableBody>
        {sheet.orders.map((o) => (
          <DataTableRow
            key={o.order_id}
            striped={false}
            onClick={() => onRowClick(o.order_id)}
            className="cursor-pointer"
          >
            <DataTableCell className="sticky left-0 z-10 bg-white dark:bg-[#111111] font-medium whitespace-nowrap">
              {o.customer_name}
              <span
                className={`ms-2 text-fs-micro px-2 py-0.5 rounded-r-sm ${
                  o.order_type === 'delivery'
                    ? 'bg-[var(--info-50)] text-[var(--info-500)]'
                    : 'bg-[var(--success-50)] text-[var(--success-500)]'
                }`}
              >
                {o.order_type === 'delivery' ? '🚚' : '🛍'} {o.window_start ?? ''}
              </span>
            </DataTableCell>
            {cats.flatMap((cat) =>
              cat.item_ids.map((id) => {
                const item = itemsById.get(id)!;
                const v = o.cells[String(id)];
                return (
                  <DataTableCell
                    key={`${o.order_id}-${id}`}
                    align="center"
                    className={`tabular-nums ${v ? '' : 'text-[var(--fg-subtle)]'}`}
                  >
                    {cellVal(v, item.measure)}
                  </DataTableCell>
                );
              }),
            )}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
