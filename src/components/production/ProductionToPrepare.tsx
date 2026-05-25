'use client';

import { useI18n } from '@/lib/i18n';
import { ProductionSheetResponse, ProductionSheetItem } from '@/lib/api';

interface Props {
  sheet: ProductionSheetResponse;
}

function formatTotal(item: ProductionSheetItem): string {
  if (item.measure === 'weight') return `${item.total.toLocaleString()} g`;
  return `${item.total}`;
}

/** "À préparer" cook-list: one card per item, grouped by category, with total + packaging chips. */
export function ProductionToPrepare({ sheet }: Props) {
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
                return (
                  <div key={id} className="flex border border-[var(--line)] rounded-r-lg overflow-hidden">
                    <div
                      className="min-w-[84px] flex items-center justify-center text-fs-2xl font-bold tabular-nums text-[var(--brand-500)]"
                      style={{ background: 'color-mix(in oklab, var(--brand-500) 7%, transparent)' }}
                    >
                      {formatTotal(item)}
                    </div>
                    <div className="flex-1 px-[var(--s-3)] py-[var(--s-2)]">
                      <p className="text-fs-sm font-semibold truncate">{item.name}</p>
                      {item.measure === 'weight' && item.packaging && item.packaging.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {item.packaging.map((p) => (
                            <span
                              key={p.portion_g}
                              className="text-fs-xs px-2 py-0.5 rounded-r-xl border border-[var(--line)] text-[var(--fg-muted)]"
                            >
                              {p.count} × {p.portion_g} g
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
