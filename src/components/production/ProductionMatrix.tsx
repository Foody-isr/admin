'use client';

import { useI18n } from '@/lib/i18n';
import { ProductionSheetResponse } from '@/lib/api';

interface Props {
  sheet: ProductionSheetResponse;
  onRowClick: (orderId: number) => void;
}

function cell(value: number | undefined, measure: 'weight' | 'unit'): string {
  if (!value) return '0';
  return measure === 'weight' ? value.toLocaleString() : String(value);
}

/** "Par client" grid: customer rows × item columns, category-grouped, with gram subtotals and a TOTAL row. */
export function ProductionMatrix({ sheet, onRowClick }: Props) {
  const { t } = useI18n();
  const itemsById = new Map(sheet.items.map((i) => [i.menu_item_id, i]));
  const cats = sheet.categories;

  const catSubtotal = (cells: Record<string, number>, itemIds: number[]) =>
    itemIds.reduce((sum, id) => sum + (cells[String(id)] ?? 0), 0);
  const colTotal = (id: number) => itemsById.get(id)?.total ?? 0;

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1 overflow-x-auto">
      <div className="px-[var(--s-5)] py-[var(--s-4)] border-b border-[var(--line)]">
        <span className="text-fs-sm font-semibold">{t('productionByClient')}</span>
      </div>
      <table className="w-full text-fs-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left px-[var(--s-3)] py-[var(--s-2)] text-fs-xs uppercase tracking-[0.04em] text-[var(--fg-muted)]">
              {t('productionClient')}
            </th>
            {cats.map((cat) => (
              <th
                key={`h-${cat.id}`}
                colSpan={cat.item_ids.length + (cat.measure === 'weight' ? 1 : 0)}
                className="px-[var(--s-3)] py-[var(--s-1)] text-fs-xs uppercase tracking-[0.05em] border-b border-[var(--line)]"
              >
                {cat.name} {cat.measure === 'weight' ? '(g)' : ''}
              </th>
            ))}
          </tr>
          <tr>
            <th className="text-left px-[var(--s-3)] py-[var(--s-2)] text-fs-xs text-[var(--fg-muted)]" />
            {cats.flatMap((cat) => [
              ...cat.item_ids.map((id) => (
                <th key={`c-${id}`} className="px-[var(--s-3)] py-[var(--s-2)] text-fs-xs text-[var(--fg-muted)] whitespace-nowrap">
                  {itemsById.get(id)?.name}
                </th>
              )),
              ...(cat.measure === 'weight'
                ? [
                    <th key={`st-${cat.id}`} className="px-[var(--s-3)] py-[var(--s-2)] text-fs-xs font-semibold whitespace-nowrap">
                      {t('productionCategoryTotal')}
                    </th>,
                  ]
                : []),
            ])}
          </tr>
        </thead>
        <tbody>
          {sheet.orders.map((o) => (
            <tr
              key={o.order_id}
              onClick={() => onRowClick(o.order_id)}
              className="cursor-pointer border-b border-[var(--line)] hover:bg-orange-50/50 dark:hover:bg-orange-900/20"
            >
              <td className="text-left px-[var(--s-3)] py-[var(--s-2)] font-medium whitespace-nowrap">
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
              </td>
              {cats.flatMap((cat) => [
                ...cat.item_ids.map((id) => {
                  const item = itemsById.get(id)!;
                  const v = o.cells[String(id)];
                  return (
                    <td
                      key={`${o.order_id}-${id}`}
                      className={`text-center px-[var(--s-3)] py-[var(--s-2)] tabular-nums ${v ? '' : 'text-[var(--fg-subtle)]'}`}
                    >
                      {cell(v, item.measure)}
                    </td>
                  );
                }),
                ...(cat.measure === 'weight'
                  ? [
                      <td
                        key={`${o.order_id}-st-${cat.id}`}
                        className="text-center px-[var(--s-3)] py-[var(--s-2)] tabular-nums font-semibold bg-[var(--surface-2)]"
                      >
                        {catSubtotal(o.cells, cat.item_ids).toLocaleString()}
                      </td>,
                    ]
                  : []),
              ])}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold border-t-2 border-[var(--fg)]">
            <td className="text-left px-[var(--s-3)] py-[var(--s-2)]">{t('productionTotal')}</td>
            {cats.flatMap((cat) => [
              ...cat.item_ids.map((id) => (
                <td key={`t-${id}`} className="text-center px-[var(--s-3)] py-[var(--s-2)] tabular-nums">
                  {colTotal(id).toLocaleString()}
                </td>
              )),
              ...(cat.measure === 'weight'
                ? [
                    <td key={`t-st-${cat.id}`} className="text-center px-[var(--s-3)] py-[var(--s-2)] tabular-nums">
                      {cat.item_ids.reduce((s, id) => s + colTotal(id), 0).toLocaleString()}
                    </td>,
                  ]
                : []),
            ])}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
