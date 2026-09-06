'use client';

import { useState } from 'react';
import { Columns3Icon, GripVerticalIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { OrdersTableColumns } from '@/lib/orders/useOrdersTableConfig';
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';

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
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2">
        <Columns3Icon className="size-4 text-[var(--fg-muted)]" />
        {t('columns')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72">
        <DropdownMenuLabel>{t('columns')}</DropdownMenuLabel>
        <p className="px-2 pb-2 text-fs-xs text-[var(--fg-muted)]">{t('columnsSharedHint')}</p>
        {columns.columns.map((col) => (
          <DropdownMenuCheckboxItem
            key={col.key}
            checked={col.visible}
            onCheckedChange={(checked) => columns.toggle(col.key, checked === true)}
            onSelect={(event) => event.preventDefault()}
            draggable
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
            className={`${
              overKey === col.key && dragKey !== null ? 'bg-[var(--surface-2)]' : ''
            } ${dragKey === col.key ? 'opacity-50' : ''}`}
          >
            <GripVerticalIcon className="size-4 cursor-grab text-[var(--fg-muted)] active:cursor-grabbing" />
            <span className="flex-1">{t(col.labelKey)}</span>
          </DropdownMenuCheckboxItem>
        ))}
        {columns.hasCustom && (
          <DropdownMenuItem onSelect={columns.reset}>
            {t('resetColumns')}
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
