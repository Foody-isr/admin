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

// Mirror DataTableHead's row styling (we need a multi-row header, which the
// single-row DataTableHead can't express).
const HEAD_ROW = 'bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-800';
const STICKY_HEAD = 'sticky left-0 z-20 bg-neutral-50 dark:bg-[#0a0a0a]';

/** "Par client" production grid, built on the shared DataTable so it matches the
 *  orders table's fonts/styles. Three-row header (category / item names /
 *  À préparer totals), sticky-left Client column, horizontal scroll for width. */
export function ProductionMatrix({ sheet, onRowClick }: Props) {
  const { t } = useI18n();
  const itemsById = new Map(sheet.items.map((i) => [i.menu_item_id, i]));
  const cats = sheet.categories;

  const catSubtotal = (cells: Record<string, number>, ids: number[]) =>
    ids.reduce((s, id) => s + (cells[String(id)] ?? 0), 0);
  const colTotal = (id: number) => itemsById.get(id)?.total ?? 0;
  const catColTotal = (ids: number[]) => ids.reduce((s, id) => s + colTotal(id), 0);

  return (
    <DataTable responsive={false} className="overflow-x-auto">
      <thead>
        {/* category group labels */}
        <tr className={HEAD_ROW}>
          <DataTableHeadCell className={STICKY_HEAD} />
          {cats.map((cat) => (
            <DataTableHeadCell
              key={`g-${cat.id}`}
              align="center"
              colSpan={cat.item_ids.length + (cat.measure === 'weight' ? 1 : 0)}
            >
              {cat.name} {cat.measure === 'weight' ? '(g)' : '(u.)'}
            </DataTableHeadCell>
          ))}
        </tr>

        {/* item names */}
        <tr className={HEAD_ROW}>
          <DataTableHeadCell className={STICKY_HEAD}>{t('productionClient')}</DataTableHeadCell>
          {cats.flatMap((cat) => [
            ...cat.item_ids.map((id) => (
              <DataTableHeadCell key={`n-${id}`} align="center" className="whitespace-nowrap">
                {itemsById.get(id)?.name}
              </DataTableHeadCell>
            )),
            ...(cat.measure === 'weight'
              ? [
                  <DataTableHeadCell key={`ns-${cat.id}`} align="center" className="whitespace-nowrap">
                    {t('productionCategoryTotal')}
                  </DataTableHeadCell>,
                ]
              : []),
          ])}
        </tr>

        {/* À préparer totals — the fridge-puller's row */}
        <tr className="border-b-2 border-neutral-300 dark:border-neutral-700">
          <DataTableHeadCell className="sticky left-0 z-20 text-[var(--brand-500)]" style={{ background: TOTAL_BG }}>
            {t('productionToPrepare')}
          </DataTableHeadCell>
          {cats.flatMap((cat) => [
            ...cat.item_ids.map((id) => {
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
            ...(cat.measure === 'weight'
              ? [
                  <DataTableHeadCell key={`tts-${cat.id}`} align="center" className="text-[var(--brand-500)]" style={{ background: TOTAL_BG }}>
                    <span className="text-base font-extrabold tabular-nums normal-case">
                      {catColTotal(cat.item_ids).toLocaleString()}
                    </span>
                  </DataTableHeadCell>,
                ]
              : []),
          ])}
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
            {cats.flatMap((cat) => [
              ...cat.item_ids.map((id) => {
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
              ...(cat.measure === 'weight'
                ? [
                    <DataTableCell
                      key={`${o.order_id}-s-${cat.id}`}
                      align="center"
                      className="tabular-nums font-semibold bg-neutral-50 dark:bg-[#0a0a0a]"
                    >
                      {catSubtotal(o.cells, cat.item_ids).toLocaleString()}
                    </DataTableCell>,
                  ]
                : []),
            ])}
          </DataTableRow>
        ))}
      </DataTableBody>
    </DataTable>
  );
}
