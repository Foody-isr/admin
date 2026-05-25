'use client';

import { useI18n } from '@/lib/i18n';
import { ProductionSheetResponse, ProductionSheetItem } from '@/lib/api';

interface Props {
  sheet: ProductionSheetResponse;
  onRowClick: (orderId: number) => void;
}

function cell(value: number | undefined, measure: 'weight' | 'unit'): string {
  if (!value) return '0';
  return measure === 'weight' ? value.toLocaleString() : String(value);
}
function fmtTotal(item: ProductionSheetItem): string {
  return item.measure === 'weight' ? item.total.toLocaleString() : String(item.total);
}

// Opaque backgrounds are required on every sticky cell so scrolling content
// doesn't bleed through. Totals row uses a brand tint mixed onto the surface.
const TOTAL_BG = 'color-mix(in oklab, var(--brand-500) 12%, var(--surface))';

/** Frozen grid: sticky item-name header, sticky "À préparer" totals row on top
 *  (with packaging), sticky Client column. Everything in one scroll box. */
export function ProductionMatrix({ sheet, onRowClick }: Props) {
  const { t } = useI18n();
  const itemsById = new Map(sheet.items.map((i) => [i.menu_item_id, i]));
  const cats = sheet.categories;

  const catSubtotal = (cells: Record<string, number>, itemIds: number[]) =>
    itemIds.reduce((sum, id) => sum + (cells[String(id)] ?? 0), 0);
  const colTotal = (id: number) => itemsById.get(id)?.total ?? 0;
  const catColTotal = (itemIds: number[]) => itemIds.reduce((s, id) => s + colTotal(id), 0);

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1">
      <div className="px-[var(--s-5)] py-[var(--s-4)] border-b border-[var(--line)]">
        <span className="text-fs-sm font-semibold">{t('productionByClient')}</span>
      </div>

      <div className="overflow-auto max-h-[calc(100vh-220px)] print:max-h-none print:overflow-visible">
        <table className="w-full text-fs-sm border-separate border-spacing-0">
          <thead>
            {/* Row 1: category group labels (sticky top) */}
            <tr className="h-7">
              <th className="sticky left-0 top-0 z-30 bg-[var(--surface)] border-b border-[var(--line)]" />
              {cats.map((cat) => (
                <th
                  key={`g-${cat.id}`}
                  colSpan={cat.item_ids.length + (cat.measure === 'weight' ? 1 : 0)}
                  className="sticky top-0 z-20 bg-[var(--surface)] border-b border-[var(--line)] px-[var(--s-3)] py-1 text-left text-[10px] uppercase tracking-[0.05em] text-[var(--fg-muted)]"
                >
                  {cat.name} {cat.measure === 'weight' ? '(g)' : '(u.)'}
                </th>
              ))}
            </tr>

            {/* Row 2: item names (sticky below group row) */}
            <tr className="h-9">
              <th className="sticky left-0 top-7 z-30 bg-[var(--surface)] border-b border-[var(--line)] px-[var(--s-3)] py-1 text-left text-fs-xs text-[var(--fg-muted)]">
                {t('productionClient')}
              </th>
              {cats.flatMap((cat) => [
                ...cat.item_ids.map((id) => (
                  <th
                    key={`n-${id}`}
                    className="sticky top-7 z-20 bg-[var(--surface)] border-b border-[var(--line)] px-[var(--s-3)] py-1 text-fs-xs text-[var(--fg-muted)] whitespace-nowrap"
                  >
                    {itemsById.get(id)?.name}
                  </th>
                )),
                ...(cat.measure === 'weight'
                  ? [
                      <th
                        key={`ns-${cat.id}`}
                        className="sticky top-7 z-20 bg-[var(--surface)] border-b border-[var(--line)] px-[var(--s-3)] py-1 text-fs-xs font-semibold whitespace-nowrap"
                      >
                        {t('productionCategoryTotal')}
                      </th>,
                    ]
                  : []),
              ])}
            </tr>

            {/* Row 3: À préparer totals (sticky below names) — the fridge-puller's row */}
            <tr>
              <th
                className="sticky left-0 top-16 z-30 border-b-2 border-[var(--fg)] px-[var(--s-3)] py-2 text-left text-fs-xs font-extrabold uppercase tracking-[0.04em] text-[var(--brand-500)]"
                style={{ background: TOTAL_BG }}
              >
                {t('productionToPrepare')}
              </th>
              {cats.flatMap((cat) => [
                ...cat.item_ids.map((id) => {
                  const item = itemsById.get(id)!;
                  return (
                    <th
                      key={`tt-${id}`}
                      className="sticky top-16 z-20 border-b-2 border-[var(--fg)] px-[var(--s-3)] py-2 text-center align-top text-[var(--brand-500)]"
                      style={{ background: TOTAL_BG }}
                    >
                      <div className="text-fs-sm font-extrabold tabular-nums">{fmtTotal(item)}</div>
                      {item.measure === 'weight' && item.packaging && item.packaging.length > 0 && (
                        <div className="mt-0.5 text-[9px] font-medium text-[var(--fg-muted)] leading-tight">
                          {item.packaging.map((p) => `${p.count}×${p.portion_g}`).join(' · ')}
                        </div>
                      )}
                    </th>
                  );
                }),
                ...(cat.measure === 'weight'
                  ? [
                      <th
                        key={`tts-${cat.id}`}
                        className="sticky top-16 z-20 border-b-2 border-[var(--fg)] px-[var(--s-3)] py-2 text-center align-top text-fs-sm font-extrabold tabular-nums text-[var(--brand-500)]"
                        style={{ background: TOTAL_BG }}
                      >
                        {catColTotal(cat.item_ids).toLocaleString()}
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
                className="cursor-pointer hover:bg-orange-50/50 dark:hover:bg-orange-900/20"
              >
                <td className="sticky left-0 z-10 bg-[var(--surface)] border-b border-[var(--line)] px-[var(--s-3)] py-[var(--s-2)] text-left font-medium whitespace-nowrap">
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
                        className={`border-b border-[var(--line)] px-[var(--s-3)] py-[var(--s-2)] text-center tabular-nums ${
                          v ? '' : 'text-[var(--fg-subtle)]'
                        }`}
                      >
                        {cell(v, item.measure)}
                      </td>
                    );
                  }),
                  ...(cat.measure === 'weight'
                    ? [
                        <td
                          key={`${o.order_id}-s-${cat.id}`}
                          className="border-b border-[var(--line)] px-[var(--s-3)] py-[var(--s-2)] text-center tabular-nums font-semibold bg-[var(--surface-2)]"
                        >
                          {catSubtotal(o.cells, cat.item_ids).toLocaleString()}
                        </td>,
                      ]
                    : []),
                ])}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
