'use client';

import { useState } from 'react';
import { Columns3Icon, GripVerticalIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { OrdersTableColumns } from '@/lib/orders/useOrdersTableConfig';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';

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
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-ring"
          aria-label={t('columns')}
          title={t('columns')}
        >
          <Columns3Icon className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col gap-[var(--s-3)] p-[var(--s-4)]">
        <div className="flex flex-col gap-1">
          <span className="text-fs-sm font-medium text-[var(--fg)]">{t('columns')}</span>
          <span className="text-fs-xs text-[var(--fg-muted)]">{t('columnsSharedHint')}</span>
        </div>
        <ul className="flex flex-col">
          {columns.columns.map((col) => (
            <li
              key={col.key}
              draggable
              className={`flex cursor-grab select-none items-center gap-[var(--s-2)] rounded-standard px-2 py-1.5 transition-colors hover:bg-[var(--surface-2)] active:cursor-grabbing ${
                overKey === col.key && dragKey !== null ? 'bg-[var(--surface-2)]' : ''
              } ${dragKey === col.key ? 'opacity-50' : ''}`}
              onDragStart={(event) => {
                setDragKey(col.key);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', col.key);
              }}
              onDragOver={(event) => {
                if (dragKey === null) return;
                event.preventDefault();
                if (col.key !== overKey) setOverKey(col.key);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragKey !== null && dragKey !== col.key) columns.move(dragKey, col.key);
                clearDrag();
              }}
              onDragEnd={clearDrag}
            >
              <GripVerticalIcon className="size-4 shrink-0 text-[var(--fg-muted)]" />
              <Checkbox
                id={`col-${col.key}`}
                checked={col.visible}
                onCheckedChange={(checked) => columns.toggle(col.key, checked === true)}
              />
              <label htmlFor={`col-${col.key}`} className="flex-1 cursor-pointer text-fs-sm text-fg-primary">
                {t(col.labelKey)}
              </label>
            </li>
          ))}
        </ul>
        {columns.hasCustom && (
          <button
            type="button"
            onClick={columns.reset}
            className="self-start text-fs-xs font-medium text-[var(--fg-muted)] transition-colors hover:text-fg-primary"
          >
            {t('resetColumns')}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
