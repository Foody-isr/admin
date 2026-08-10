'use client';

import { useI18n } from '@/lib/i18n';
import { ProductionSheetResponse, ProductionSheetItem } from '@/lib/api';
import { itemTotalValue, productionBoxes, showsUnits } from '@/lib/production';

interface Props {
  sheet: ProductionSheetResponse;
  /** Portion sizes offered per article, for the chosen box size's repacking. */
  availablePortions?: Record<number, number[]>;
  /** Page-wide box size; null = Auto (the containers clients actually ordered). */
  boxSize?: number | null;
  /** Weighed articles shown as ordered container counts instead of grams, from
   *  the page's portions/units preference — the same set the desktop matrix
   *  reads, so a choice made on either screen shows on both. */
  unitDisplayIds?: Set<number>;
}

function formatTotal(item: ProductionSheetItem, unitDisplayIds: Set<number> | undefined): string {
  const value = itemTotalValue(item, unitDisplayIds);
  if (showsUnits(item, unitDisplayIds)) return `${value} u.`;
  if (item.measure === 'weight') return `${value.toLocaleString()} g`;
  return `${value}`;
}

/** "À préparer" cook-list: one card per item, grouped by category, with total +
 *  packaging chips. Every number here comes from the helpers in lib/production —
 *  the same ones the desktop matrix header reads — so the two screens cannot
 *  portion the same sheet differently. */
export function ProductionToPrepare({
  sheet,
  availablePortions,
  boxSize,
  unitDisplayIds,
}: Props) {
  const { t } = useI18n();
  const itemsById = new Map(sheet.items.map((i) => [i.menu_item_id, i]));

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1 mb-[var(--s-4)]">
      <div className="px-[var(--s-5)] py-[var(--s-4)] border-b border-[var(--line)]">
        <span className="text-fs-sm font-semibold">{t('productionToPrepare')}</span>
      </div>
      <div className="p-[var(--s-5)] flex flex-col gap-[var(--s-5)]">
        {sheet.categories.map((cat) => (
          <div key={cat.id}>
            <p className="text-fs-xs uppercase tracking-[0.06em] font-semibold text-[var(--fg-muted)] mb-[var(--s-3)]">
              {cat.name}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--s-3)]">
              {cat.item_ids.map((id) => {
                const item = itemsById.get(id);
                if (!item) return null;
                const boxes = productionBoxes(
                  sheet.orders,
                  item,
                  boxSize,
                  availablePortions?.[id] ?? [],
                );
                return (
                  <div key={id} className="flex border border-[var(--line)] rounded-r-lg overflow-hidden">
                    <div
                      className="min-w-[84px] flex items-center justify-center text-fs-2xl font-bold tabular-nums text-[var(--brand-500)]"
                      style={{ background: 'color-mix(in oklab, var(--brand-500) 7%, transparent)' }}
                    >
                      {formatTotal(item, unitDisplayIds)}
                    </div>
                    <div className="flex-1 px-[var(--s-3)] py-[var(--s-2)]">
                      <p className="text-fs-sm font-semibold truncate">{item.name}</p>
                      {boxes.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {boxes.map((b) => (
                            <span
                              key={b.portion}
                              className="text-fs-xs px-2 py-0.5 rounded-r-xl border border-[var(--line)] text-[var(--fg-muted)]"
                            >
                              {b.count} × {b.portion} g
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
