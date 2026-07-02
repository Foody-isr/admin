'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { GripVerticalIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { ProductionSheetResponse, ProductionSheetItem, ProductionSheetPortion } from '@/lib/api';
import {
  DataTable,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table/DataTable';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { packIntoBoxes, cellPortionBreakdown } from '@/lib/production';
import { reorder } from '@/lib/production-column-order';

interface Props {
  sheet: ProductionSheetResponse;
  onRowClick: (orderId: number) => void;
  /** menu_item_id -> available portion sizes (grams) from the article's variants. */
  availablePortions?: Record<number, number[]>;
  /** Page-wide box size (grams) to repack every weighed column by; null = Auto. */
  boxSize?: number | null;
  /** Pin the 3-row header + first column, scrolling the grid inside its own
   *  viewport. Enabled for the main/fullscreen table; off for split views. */
  sticky?: boolean;
  /** Persist a new category-band order after a drag (whole-block move). When
   *  both reorder callbacks are set, column drag-reordering is enabled. */
  onReorderCategories?: (categoryIds: number[]) => void;
  /** Persist a new item-column order within a category after a drag. */
  onReorderItems?: (categoryId: number, itemIds: number[]) => void;
}

function cellVal(value: number | undefined, measure: 'weight' | 'unit'): string {
  if (!value) return '0';
  return measure === 'weight' ? value.toLocaleString() : String(value);
}
function fmtTotal(item: ProductionSheetItem): string {
  return item.measure === 'weight' ? item.total.toLocaleString() : String(item.total);
}
/** Render a weighed provenance quantity with its packaging breakdown so that
 *  e.g. 2×250 g doesn't read as a single 500 g portion. Falls back to a plain
 *  "<qty> g" when there's no breakdown or it's just a single 1×N container. */
function fmtProvQty(qty: number, measure: 'weight' | 'unit', portions?: ProductionSheetPortion[]): string {
  if (measure !== 'weight') return String(qty);
  const isTrivial =
    !portions || portions.length === 0 || (portions.length === 1 && portions[0].count === 1);
  if (isTrivial) return `${qty} g`;
  return portions.map((p) => `${p.count}×${p.portion_g}`).join(' + ') + ' g';
}

const HEAD_ROW = 'bg-neutral-50 dark:bg-[#0a0a0a] border-b border-neutral-200 dark:border-neutral-800';
// Header cells need their own background (not just the row's) so sticky header
// cells never let body content show through as the grid scrolls under them.
const HEAD_BG = 'bg-neutral-50 dark:bg-[#0a0a0a]';
// Sticky-left column header cells sit above the body's sticky-left cells (z-10)
// during horizontal scroll; the corner cells bump higher via inline z when the
// header is also pinned vertically.
const STICKY_LEFT = `sticky left-0 z-20 ${HEAD_BG}`;
// Brand orange in both themes (overrides DataTableHeadCell's dark:text-neutral-300).
const BRAND_TXT = 'text-[var(--brand-500)] dark:text-[var(--brand-500)]';
// Highlight shown on the column a dragged header is hovering over.
const DROP_TARGET = 'shadow-[inset_2px_0_0_0_var(--brand-500)]';

// Crosshair hover: the whole hovered row and column get a translucent tint;
// sticky cells use an opaque variant so scrolling body content never shows
// through them; the exact hovered cell gets a 1px brand border.
const CROSS_TINT = 'bg-orange-100/60 dark:bg-orange-900/25';
const CROSS_STICKY = 'bg-orange-100 dark:bg-orange-950';
const CELL_BORDER = 'shadow-[inset_0_0_0_1px_var(--brand-500)]';

/** "Par client" production grid, built on the shared DataTable so it matches the
 *  orders table's fonts/styles. Slim category band, item-name header, an
 *  "À préparer" totals row, and a sticky-left Client column. Optionally pins the
 *  whole header (sticky) and lets columns be drag-reordered. */
export function ProductionMatrix({
  sheet,
  onRowClick,
  availablePortions,
  boxSize,
  sticky = false,
  onReorderCategories,
  onReorderItems,
}: Props) {
  const { t } = useI18n();
  const itemsById = new Map(sheet.items.map((i) => [i.menu_item_id, i]));
  const cats = sheet.categories;
  const editable = !!(onReorderCategories && onReorderItems);

  // ── Sticky header: measure cumulative row heights so each of the three header
  // rows pins at the right offset (heights vary — the "À préparer" row wraps). ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const [rowTops, setRowTops] = useState<number[]>([0, 0, 0]);
  const [maxHeight, setMaxHeight] = useState<number>();

  useEffect(() => {
    if (!sticky) {
      setMaxHeight(undefined);
      return;
    }
    const thead = theadRef.current;
    const box = scrollRef.current;
    const recompute = () => {
      if (thead) {
        let acc = 0;
        const tops: number[] = [];
        for (const row of Array.from(thead.rows)) {
          tops.push(acc);
          acc += row.getBoundingClientRect().height;
        }
        setRowTops(tops);
      }
      if (box) {
        const top = box.getBoundingClientRect().top;
        // Fill from the grid's top to the bottom of the viewport (min height keeps
        // it usable if it starts low on the page).
        setMaxHeight(Math.max(260, window.innerHeight - top - 16));
      }
    };
    recompute();
    // ResizeObserver on body catches fullscreen enter/exit (layout changes with
    // no resize event) and content-driven header-height changes.
    const ro = new ResizeObserver(recompute);
    if (thead) Array.from(thead.rows).forEach((r) => ro.observe(r));
    ro.observe(document.body);
    window.addEventListener('resize', recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [sticky, cats.length]);

  // top offset for header row i (only when pinned).
  const topOf = (i: number): number | undefined => (sticky ? rowTops[i] ?? 0 : undefined);
  // `print:static` drops the pin when printing so the kitchen sheet lays the
  // header out normally (a sticky header would otherwise render oddly on paper).
  const stickyRow = sticky ? 'sticky print:static' : '';

  // ── Column drag state (header reordering) ──
  const [dragCat, setDragCat] = useState<number | null>(null);
  const [overCat, setOverCat] = useState<number | null>(null);
  const [dragItem, setDragItem] = useState<{ cat: number; id: number } | null>(null);
  const [overItem, setOverItem] = useState<number | null>(null);
  const clearDrag = () => {
    setDragCat(null);
    setOverCat(null);
    setDragItem(null);
    setOverItem(null);
  };

  // ── Crosshair hover state (row = order_id, col = menu_item_id) ──
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const clearHover = () => {
    setHoverRow(null);
    setHoverCol(null);
  };

  return (
    <DataTable
      ref={scrollRef}
      responsive={false}
      onMouseLeave={clearHover}
      // Cap height + scroll internally when pinned, but reset both under print so
      // window.print() emits the full table instead of just the visible window.
      className={
        sticky
          ? 'overflow-auto print:overflow-visible max-h-[var(--prod-max-h,none)] print:max-h-none'
          : 'overflow-x-auto'
      }
      style={sticky && maxHeight ? ({ '--prod-max-h': `${maxHeight}px` } as CSSProperties) : undefined}
    >
      <thead ref={theadRef}>
        {/* category band — a slim caption, not a full header. Drag to reorder
            the whole category block. */}
        <tr className={HEAD_ROW}>
          <th
            className={`${STICKY_LEFT} ${stickyRow} px-4 py-1.5`}
            style={{ top: topOf(0), zIndex: sticky ? 30 : undefined }}
          />
          {cats.map((cat) => (
            <th
              key={`g-${cat.id}`}
              colSpan={cat.item_ids.length || 1}
              draggable={editable}
              onDragStart={
                editable
                  ? (e) => {
                      setDragCat(cat.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', `cat:${cat.id}`);
                    }
                  : undefined
              }
              onDragOver={
                editable
                  ? (e) => {
                      if (dragCat === null) return;
                      e.preventDefault();
                      if (cat.id !== overCat) setOverCat(cat.id);
                    }
                  : undefined
              }
              onDrop={
                editable
                  ? (e) => {
                      e.preventDefault();
                      if (dragCat !== null && dragCat !== cat.id) {
                        onReorderCategories!(reorder(cats.map((c) => c.id), dragCat, cat.id));
                      }
                      clearDrag();
                    }
                  : undefined
              }
              onDragEnd={editable ? clearDrag : undefined}
              className={`${stickyRow} ${HEAD_BG} group px-4 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-[var(--fg-muted)] ${
                editable ? 'cursor-grab active:cursor-grabbing select-none' : ''
              } ${overCat === cat.id && dragCat !== null ? DROP_TARGET : ''}`}
              style={{ top: topOf(0), zIndex: sticky ? 20 : undefined }}
            >
              <span className="inline-flex items-center gap-1">
                {editable && (
                  <GripVerticalIcon className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                )}
                {cat.name} {cat.measure === 'weight' ? '(g)' : '(u.)'}
              </span>
            </th>
          ))}
        </tr>

        {/* item names — drag to reorder a column within its category */}
        <tr className={HEAD_ROW}>
          <DataTableHeadCell
            className={`${STICKY_LEFT} ${stickyRow}`}
            style={{ top: topOf(1), zIndex: sticky ? 30 : undefined }}
          >
            {t('productionClient')}
          </DataTableHeadCell>
          {cats.flatMap((cat) =>
            cat.item_ids.map((id) => {
              const item = itemsById.get(id);
              return (
                <DataTableHeadCell
                  key={`n-${id}`}
                  align="center"
                  draggable={editable}
                  onMouseEnter={() => {
                    setHoverCol(id);
                    setHoverRow(null);
                  }}
                  onDragStart={
                    editable
                      ? (e) => {
                          setDragItem({ cat: cat.id, id });
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', `item:${id}`);
                        }
                      : undefined
                  }
                  onDragOver={
                    editable
                      ? (e) => {
                          if (!dragItem || dragItem.cat !== cat.id) return; // items reorder within their category
                          e.preventDefault();
                          if (id !== overItem) setOverItem(id);
                        }
                      : undefined
                  }
                  onDrop={
                    editable
                      ? (e) => {
                          e.preventDefault();
                          if (dragItem && dragItem.cat === cat.id && dragItem.id !== id) {
                            onReorderItems!(cat.id, reorder(cat.item_ids, dragItem.id, id));
                          }
                          clearDrag();
                        }
                      : undefined
                  }
                  onDragEnd={editable ? clearDrag : undefined}
                  className={`${stickyRow} ${hoverCol === id ? `${CROSS_STICKY} ${BRAND_TXT}` : HEAD_BG} group whitespace-nowrap ${
                    editable ? 'cursor-grab active:cursor-grabbing select-none' : ''
                  } ${overItem === id && dragItem ? DROP_TARGET : ''}`}
                  style={{ top: topOf(1), zIndex: sticky ? 20 : undefined }}
                >
                  <span className="inline-flex items-center gap-1">
                    {editable && (
                      <GripVerticalIcon className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
                    )}
                    {item?.name}
                  </span>
                </DataTableHeadCell>
              );
            }),
          )}
        </tr>

        {/* À préparer totals — part of the header block, marked by bold orange numbers */}
        <tr className={`${HEAD_ROW} border-b-2 border-neutral-300 dark:border-neutral-700`}>
          <DataTableHeadCell
            className={`${STICKY_LEFT} ${stickyRow} ${BRAND_TXT}`}
            style={{ top: topOf(2), zIndex: sticky ? 30 : undefined }}
          >
            {t('productionToPrepare')}
          </DataTableHeadCell>
          {cats.flatMap((cat) =>
            cat.item_ids.map((id) => {
              const item = itemsById.get(id)!;
              // When the user picks a box size, repack the column total into the
              // fewest containers using the article's portions (chosen size as
              // the largest box). In "Auto" the breakdown mirrors the client cells
              // as displayed (2 cells of 500 read as "2×500"), so the header maps
              // line-for-line to the column instead of the raw ordered portions.
              const chosen = boxSize;
              const boxes =
                item.measure !== 'weight'
                  ? null
                  : chosen
                    ? packIntoBoxes(item.total, chosen, availablePortions?.[id] ?? [])
                    : cellPortionBreakdown(sheet.orders.map((o) => o.cells[String(id)]));
              return (
                <DataTableHeadCell
                  key={`tt-${id}`}
                  align="center"
                  className={`${stickyRow} ${hoverCol === id ? CROSS_STICKY : HEAD_BG} ${BRAND_TXT}`}
                  style={{ top: topOf(2), zIndex: sticky ? 20 : undefined }}
                >
                  {/* Total is intentionally not flagged for combos: a column total can mix
                      combo and non-combo items, so the dotted flag belongs on cells only. */}
                  <span className="text-base font-extrabold tabular-nums normal-case">{fmtTotal(item)}</span>
                  {boxes && boxes.length > 0 && (
                    <span className="block mt-0.5 text-[10px] font-medium normal-case tracking-normal text-[var(--fg-muted)]">
                      {boxes.map((b) => `${b.count}×${b.portion}`).join(' · ')}
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
            <DataTableCell
              onMouseEnter={() => {
                setHoverRow(o.order_id);
                setHoverCol(null);
              }}
              className={`sticky left-0 z-10 font-medium whitespace-nowrap transition-colors ${
                hoverRow === o.order_id
                  ? `${CROSS_STICKY} ${BRAND_TXT} font-semibold`
                  : 'bg-white dark:bg-[#111111]'
              }`}
            >
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
                const prov = o.provenance?.[String(id)];
                const rowActive = hoverRow === o.order_id;
                const colActive = hoverCol === id;
                return (
                  <DataTableCell
                    key={`${o.order_id}-${id}`}
                    align="center"
                    onMouseEnter={() => {
                      setHoverRow(o.order_id);
                      setHoverCol(id);
                    }}
                    className={`tabular-nums transition-colors ${
                      v ? '' : 'text-[var(--fg-subtle)]'
                    } ${rowActive || colActive ? CROSS_TINT : ''} ${
                      rowActive && colActive ? CELL_BORDER : ''
                    }`}
                  >
                    {prov ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help underline decoration-dotted decoration-[var(--brand-500)] underline-offset-4">
                            {cellVal(v, item.measure)}
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand-500)]"
                              aria-hidden
                            />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {prov.combos.map((c) => (
                            <span key={c.name} className="block">
                              {fmtProvQty(c.qty, item.measure, c.portions)} {item.name} ({c.name})
                            </span>
                          ))}
                          {prov.standalone > 0 && (
                            <span className="block opacity-80">
                              {fmtProvQty(prov.standalone, item.measure, prov.standalone_portions)} {item.name} (
                              {t('productionIndividual')})
                            </span>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      cellVal(v, item.measure)
                    )}
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
