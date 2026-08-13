'use client';

import { useState } from 'react';
import { Columns3Icon, ChevronDownIcon, GripVerticalIcon } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n } from '@/lib/i18n';
import type { OrdersTableColumns } from '@/lib/orders/useOrdersTableConfig';

/**
 * Chooses which columns the orders table shows, and in what order.
 *
 * The checkbox only hides a column, it never removes it: every column stays
 * listed here and can be brought back at any time. The layout is saved for the
 * whole restaurant, so the wording says so and the controls are only offered to
 * staff who may change settings for everyone.
 */
export function OrderColumnPicker({ columns }: { columns: OrdersTableColumns }) {
  const { t } = useI18n();
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const clearDrag = () => {
    setDragKey(null);
    setOverKey(null);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-[var(--s-2)] px-[var(--s-4)] h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] text-fs-sm font-medium hover:bg-[var(--surface-2)] transition-colors whitespace-nowrap"
        >
          <Columns3Icon className="w-4 h-4" />
          {t('columns')}
          <ChevronDownIcon className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 flex flex-col gap-[var(--s-3)] p-[var(--s-4)]">
        <div className="flex flex-col gap-1">
          <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('columns')}
          </span>
          <span className="text-fs-xs text-[var(--fg-muted)]">{t('columnsSharedHint')}</span>
        </div>

        <ul className="flex flex-col">
          {columns.columns.map((col) => (
            <li
              key={col.key}
              draggable
              onDragStart={(e) => {
                setDragKey(col.key);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', col.key);
              }}
              onDragOver={(e) => {
                if (dragKey === null) return;
                e.preventDefault();
                if (col.key !== overKey) setOverKey(col.key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragKey !== null && dragKey !== col.key) columns.move(dragKey, col.key);
                clearDrag();
              }}
              onDragEnd={clearDrag}
              className={`flex items-center gap-[var(--s-2)] rounded-standard px-2 py-1.5 cursor-grab active:cursor-grabbing select-none hover:bg-[var(--surface-2)] transition-colors ${
                overKey === col.key && dragKey !== null ? 'bg-[var(--surface-2)]' : ''
              } ${dragKey === col.key ? 'opacity-50' : ''}`}
            >
              <GripVerticalIcon className="w-4 h-4 shrink-0 text-[var(--fg-muted)]" />
              <Checkbox
                id={`col-${col.key}`}
                checked={col.visible}
                onCheckedChange={(checked) => columns.toggle(col.key, checked === true)}
              />
              <label
                htmlFor={`col-${col.key}`}
                className="flex-1 text-fs-sm text-fg-primary cursor-pointer"
              >
                {t(col.labelKey)}
              </label>
            </li>
          ))}
        </ul>

        {columns.hasCustom && (
          <button
            type="button"
            onClick={columns.reset}
            className="self-start text-fs-xs font-medium text-[var(--fg-muted)] hover:text-fg-primary transition-colors"
          >
            {t('resetColumns')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
