'use client';

import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { fetchKitchenPlanIngredients } from '@/lib/api';

interface Props {
  restaurantId: number;
  date: string;
}

interface Line {
  name: string;
  qty: number;
  unit: string;
}

/** Market shopping list: aggregated raw ingredients for the day, print/export-first. */
export function ProductionShoppingList({ restaurantId, date }: Props) {
  const { t } = useI18n();
  const [lines, setLines] = useState<Line[]>([]);
  const [sortByQty, setSortByQty] = useState(true);

  useEffect(() => {
    fetchKitchenPlanIngredients(restaurantId, date).then((resp) => {
      const acc = new Map<string, Line>();
      for (const item of resp.items ?? []) {
        for (const s of [...(item.stock_lines ?? []), ...(item.prep_lines ?? [])]) {
          const key = `${s.name}__${s.unit}`;
          const prev = acc.get(key);
          if (prev) prev.qty += s.total_qty;
          else acc.set(key, { name: s.name, qty: s.total_qty, unit: s.unit });
        }
      }
      setLines(Array.from(acc.values()));
    });
  }, [restaurantId, date]);

  const sorted = useMemo(
    () => [...lines].sort((a, b) => (sortByQty ? b.qty - a.qty : a.name.localeCompare(b.name))),
    [lines, sortByQty],
  );

  const exportCsv = () => {
    const rows = [['Ingredient', 'Quantity', 'Unit'], ...sorted.map((l) => [l.name, String(l.qty), l.unit])];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `courses-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1">
      <div className="px-[var(--s-5)] py-[var(--s-4)] border-b border-[var(--line)] flex items-center justify-between">
        <span className="text-fs-sm font-semibold">{t('productionShoppingList')}</span>
        <div className="flex gap-[var(--s-2)]">
          <button onClick={() => setSortByQty((v) => !v)} className="text-fs-xs px-2 py-1 rounded-r-sm border border-[var(--line)]">
            {sortByQty ? 'Qty' : 'A–Z'}
          </button>
          <button onClick={exportCsv} className="text-fs-xs px-2 py-1 rounded-r-sm border border-[var(--line)]">
            {t('productionExport')}
          </button>
          <button onClick={() => window.print()} className="text-fs-xs px-2 py-1 rounded-r-sm bg-[var(--brand-500)] text-white">
            {t('productionPrintKitchen')}
          </button>
        </div>
      </div>
      <ul className="divide-y divide-[var(--line)]">
        {sorted.map((l) => (
          <li key={`${l.name}-${l.unit}`} className="px-[var(--s-5)] py-[var(--s-2)] flex justify-between">
            <span className="text-fs-sm">{l.name}</span>
            <span className="text-fs-sm font-semibold tabular-nums">
              {l.qty.toLocaleString()} {l.unit}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
